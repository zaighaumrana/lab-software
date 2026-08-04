/**
 * SmsGatewayInterface — every SMS provider (SendPK today, anything else later)
 * implements this. Nothing outside this module ever talks to a provider's
 * HTTP API directly — see 02_Technical_Architecture.md § Integration Strategy.
 */

export interface SmsSendResult {
  success: boolean;
  /** Provider-side message ID, if the send succeeded — used for delivery lookups. */
  providerMessageId?: string;
  /** Raw response body/status code, kept for troubleshooting and the audit trail. */
  rawResponse: string;
  /** Present only when success is false. */
  errorMessage?: string;
}

export interface SmsGateway {
  send(mobile: string, message: string): Promise<SmsSendResult>;

  /** Optional — not every provider needs to be polled; SendPK supports it. */
  checkDelivery?(providerMessageId: string): Promise<string>;

  /** Optional — remaining credit, if the provider exposes it. */
  checkBalance?(): Promise<number | null>;
}

export const SMS_GATEWAY = Symbol('SMS_GATEWAY');
