/**
 * SIGAPRO: read-only parser for FEBRABAN CNAB 240 collection returns.
 *
 * A return FILE is untrusted data. Neither its name nor the occurrence code
 * constitutes bank authentication or permission to mark a municipal guide paid.
 * All entries produced here remain candidates for a separate authorized,
 * bank-specific reconciliation workflow.
 */
import { createHash } from "node:crypto";

export type CnabReturnCandidate = {
  bankCode: string;
  lot: string;
  sequence: number;
  movement: string;
  paidCents: number;
  netCents: number;
  occurrenceDate: string | null;
  creditDate: string | null;
  reference: string | null;
  bankReference: string | null;
  nominalCents: number | null;
  classification: "possible_liquidation" | "other_event";
  requiresBankReview: true;
};

export type Cnab240Preview = {
  format: "FEBRABAN_CNAB240_COLLECTION_RETURN";
  bankCode: string;
  sha256: string;
  recordCount: number;
  candidateCount: number;
  possibleLiquidations: number;
  totalPaidCents: number;
  bankAuthenticated: false;
  automaticSettlementAllowed: false;
  layoutCertifiedForMunicipality: false;
  entries: CnabReturnCandidate[];
  cautions: string[];
};

function field(line: string, from: number, until: number): string {
  return line.slice(from - 1, until);
}
function digits(value: string, length: number): boolean {
  return value.length === length && /^[0-9]+$/.test(value);
}
function readCents(value: string, label: string): number {
  if (!digits(value, 15)) throw new Error("CNAB240: campo monetário inválido (" + label + ").");
  const amount = Number(value);
  if (!Number.isSafeInteger(amount)) throw new Error("CNAB240: valor fora do limite seguro.");
  return amount;
}
function parseDate(value: string, label: string): string | null {
  if (value === "00000000" || value === "        ") return null;
  if (!digits(value, 8)) throw new Error("CNAB240: data bancária inválida (" + label + ").");
  const d = Number(value.slice(0, 2));
  const m = Number(value.slice(2, 4));
  const y = Number(value.slice(4, 8));
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31)
    throw new Error("CNAB240: data fora da faixa permitida.");
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d)
    throw new Error("CNAB240: dia inválido no calendário.");
  return String(y) + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}
function reference(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, " ");
  // References are informational and must never be used as authorization.
  return normalized && /^[\x20-\x7e]{1,30}$/.test(normalized) ? normalized : null;
}

/**
 * Strict fixed-width validation, T/U pairing and integer-cent readings.
 * Generic position offsets follow FEBRABAN's cobrança T/U conventions.
 * Banks can customize Segment T. Consequently references and nominal
 * amounts are extracted only for documented 041/033 layouts, and even those
 * NEVER create evidence of real settlement.
 */
export function parseCnab240CollectionReturn(
  input: string,
  options: { expectedBankCode: string; maxEntries?: number },
): Cnab240Preview {
  if (typeof input !== "string" || input.length < 480 || input.length > 600_000 ||
      [...input].some(char => [0, 11, 12].includes(char.charCodeAt(0)))) {
    throw new Error("Arquivo CNAB240 ausente, excessivo ou com caracteres inválidos.");
  }
  const lines = input.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
  if (lines[lines.length - 1] === "") lines.pop();
  if (lines.length < 2 || lines.length > 2500 || lines.some(line => line.length !== 240))
    throw new Error("CNAB240 exige registros de exatamente 240 posições e tamanho limitado.");
  const bankCode = field(lines[0], 1, 3);
  if (!digits(bankCode, 3) || bankCode === "000" ||
      !digits(options.expectedBankCode, 3) || bankCode !== options.expectedBankCode)
    throw new Error("O código do banco no retorno diverge do banco autorizado para a Prefeitura.");
  if (field(lines[0], 8, 8) !== "0" || field(lines[lines.length - 1], 8, 8) !== "9")
    throw new Error("Cabeçalho/trailer CNAB240 ausente ou inválido.");
  const fileHash = createHash("sha256").update(input, "utf8").digest("hex");
  const maxEntries = Math.min(Math.max(options.maxEntries ?? 100, 1), 250);
  const entries: CnabReturnCandidate[] = [];
  let pending: { lot: string; seq: number; movement: string; line: string } | null = null;
  let paidTotal = 0;
  let possibleLiquidations = 0;
  const observed = new Set<string>();
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (field(line, 1, 3) !== bankCode)
      throw new Error("CNAB240 contém registros de bancos diferentes.");
    const kind = field(line, 8, 8);
    if (!/^[01359]$/.test(kind))
      throw new Error("CNAB240 contém tipo de registro desconhecido.");
    if (kind !== "3") {
      if (pending) throw new Error("CNAB240 contém segmento T sem segmento U correspondente.");
      continue;
    }
    const lot = field(line, 4, 7);
    const seqText = field(line, 9, 13);
    const segment = field(line, 14, 14);
    if (!digits(lot, 4) || lot === "0000" || !digits(seqText, 5))
      throw new Error("CNAB240 possui lote ou sequência de detalhe inválida.");
    const seq = Number(seqText);
    const unique = lot + ":" + seqText;
    if (observed.has(unique)) throw new Error("CNAB240 apresenta sequência duplicada no lote.");
    observed.add(unique);
    if (segment === "T") {
      if (pending) throw new Error("CNAB240 possui dois segmentos T sem U correspondente.");
      pending = { lot, seq, line, movement: field(line, 16, 17) };
      if (!digits(pending.movement, 2))
        throw new Error("CNAB240 possui ocorrência bancária inválida.");
      continue;
    }
    if (segment === "U") {
      if (!pending || pending.lot !== lot || seq !== pending.seq + 1)
        throw new Error("CNAB240 possui segmento U solto ou fora da sequência T/U.");
      if (field(line, 16, 17) !== pending.movement)
        throw new Error("CNAB240 T/U apresentam ocorrências conflitantes.");
      const paidCents = readCents(field(line, 78, 92), "valor pago");
      const netCents = readCents(field(line, 93, 107), "valor líquido");
      const classified = pending.movement === "06" ? "possible_liquidation" : "other_event";
      // Source layouts: FEBRABAN/Banrisul 041 (T 82-96,106-130,38-57)
      // and Santander 033 H7815 v8.3 (T 78-92,101-125,41-53).
      // Both are still untrusted files until the municipality's bank contract is verified.
      const knownTLayout = bankCode === "041" || bankCode === "033";
      const nominal = knownTLayout
        ? readCents(bankCode === "033" ? field(pending.line, 78, 92) : field(pending.line, 82, 96), "valor nominal")
        : null;
      const ownReference = knownTLayout
        ? reference(bankCode === "033" ? field(pending.line, 101, 125) : field(pending.line, 106, 130))
        : null;
      const bankReference = knownTLayout
        ? reference(bankCode === "033" ? field(pending.line, 41, 53) : field(pending.line, 38, 57))
        : null;
      const next: CnabReturnCandidate = {
        bankCode, lot, sequence: pending.seq, movement: pending.movement,
        paidCents, netCents,
        occurrenceDate: parseDate(field(line, 138, 145), "ocorrência"),
        creditDate: parseDate(field(line, 146, 153), "crédito"),
        reference: ownReference, bankReference, nominalCents: nominal,
        classification: classified, requiresBankReview: true,
      };
      if (entries.length >= maxEntries)
        throw new Error("CNAB240 ultrapassa o limite de lançamentos por conferência.");
      paidTotal += paidCents;
      if (!Number.isSafeInteger(paidTotal))
        throw new Error("Total monetário do arquivo ultrapassa o limite seguro.");
      if (classified === "possible_liquidation") possibleLiquidations++;
      entries.push(next);
      pending = null;
      continue;
    }
    // Other detail segments may exist, but never break an expected T/U pair.
    if (pending) throw new Error("CNAB240 tem detalhe inesperado entre T e U.");
  }
  if (pending) throw new Error("CNAB240 termina com segmento T incompleto.");
  if (!entries.length) throw new Error("O arquivo não possui pares de retorno T/U para conferência.");
  return {
    format: "FEBRABAN_CNAB240_COLLECTION_RETURN",
    bankCode, sha256: fileHash, recordCount: lines.length,
    candidateCount: entries.length, possibleLiquidations,
    totalPaidCents: paidTotal,
    bankAuthenticated: false, automaticSettlementAllowed: false,
    layoutCertifiedForMunicipality: false, entries,
    cautions: [
      "Arquivo lido localmente no servidor, sem alteração de guia ou protocolo.",
      "Código 06 identifica apenas possível liquidação; não comprova crédito nem assinatura do banco.",
      "Retornos variam conforme convênio e banco. Conferir layout contratado, origem/autenticidade, documento, valor, data e crédito com a Tesouraria.",
      "Para baixa automática usar somente conector bancário homologado, prova independente de liquidação e rotina idempotente autorizada.",
    ],
  };
}

/** Matching a CNAB line to a municipal guide is NEVER an authorization to settle. */
export function compareCnabCandidateToGuide(
  candidate: CnabReturnCandidate,
  guide: { guide_number: string; amount: number | string; paid?: boolean | null; bank_reference?: string | null },
) {
  const value = typeof guide.amount === "number" ? guide.amount.toFixed(2) : String(guide.amount);
  const match = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value);
  const [whole, fraction = ""] = value.split(".");
  const cents = match ? Number(whole) * 100 + Number(fraction.padEnd(2, "0")) : null;
  const referenceMatches = Boolean(
    guide.bank_reference && candidate.bankReference && guide.bank_reference === candidate.bankReference
  ) || Boolean(candidate.reference && candidate.reference === guide.guide_number);
  const amountMatches = cents !== null && Number.isSafeInteger(cents) && cents === candidate.paidCents;
  return {
    referenceMatches,
    amountMatches,
    alreadyPaid: guide.paid === true,
    possibleLiquidation: candidate.classification === "possible_liquidation",
    canAutomaticallySettle: false as const,
    status: referenceMatches && amountMatches && candidate.classification === "possible_liquidation" && !guide.paid
      ? "pending_independent_bank_proof"
      : "manual_investigation_required",
  };
}
