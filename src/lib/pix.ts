function emv(id: string, value: string) {
  if (!value) return "";
  const length = new TextEncoder().encode(value).length;
  if (length > 99) {
    throw new Error(`Campo PIX ${id} excede o limite do BR Code.`);
  }
  return `${id}${String(length).padStart(2, "0")}${value}`;
}

function normalizeMerchantText(value: string, maxLength: number) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeTxid(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "")
    .slice(0, 25);

  return normalized || "***";
}

function crc16Ccitt(value: string) {
  let crc = 0xffff;

  for (let index = 0; index < value.length; index += 1) {
    crc ^= value.charCodeAt(index) << 8;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export interface PixPayloadInput {
  key: string | null | undefined;
  merchantName: string;
  merchantCity: string;
  amount?: number | null;
  txid: string;
}

export function buildPixPayload(input: PixPayloadInput) {
  const key = input.key?.trim() ?? "";
  if (!key || key.length > 77) return null;

  const merchantName = normalizeMerchantText(input.merchantName || "PREFEITURA MUNICIPAL", 25);
  const merchantCity = normalizeMerchantText(input.merchantCity || "MUNICIPIO", 15);
  const txid = normalizeTxid(input.txid);

  if (!merchantName || !merchantCity) return null;

  const merchantAccount = emv("00", "BR.GOV.BCB.PIX") + emv("01", key);
  const amount =
    typeof input.amount === "number" && Number.isFinite(input.amount) && input.amount > 0
      ? emv("54", input.amount.toFixed(2))
      : "";

  const payloadWithoutCrc =
    emv("00", "01") +
    emv("26", merchantAccount) +
    emv("52", "0000") +
    emv("53", "986") +
    amount +
    emv("58", "BR") +
    emv("59", merchantName) +
    emv("60", merchantCity) +
    emv("62", emv("05", txid)) +
    "6304";

  return `${payloadWithoutCrc}${crc16Ccitt(payloadWithoutCrc)}`;
}

export function isPixConfigured(key: string | null | undefined) {
  const normalized = key?.trim() ?? "";
  return normalized.length > 0 && normalized.length <= 77;
}
