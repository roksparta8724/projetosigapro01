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
  // Mercado Pago Orders can return a 46-digit barcode_content alongside
  // the official 47-digit linha digitável. That payload is NOT a 44-digit
  // boleto barcode; use the mathematically derived 44 digits from the
  // provider's own 47-digit line, without inventing or padding digits.
  // A contradictory valid 44-digit barcode must still fail closed.
  const normalized = /^\d{44}$/.test(supplied)
    ? supplied
    : barcodeFromDigitableLine(supplied);
  const providerAuxiliaryBarcode = /^\d{46}$/.test(supplied);
  if (!expected || (supplied && !providerAuxiliaryBarcode && normalized !== expected)) {
    return { barcode: "", digitableLine: "" };
  }
  return { barcode: expected, digitableLine };
}

/** Encode the bank's existing 44 digits as Interleaved 2 of 5, with quiet zones.
 * This is only a rendering operation: it does not create a bank charge. */
export function encodeBankBarcodeI25(value: string) {
  if (!/^\d{44}$/.test(value)) return null;
  const patterns = ["nnwwn", "wnnnw", "nwnnw", "wwnnn", "nnwnw",
    "wnwnn", "nwwnn", "nnnww", "wnnwn", "nwnwn"];
  const quiet = 10;
  let x = quiet;
  const bars: { x: number; width: number }[] = [];
  const bar = (width: number) => { bars.push({ x, width }); x += width; };
  const space = (width: number) => { x += width; };
  const unit = (token: string) => token === "w" ? 3 : 1;
  bar(1); space(1); bar(1); space(1);
  for (let i = 0; i < value.length; i += 2) {
    const black = patterns[Number(value[i])];
    const white = patterns[Number(value[i + 1])];
    for (let j = 0; j < 5; j++) { bar(unit(black[j])); space(unit(white[j])); }
  }
  bar(3); space(1); bar(1);
  return { bars, totalWidth: x + quiet };
}
