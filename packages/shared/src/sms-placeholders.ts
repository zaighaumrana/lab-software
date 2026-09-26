// Whitelisted mapping between the administrator-facing local placeholder
// format ({{patientName}}) and SENDPK's approved-template variable format
// (#patient_name#). This is the ONE explicit mapping layer — nothing here
// is arbitrary runtime eval, and any placeholder not in this map is treated
// as an error rather than silently dropped or sent through.

export const SMS_VARIABLE_MAP: Record<string, string> = {
  patientName: 'patient_name',
  bookingId: 'booking_id',
  labName: 'lab_name',
  trackingId: 'tracking_id',
};

export const SMS_VARIABLES = Object.keys(SMS_VARIABLE_MAP);

const PLACEHOLDER_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/** Every {{placeholder}} used in `template`, in order of first appearance, de-duplicated. */
export function extractPlaceholders(template: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    const key = match[1];
    if (!seen.has(key)) {
      seen.add(key);
      ordered.push(key);
    }
  }
  return ordered;
}

export interface PlaceholderValidation {
  valid: boolean;
  used: string[];
  unknown: string[];
}

/** Validates that every placeholder in `template` is a whitelisted SMS variable. */
export function validatePlaceholders(template: string): PlaceholderValidation {
  const used = extractPlaceholders(template);
  const unknown = used.filter((key) => !(key in SMS_VARIABLE_MAP));
  return { valid: unknown.length === 0, used, unknown };
}

/** Renders the local template with real values — for preview and for the stored/audit `body`. */
export function renderLocalTemplate(template: string, values: Record<string, string>): string {
  return template.replace(PLACEHOLDER_PATTERN, (_match, key: string) => values[key] ?? '');
}

/** Converts local {{placeholder}} syntax to SENDPK's #variable# syntax, for the approval-copy preview. */
export function toSendPkWording(template: string): string {
  return template.replace(PLACEHOLDER_PATTERN, (match, key: string) => {
    const mapped = SMS_VARIABLE_MAP[key];
    return mapped ? `#${mapped}#` : match;
  });
}

/**
 * Builds the JSON variables payload SENDPK expects, keyed by SENDPK's
 * variable names, from the local template's placeholders and real values.
 * Placeholders not in the whitelist are skipped (validatePlaceholders should
 * already have rejected them before this is ever called for a real send).
 */
export function buildSendPkVariables(
  template: string,
  values: Record<string, string>,
): Record<string, string> {
  const used = extractPlaceholders(template);
  const out: Record<string, string> = {};
  for (const key of used) {
    const mapped = SMS_VARIABLE_MAP[key];
    if (mapped) {
      out[mapped] = values[key] ?? '';
    }
  }
  return out;
}
