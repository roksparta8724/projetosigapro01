import { describe, expect, it } from "vitest";
import { compareCnabCandidateToGuide, parseCnab240CollectionReturn } from "./bank-return-cnab240";

function row(bank: string, kind: string, lot = "0000", seq = "00000", segment = "") {
  const buffer = Array.from({ length: 240 }, () => " ");
  const put = (at: number, value: string) => {
    for (let n = 0; n < value.length; n++) buffer[at - 1 + n] = value[n];
  };
  put(1, bank);
  put(4, lot);
  put(8, kind);
  if (kind === "3") {
    put(9, seq);
    put(14, segment);
    put(16, "06");
  }
  return { put, build: () => buffer.join("") };
}
function fixture(bank = "041", paidCents = "000000000012345") {
  const header = row(bank, "0");
  const t = row(bank, "3", "0001", "00001", "T");
  if (bank === "033") {
    // Santander H7815 v8.3 return T: 41-53, 78-92, 101-125.
    t.put(41, "NOSSO-2026   ");
    t.put(78, "000000000012345");
    t.put(101, "DAM-PRE-2026-123         ");
  } else {
    t.put(38, "NOSSO-2026          ");
    t.put(82, "000000000012345");
    t.put(106, "DAM-PRE-2026-123         ");
  }
  const u = row(bank, "3", "0001", "00002", "U");
  u.put(78, paidCents);
  u.put(93, "000000000012000");
  u.put(138, "10112026");
  u.put(146, "11112026");
  const trailer = row(bank, "9");
  return [header.build(), t.build(), u.build(), trailer.build()].join("\r\n");
}
describe("SIGAPRO bank return reader — CNAB240 read-only", () => {
  it("reads FEBRABAN T/U in integer cents and never releases a payment", () => {
    const result = parseCnab240CollectionReturn(fixture(), { expectedBankCode: "041" });
    expect(result).toMatchObject({
      bankCode: "041", recordCount: 4, candidateCount: 1,
      possibleLiquidations: 1, totalPaidCents: 12345,
      bankAuthenticated: false, automaticSettlementAllowed: false,
      layoutCertifiedForMunicipality: false,
    });
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.entries[0]).toMatchObject({
      movement: "06", paidCents: 12345, netCents: 12000,
      nominalCents: 12345,
      reference: "DAM-PRE-2026-123",
      bankReference: "NOSSO-2026",
      occurrenceDate: "2026-11-10", creditDate: "2026-11-11",
      requiresBankReview: true, classification: "possible_liquidation",
    });
    expect(compareCnabCandidateToGuide(result.entries[0], {
      guide_number: "DAM-PRE-2026-123", amount: "123.45", paid: false,
    })).toMatchObject({
      referenceMatches: true, amountMatches: true,
      canAutomaticallySettle: false, status: "pending_independent_bank_proof",
    });
  });
  it("never identifies a document as payable when the value differs", () => {
    const candidate = parseCnab240CollectionReturn(fixture(), { expectedBankCode: "041" }).entries[0];
    expect(compareCnabCandidateToGuide(candidate, {
      guide_number: "DAM-PRE-2026-123", amount: "123.46",
    })).toMatchObject({ amountMatches: false, canAutomaticallySettle: false, status: "manual_investigation_required" });
  });
  it("extracts Santander H7815 v8.3 references but never assumes authenticated settlement", () => {
    const result = parseCnab240CollectionReturn(fixture("033"), { expectedBankCode: "033" });
    expect(result.entries[0]).toMatchObject({
      nominalCents: 12345,
      reference: "DAM-PRE-2026-123", bankReference: "NOSSO-2026",
      paidCents: 12345, requiresBankReview: true,
    });
    expect(result.bankAuthenticated).toBe(false);
    expect(result.automaticSettlementAllowed).toBe(false);
  });
  it("keeps unknown-bank references unavailable rather than guessing positions", () => {
    const entry = parseCnab240CollectionReturn(fixture("341"), { expectedBankCode: "341" }).entries[0];
    expect(entry).toMatchObject({ bankCode: "341", reference: null, nominalCents: null, requiresBankReview: true });
  });
  it("blocks cross-bank files, malformed sizes and partial paired records", () => {
    expect(() => parseCnab240CollectionReturn(fixture(), { expectedBankCode: "033" })).toThrow(/diverge/);
    expect(() => parseCnab240CollectionReturn(fixture().slice(0, -10), { expectedBankCode: "041" })).toThrow(/240 posições/);
    const lines = fixture().split("\r\n");
    expect(() => parseCnab240CollectionReturn([lines[0], lines[2], lines[3]].join("\r\n"), {
      expectedBankCode: "041",
    })).toThrow(/solto/);
    expect(() => parseCnab240CollectionReturn([lines[0], lines[1], lines[3]].join("\r\n"), {
      expectedBankCode: "041",
    })).toThrow(/sem segmento U/);
  });
  it("rejects duplicated row sequence and invalid money and dates", () => {
    const lines = fixture().split("\r\n");
    const duplicate = [...lines.slice(0, 3), lines[2], lines[3]].join("\r\n");
    expect(() => parseCnab240CollectionReturn(duplicate, { expectedBankCode: "041" })).toThrow(/duplicada|solto/);
    const invalidMoney = [...lines];
    invalidMoney[2] = lines[2].slice(0, 77) + "000000000012X45" + lines[2].slice(92);
    expect(() => parseCnab240CollectionReturn(invalidMoney.join("\r\n"), { expectedBankCode: "041" })).toThrow(/monetário/);
    const invalidDate = [...lines];
    invalidDate[2] = lines[2].slice(0, 137) + "31022026" + lines[2].slice(145);
    expect(() => parseCnab240CollectionReturn(invalidDate.join("\r\n"), { expectedBankCode: "041" })).toThrow(/calendário/);
  });
  it("does not identify a non-liquidation event as a confirmed payment", () => {
    const lines = fixture().split("\r\n");
    lines[1] = lines[1].slice(0, 15) + "02" + lines[1].slice(17);
    lines[2] = lines[2].slice(0, 15) + "02" + lines[2].slice(17);
    const result = parseCnab240CollectionReturn(lines.join("\r\n"), { expectedBankCode: "041" });
    expect(result.possibleLiquidations).toBe(0);
    expect(result.entries[0].classification).toBe("other_event");
    expect(compareCnabCandidateToGuide(result.entries[0], {
      guide_number: "DAM-PRE-2026-123", amount: "123.45", paid: false,
    }).canAutomaticallySettle).toBe(false);
  });
});
