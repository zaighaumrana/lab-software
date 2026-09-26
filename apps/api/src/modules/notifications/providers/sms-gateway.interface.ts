/**
 * SmsGateway — every SMS provider (SendPK today, anything else later)
 * implements this. Nothing outside this module ever talks to a provider's
 * HTTP API directly — see 02_Technical_Architecture.md § Integration Strategy.
 *
 * Providers are template-based, not free-text: the wording lives in the
 * provider's own approved template, and we only ever send a template_id
 * plus a JSON map of variable values. See sendpk.provider.ts for SENDPK's
 * concrete request/response shape.
 */

export interface SmsSendParams {
  /** Already-normalized recipient mobile number (e.g. 923001234567). */
  mobile: string;
  /** Provider-approved template ID to send. */
  templateId: string;
  /** Variable values, keyed by the provider's own variable names. */
  variables: Record<string, string>;
  /** True if the rendered content requires Unicode/UCS-2 delivery. */
  unicode?: boolean;
}

export interface SmsSendResult {
  success: boolean;
  /** Provider-side message ID, if the send succeeded — used for delivery lookups. */
  providerMessageId?: string;
  /** Raw response body, kept (redacted of secrets) for troubleshooting and the audit trail. */
  rawResponse: string;
  /** Present only when success is false. */
  errorMessage?: string;
}

/** One approved template as returned by the provider's template-list endpoint. */
export interface ProviderTemplateInfo {
  id: string;
  name: string;
  /** Approved wording, in the provider's own placeholder syntax (e.g. #patient_name#). */
  message: string;
  /** Variable keys the provider says this template requires. */
  variables: string[];
}

export interface SmsGateway {
  send(params: SmsSendParams): Promise<SmsSendResult>;

  /** Whether the gateway has the credentials it needs to attempt a send. */
  isConfigured(): boolean;

  /** The configured sender ID / brand name — safe to display (never the API key). */
  getSenderId(): string;

  /** Optional — not every provider needs to be polled; SENDPK supports it. */
  checkDelivery?(providerMessageId: string): Promise<string>;

  /** Optional — remaining credit, if the provider exposes it. */
  checkBalance?(): Promise<number | null>;

  /** Optional — lists the account's approved templates, for the Settings "Sync" button. */
  listTemplates?(): Promise<ProviderTemplateInfo[]>;
}

export const SMS_GATEWAY = Symbol('SMS_GATEWAY');
