/** Formatting only: these fields must originate from the bank, never from a local charge generator. */
export function bankDigits(value?: string | null) {
  return String(value || "").replace(/[\s.-]/g, "");
}

export function barcodeFromDigitableLine(value?: string | null) {
  const digits = bankDigits(value);
  if (/^\d{47}$/.test(digits)) {
    return digits.slice(0, 4) + digits[32] + digits.slice(33) +
      digits.slice(4, 9) + digits.slice(10, 20) + digits.slice(21, 31);
  }
  if (/^8\d{47}$/.test(digits)) {
    return [0, 12, 24, 36].map((offset) => digits.slice(offset, offset + 11)).join("");
  }
  return "";
}

export function normalizeOfficialBanking(barcode?: string | null, line?: string | null) {
  const digitableLine = bankDigits(line);
  const expected = barcodeFromDigitableLine(digitableLine);
  const supplied = bankDigits(barcode);
  // Some provider responses repeat the line in barcode_content. Remove only
  // the documented line check-digit positions; never pad or invent digits.
  const normalized = /^\d{44}$/.test(supplied) ? supplied : barcodeFromDigitableLine(supplied);
  if (!expected || (supplied && normalized !== expected)) return { barcode: "", digitableLine: "" };
  return { barcode: expected, digitableLine };
}
