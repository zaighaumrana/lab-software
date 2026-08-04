import { Injectable, Logger } from '@nestjs/common';
import type { SmsGateway, SmsSendResult } from './sms-gateway.interface';

/**
 * SendPK (https://sendpk.com) — PTA-approved local SMS aggregator.
 * Plain HTTP GET/POST, api_key auth, no SDK. Docs: https://sendpk.com/api.php
 *
 * Required env vars:
 *   SENDPK_API_KEY  — from SendPK dashboard → Profile → API Key
 *   SENDPK_SENDER   — your approved Sender ID / brand name (or the shared
 *                     "SMS Alert" name until your own brand mask is approved)
 */
@Injectable()
export class SendPkProvider implements SmsGateway {
  private readonly logger = new Logger(SendPkProvider.name);
  private readonly baseUrl = 'https://sendpk.com/api';
  private readonly apiKey = process.env.SENDPK_API_KEY ?? '';
  private readonly sender = process.env.SENDPK_SENDER ?? '';

  async send(mobile: string, message: string): Promise<SmsSendResult> {
    if (!this.apiKey || !this.sender) {
      const err = 'SENDPK_API_KEY or SENDPK_SENDER is not configured';
      this.logger.error(err);
      return { success: false, rawResponse: '', errorMessage: err };
    }

    const normalizedMobile = this.normalizeMobile(mobile);
    const params = new URLSearchParams({
      api_key: this.apiKey,
      sender: this.sender,
      mobile: normalizedMobile,
      message,
      format: 'json',
    });

    try {
      const res = await fetch(`${this.baseUrl}/sms.php?${params.toString()}`, {
        method: 'GET',
      });
      const raw = await res.text();
      return this.parseResponse(raw);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown network error';
      this.logger.error(`SendPK request failed: ${errorMessage}`);
      return { success: false, rawResponse: '', errorMessage };
    }
  }

  async checkDelivery(providerMessageId: string): Promise<string> {
    const params = new URLSearchParams({
      api_key: this.apiKey,
      id: providerMessageId,
    });
    const res = await fetch(`${this.baseUrl}/delivery.php?${params.toString()}`);
    return res.text();
  }

  async checkBalance(): Promise<number | null> {
    const params = new URLSearchParams({ api_key: this.apiKey });
    const res = await fetch(`${this.baseUrl}/balance.php?${params.toString()}`);
    const text = (await res.text()).trim();
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * SendPK expects an international-format number with no leading zero/plus,
   * e.g. 923001234567. Patients in this system are typically registered with
   * a local 03xxxxxxxxx number — convert it here so callers never have to think
   * about it.
   */
  private normalizeMobile(mobile: string): string {
    const digits = mobile.replace(/[^\d]/g, '');
    if (digits.startsWith('92')) return digits;
    if (digits.startsWith('0')) return `92${digits.slice(1)}`;
    return digits;
  }

  private parseResponse(raw: string): SmsSendResult {
    // format=json gives back something like {"status":"OK","id":"29346"}
    // but SendPK's plain-text status codes are the documented source of truth,
    // so we handle both defensively.
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
        errorMessage: this.describeStatusCode(status),
      };
    } catch {
      // Fall back to plain-text parsing: "OK ID:29346" or a bare numeric code.
      if (raw.startsWith('OK')) {
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
    };
    return codes[code] ?? `SendPK error (code: ${code || 'unknown'})`;
  }
}
