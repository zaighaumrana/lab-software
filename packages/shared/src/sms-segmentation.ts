// SMS character/segment ("SMS parts") calculation utility.
//
// This intentionally does NOT just use `.length` — GSM-7 has extension-table
// characters that consume 2 septets, and true multi-part SMS uses a smaller
// per-part budget than a single-part message (153 septets/part for GSM-7,
// 67 units/part for Unicode/UCS-2) because a few septets/units in every part
// are spent on the concatenation (UDH) header. See docs in the LMS SMS
// Settings UI for how this is surfaced to administrators.

export type SmsMessageType = 'text' | 'unicode';

export interface SmsSegmentResult {
  type: SmsMessageType;
  /** GSM-7 septets (text) or UTF-16 code units (unicode) in the message. */
  units: number;
  /** Number of SMS parts this message will be billed/sent as. */
  parts: number;
  /** Total character/unit capacity across all parts at this part count. */
  capacity: number;
  /** Capacity minus units — how much room is left in the last part. */
  remaining: number;
}

const SINGLE_TEXT_LIMIT = 160;
const MULTIPART_TEXT_LIMIT = 153;
const SINGLE_UNICODE_LIMIT = 70;
const MULTIPART_UNICODE_LIMIT = 67;

// GSM 03.38 default alphabet (basic set) — 1 septet each.
const GSM_BASIC_SET = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'.split(
    '',
  ),
);

// GSM 03.38 extension table — reached via an escape character, so each of
// these costs 2 septets, not 1.
const GSM_EXTENDED_SET = new Set('^{}\\[~]|€'.split(''));

/**
 * Counts GSM-7 septets for `text`, or returns null if the text contains any
 * character outside the GSM-7 basic + extension tables (meaning it must be
 * sent as Unicode/UCS-2 instead).
 */
function countGsmSeptets(text: string): number | null {
  let septets = 0;
  for (const char of text) {
    if (GSM_BASIC_SET.has(char)) {
      septets += 1;
    } else if (GSM_EXTENDED_SET.has(char)) {
      septets += 2;
    } else {
      return null;
    }
  }
  return septets;
}

/**
 * Determines SMS type, unit count, part count, capacity, and remaining
 * characters for the given rendered message text. Mirrors the segmentation
 * SENDPK (and telcos generally) use for GSM-7 vs Unicode/UCS-2 billing.
 */
export function calculateSmsSegments(text: string): SmsSegmentResult {
  const gsmSeptets = countGsmSeptets(text);

  if (gsmSeptets !== null) {
    if (gsmSeptets <= SINGLE_TEXT_LIMIT) {
      return {
        type: 'text',
        units: gsmSeptets,
        parts: 1,
        capacity: SINGLE_TEXT_LIMIT,
        remaining: SINGLE_TEXT_LIMIT - gsmSeptets,
      };
    }
    const parts = Math.ceil(gsmSeptets / MULTIPART_TEXT_LIMIT);
    const capacity = parts * MULTIPART_TEXT_LIMIT;
    return {
      type: 'text',
      units: gsmSeptets,
      parts,
      capacity,
      remaining: capacity - gsmSeptets,
    };
  }

  // Unicode / UCS-2. Use UTF-16 code-unit length (not codepoint count) —
  // characters outside the BMP (many emoji) are naturally counted as 2 units
  // this way, matching how UCS-2-based SMS gateways actually bill them.
  const units = text.length;
  if (units <= SINGLE_UNICODE_LIMIT) {
    return {
      type: 'unicode',
      units,
      parts: 1,
      capacity: SINGLE_UNICODE_LIMIT,
      remaining: SINGLE_UNICODE_LIMIT - units,
    };
  }
  const parts = Math.ceil(units / MULTIPART_UNICODE_LIMIT);
  const capacity = parts * MULTIPART_UNICODE_LIMIT;
  return {
    type: 'unicode',
    units,
    parts,
    capacity,
    remaining: capacity - units,
  };
}
