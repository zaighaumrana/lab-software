import { Injectable, Logger } from '@nestjs/common';
import type {
  SmsGateway,
  SmsSendParams,
  SmsSendResult,
  ProviderTemplateInfo,
} from './sms-gateway.interface';

/**
 * SendPK (https://sendpk.com) — PTA-approved local SMS aggregator.
 * Current documented API: https://sendpk.com/api.php
 *
 * Template-based, not free-text: every send carries an approved
 * `template_id` plus a JSON `message` payload of variable values — the
 * actual wording lives in SendPK's approved template, never in this file
 * or anywhere else in the codebase.
 *
 * Required env vars (see packages/database/.env.example):
 *   SENDPK_API_KEY  — from SendPK dashboard → Profile → API Key
 *   SENDPK_SENDER   — your approved Sender ID / brand name (or the shared
 *                     "SMS Alert" name until your own brand mask is approved)
 *
 * The API key is read from the environment and used server-side only — it
 * is never returned to the frontend, logged, or embedded in any bundle.
 */
@Injectable()
export class SendPkProvider implements SmsGateway {
  private readonly logger = new Logger(SendPkProvider.name);
  private readonly baseUrl = 'https://sendpk.com/api';
  private readonly appsUrl = 'https://sendpk.com/apps';
  private readonly apiKey = process.env.SENDPK_API_KEY ?? '';
  private readonly sender = process.env.SENDPK_SENDER ?? '';
  private readonly timeoutMs = 15_000;

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.sender);
  }

  getSenderId(): string {
    return this.sender;
  }

  async send(params: SmsSendParams): Promise<SmsSendResult> {
    if (!this.isConfigured()) return {success:false,failureKind:'PERMANENT',errorCode:'PROVIDER_NOT_CONFIGURED',rawResponse:'',errorMessage:'SMS provider is not configured'};
    if (!params.templateId) return {success:false,failureKind:'PERMANENT',errorCode:'MISSING_TEMPLATE',rawResponse:'',errorMessage:'Provider template is missing'};

    const body = new URLSearchParams({
      api_key: this.apiKey,
      sender: this.sender,
      mobile: params.mobile,
      template_id: params.templateId,
      message: JSON.stringify(params.variables),
      format: 'json',
    });
    if (params.unicode) {
      body.set('type', 'unicode');
    }

    try {
      const response=await this.requestText(`${this.baseUrl}/sms.php`,body);
      if (!response.ok) {
        const transient=response.status===429;
        return {success:false,failureKind:transient?'TRANSIENT':response.status>=500||response.status===408?'AMBIGUOUS':'PERMANENT',
          errorCode:transient?'RATE_LIMITED':'HTTP_REJECTION',rawResponse:JSON.stringify({httpStatus:response.status}),errorMessage:'Provider HTTP request was not accepted normally'};
      }
      return this.parseResponse(response.raw);
    } catch (e) {
      const code=(e as {cause?:{code?:string}})?.cause?.code;
      const beforeConnection=['ECONNREFUSED','ENOTFOUND','EAI_AGAIN'].includes(code??'');
      const timeout=e instanceof Error&&e.name==='AbortError';
      return {success:false,failureKind:beforeConnection?'TRANSIENT':'AMBIGUOUS',errorCode:beforeConnection?'NETWORK_UNREACHABLE':timeout?'NETWORK_TIMEOUT':'NETWORK_UNCERTAIN',
        rawResponse:'',errorMessage:beforeConnection?'Provider connection could not be established':'Provider acceptance is uncertain'};
    }
  }

  async checkDelivery(providerMessageId: string): Promise<string> {
    const response=await this.requestText(`${this.baseUrl}/delivery.php`,new URLSearchParams({api_key:this.apiKey,id:providerMessageId}));
    if (!response.ok) return 'UNKNOWN';
    let value=response.raw.trim().toUpperCase();
    try {const parsed=JSON.parse(response.raw);value=String(parsed.delivery_status??parsed.status??'').trim().toUpperCase();} catch { /* Plain text is also supported. */ }
    // No undocumented numeric delivery-code mapping or substring guessing.
    return ['DELIVERED','FAILED','PENDING'].includes(value)?value:'UNKNOWN';
  }

  private async requestText(url:string,body:URLSearchParams) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try {
      const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body.toString(),signal:controller.signal});
      const raw=await response.text(); // Timeout covers both headers and response body.
      return {ok:response.ok,status:response.status,raw};
    }finally{clearTimeout(timer);}
  }

  async checkBalance(): Promise<number | null> {
    if (!this.isConfigured()) return null;
    const params = new URLSearchParams({ api_key: this.apiKey });
    try {
      const res = await this.getWithTimeout(`${this.baseUrl}/balance.php?${params.toString()}`);
      const text = (await res.text()).trim();
      const n = Number(text);
      return Number.isFinite(n) ? n : null;
    } catch (e) {
      this.logger.warn(`SendPK balance check failed: ${this.describeNetworkError(e)}`);
      return null;
    }
  }

  /**
   * Lists the account's approved SendPK templates. This is the ONLY way
   * SendPK's documented API exposes template creation/approval — we cannot
   * create or auto-approve templates, only list what's already approved and
   * let the administrator map one to each LMS event (see Settings → SMS →
   * "Sync SENDPK Templates").
   */
  async listTemplates(): Promise<ProviderTemplateInfo[]> {
    if (!this.isConfigured()) {
      throw new Error('SENDPK_API_KEY or SENDPK_SENDER is not configured');
    }
    const params = new URLSearchParams({ api_key: this.apiKey });
    const res = await this.postWithTimeout(
      `${this.appsUrl}/fetch_all_fixed_templates.php`,
      params,
    );
    const raw = await res.text();

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('SendPK template list returned an unexpected (non-JSON) response');
    }

    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { templates?: unknown })?.templates)
        ? (parsed as { templates: unknown[] }).templates
        : Array.isArray((parsed as { data?: unknown })?.data)
          ? (parsed as { data: unknown[] }).data
          : null;

    if (!list) {
      throw new Error('SendPK template list returned an unexpected response shape');
    }

    return list.map((row) => {
      const r = row as Record<string, unknown>;
      const variables = Array.isArray(r.variables)
        ? (r.variables as unknown[]).map(String)
        : typeof r.variables === 'string'
          ? this.extractHashVariables(r.variables)
          : [];
      return {
        id: String(r.id ?? r.template_id ?? ''),
        name: String(r.name ?? r.title ?? `Template ${r.id ?? ''}`),
        message: String(r.message ?? r.body ?? ''),
        variables,
      };
    });
  }

  /** Fallback: derive #variable# names directly from the approved wording if SendPK doesn't send a separate `variables` array. */
  private extractHashVariables(message: string): string[] {
    const matches = message.match(/#([a-zA-Z0-9_]+)#/g) ?? [];
    return [...new Set(matches.map((m) => m.replace(/#/g, '')))];
  }

  private async postWithTimeout(url: string, body: URLSearchParams): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { method: 'GET', signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  private describeNetworkError(e: unknown): string {
    return e instanceof Error&&e.name==='AbortError'?'SendPK request timed out':'SendPK network request failed';
  }

  private parseResponse(raw: string): SmsSendResult {
    let status='',id='';
    try {
      const parsed=JSON.parse(raw);
      if(parsed && typeof parsed==='object') {
        status=String(parsed.status??parsed.Status??parsed.code??'').trim().toUpperCase();id=String(parsed.id??parsed.ID??'');
      } else status=String(parsed).trim().toUpperCase();
    }
    catch {const ok=raw.trim().match(/^OK(?:\s+ID:(\d+))?$/i);status=ok?'OK':raw.trim().match(/^(\d+)(?:\s|$)/)?.[1]??'';id=ok?.[1]??'';}
    const providerMessageId=/^\d{1,64}$/.test(id)&&(!this.apiKey||!id.includes(this.apiKey))?id:undefined;
    if(status==='OK')return {success:true,providerStatus:'ACCEPTED',providerMessageId,rawResponse:JSON.stringify({status:'OK',id:providerMessageId}).slice(0,500)};
    const known=['1','2','4','5','6','7','8','9','12'].includes(status);
    const errorCode=status==='8'?'INSUFFICIENT_CREDIT':status==='7'||status==='5'?'INVALID_RECIPIENT':known?'PROVIDER_REJECTED':'UNKNOWN_RESPONSE';
    return {success:false,failureKind:status==='8'?'TRANSIENT':known?'PERMANENT':'AMBIGUOUS',errorCode,
      providerMessageId,providerStatus:known?'REJECTED':'UNKNOWN',errorMessage:known?this.describeStatusCode(status):'Provider acceptance is uncertain',
      rawResponse:JSON.stringify({status:known?status:'UNKNOWN',id:providerMessageId}).slice(0,500)};
  }

  private describeStatusCode(code: string): string {
    const codes: Record<string, string> = {
      '1': 'API key is invalid, expired, or account disabled',
      '2': 'API key is empty',
      '4': 'Sender ID is empty',
      '5': 'Recipient is empty',
      '6': 'Message is empty',
      '7': 'Invalid recipient number',
      '8': 'Insufficient credit',
      '9': 'SMS rejected',
      '12': 'SMS rejected by provider',
    };
    return codes[code] ?? `SendPK error (code: ${code || 'unknown'})`;
  }
}
