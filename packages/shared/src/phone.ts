// Normalizes Pakistani mobile numbers into the international format SENDPK
// expects (923XXXXXXXXX, no leading zero/plus). Returns null for anything
// that isn't a valid-looking Pakistani mobile number, so callers can reject
// before ever attempting a send.
//
// Handles:
//   03001234567    -> 923001234567
//   +923001234567  -> 923001234567
//   00923001234567 -> 923001234567
//   923001234567   -> 923001234567 (already normalized)

export function normalizePakistaniMobile(input: string | null | undefined): string | null {
  if (!input) return null;

  let digits = input.replace(/[^\d]/g, '');

  if (digits.startsWith('0092')) {
    digits = digits.slice(2); // 0092XXXXXXXXXX -> 92XXXXXXXXXX
  } else if (digits.startsWith('0') && !digits.startsWith('00')) {
    digits = `92${digits.slice(1)}`; // 03XXXXXXXXX -> 923XXXXXXXXX
  }
  // else: assume it already starts with 92 (with or without a leading '+',
  // already stripped above) and is left as-is.

  const match = digits.match(/^92(3\d{9})$/);
  return match ? `92${match[1]}` : null;
}
