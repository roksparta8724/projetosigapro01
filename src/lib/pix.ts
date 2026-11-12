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

  for (const byte of new TextEncoder().encode(value)) {
    crc ^= byte << 8;

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

/**
 * BR Code / EMV field parser. Lengths are bytes (UTF-8), never JS
 * string-length; duplicate TLV IDs, truncated fields and trailing data
 * cannot become a formally valid PIX just because a CRC was recomputed.
 */
function parsePixTlv(data:string):Map<string,string>|null{
  const bytes=new TextEncoder().encode(data);
  if(bytes.length>4096)return null;
  const fields=new Map<string,string>();
  const decoder=new TextDecoder("utf-8",{fatal:true});
  try{
    for(let offset=0;offset<bytes.length;){
      if(bytes.length-offset<4)return null;
      const id=String.fromCharCode(bytes[offset],bytes[offset+1]);
      const len=String.fromCharCode(bytes[offset+2],bytes[offset+3]);
      if(!/^\d{2}$/.test(id)||!/^\d{2}$/.test(len)||fields.has(id))return null;
      const count=Number(len),end=offset+4+count;
      if(end>bytes.length)return null;
      fields.set(id,decoder.decode(bytes.slice(offset+4,end)));
      offset=end;
    }
    return fields;
  }catch{return null;}
}
function verifiedPixFields(value:string|null|undefined):Map<string,string>|null{
  const raw=String(value||"").trim();
  if(!raw.startsWith("000201")||!/6304[0-9a-f]{4}$/i.test(raw))return null;
  const fields=parsePixTlv(raw);
  if(!fields||fields.get("00")!=="01"||fields.get("63")?.length!==4||
      fields.get("53")!=="986"||fields.get("58")!=="BR"||
      !fields.get("59")||!fields.get("60"))return null;
  const crc=fields.get("63");
  if(!crc||crc.toUpperCase()!==crc16Ccitt(raw.slice(0,-4)))return null;
  const guiOk=Array.from({length:26},(_,i)=>String(i+26))
    .some(id=>{
      const account=fields.get(id);
      if(!account)return false;
      const detail=parsePixTlv(account);
      return detail?.get("00")?.toUpperCase()==="BR.GOV.BCB.PIX";
    });
  if(!guiOk)return null;
  const amount=fields.get("54");
  if(amount!==undefined&&!/^(?:0|[1-9]\d{0,9})\.\d{2}$/.test(amount))
    return null;
  return fields;
}

/** A CRC-valid string still needs complete EMV tags and the Pix GUI. */
export function isValidPixPayload(value:string|null|undefined):boolean{
  return verifiedPixFields(value)!==null;
}

/** Returns null when a *valid dynamic QR* has no amount; the bank reference
 * must then bind the payment, never infer R$0,00. */
export function pixPayloadAmountCents(payload:string|null|undefined):number|null{
  const fields=verifiedPixFields(payload);
  if(!fields)return null;
  const value=fields.get("54");
  if(value===undefined)return null;
  const [whole,cents]=value.split(".");
  const amount=Number(whole)*100+Number(cents);
  return Number.isSafeInteger(amount)&&amount>0?amount:null;
}

export function isPixConfigured(key: string | null | undefined) {
  const normalized = key?.trim() ?? "";
  return normalized.length > 0 && normalized.length <= 77;
}
