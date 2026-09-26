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
    if (!this.isConfigured()) {
      const err = 'SENDPK_API_KEY or SENDPK_SENDER is not configured';
      this.logger.error(err);
      return { success: false, rawResponse: '', errorMessage: err };
    }
    if (!params.templateId) {
      return { success: false, rawResponse: '', errorMessage: 'No SENDPK template_id mapped' };
    }

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
      const res = await this.postWithTimeout(`${this.baseUrl}/sms.php`, body);
      const raw = await res.text();
      return this.parseResponse(raw);
    } catch (e) {
      const errorMessage = this.describeNetworkError(e);
      this.logger.error(`SendPK request failed: ${errorMessage}`);
      return { success: false, rawResponse: '', errorMessage };
    }
  }

  async checkDelivery(providerMessageId: string): Promise<string> {
    const params = new URLSearchParams({ api_key: this.apiKey, id: providerMessageId });
    const res = await this.getWithTimeout(`${this.baseUrl}/delivery.php?${params.toString()}`);
    return res.text();
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
    if (e instanceof Error) {
      return e.name === 'AbortError' ? 'SendPK request timed out' : e.message;
    }
    return 'Unknown network error';
  }

  private parseResponse(raw: string): SmsSendResult {
    // format=json gives back something like {"status":"OK","id":"29346"}
    // but SendPK's plain-text status codes are the documented source of
    // truth, so we handle both defensively. HTTP 200 alone is never treated
    // as success — only an explicit OK status is.
    try {
      const parsed = JSON.parse(raw);
      const status = String(parsed.status ?? parsed.Status ?? '').toUpperCase();
      if (status === 'OK') {
        return {
          success: true,
          providerMessageId: String(parsed.id ?? parsed.ID ?? ''),
          rawResponse: raw,
        };
      }
      return {
        success: false,
        rawResponse: raw,
        errorMessage: this.describeStatusCode(status || String(parsed.code ?? '')),
      };
    } catch {
      // Fall back to plain-text parsing: "OK ID:29346" or a bare numeric code.
      if (raw.trim().toUpperCase().startsWith('OK')) {
        const match = raw.match(/ID:(\d+)/i);
        return {
          success: true,
          providerMessageId: match?.[1],
          rawResponse: raw,
        };
      }
      return {
        success: false,
        rawResponse: raw,
        errorMessage: this.describeStatusCode(raw.trim()),
      };
    }
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
