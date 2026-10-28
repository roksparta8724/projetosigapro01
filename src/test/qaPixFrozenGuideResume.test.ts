import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildPixPayload } from "@/lib/pix";
import { canResumeQaFrozenGuide, type GuideOriginal } from "@/lib/guideOriginal";

const pix = buildPixPayload({
  key: "qa-pix@example.invalid",
  merchantName: "PREFEITURA TESTE",
  merchantCity: "CAMPO LIMPO",
  amount: 1,
  txid: "SIGAPROQA20261028",
});
if (!pix) throw new Error("PIX fixture invalid");

const makeGuide = (overrides: Record<string, unknown> = {}): GuideOriginal => ({
  id: "11111111-1111-4111-8111-111111111111",
  municipality_id: "22222222-2222-4222-8222-222222222222",
  process_id: "33333333-3333-4333-8333-333333333333",
  guide_number: "DAM-PRE-QA-20261028-PIXHMLG2",
  status: "pendente",
  paid: false,
  collection_mode_snapshot: "sigapro",
  amount: 1,
  created_at: "2026-10-28T00:00:00.000Z",
  due_date: "2026-11-04T00:00:00.000Z",
  payment_provider: "mercado_pago",
  provider_environment: "test",
  bank_reference: "SANDBOX_ORDER_EXISTING",
  pix_code: pix,
  document_snapshot: {
    guia: {
      numeroGuia: "DAM-PRE-QA-20261028-PIXHMLG2",
      nonPayablePreview: false,
      valorDocumento: 1,
      valorCobrado: 1,
      pixPayload: pix,
    }
  },
  ...overrides,
} as unknown as GuideOriginal);

describe("QA frozen DAM resumes original PDF without reissuing PIX", () => {
  it("accepts an unpaid original with canonical test order and matching PIX", () => {
    expect(canResumeQaFrozenGuide(makeGuide())).toBe(true);
  });
  it.each([
    {paid: true}, {status: "compensada"}, {provider_environment: "production"},
    {payment_provider: "other"}, {bank_reference: null}, {pix_code: null},
    {document_snapshot: null},
  ])("blocks unsafe or incomplete financial state %j", override => {
    expect(canResumeQaFrozenGuide(makeGuide(override))).toBe(false);
  });
  it("rejects a preview, another guide's snapshot, another amount, or an altered PIX", () => {
    const original = makeGuide();
    const base = original.document_snapshot!;
    for (const delta of [
      {nonPayablePreview: true},
      {numeroGuia: "DAM-PRE-QA-OTHER"},
      {valorCobrado: 2},
      {valorDocumento: 2},
      {pixPayload: "000201BADPIX63040000"},
    ]) {
      expect(canResumeQaFrozenGuide(makeGuide({
        document_snapshot: {...base, guia: {...base.guia, ...delta}},
      }))).toBe(false);
    }
  });
  it("retains the stored-order CTA while accurately distinguishing unfinished PDF archival", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/saas/ExternalPaymentsPage.tsx"), "utf8");
    expect(source).toContain("PIX de TESTE confirmado e snapshot preservado.");
    expect(source).toContain("current.original_pdf_key");
  });
  it("accepts lower-case provider merchant account in both immutable freeze guards", () => {
    const migration = readFileSync(join(process.cwd(),
      "neon/migrations/20261028_qa_freeze_pix_lowercase_v2.sql"), "utf8");
    expect(migration).toContain("QA EXCLUSIVE");
    expect(migration).toContain("(_snapshot #>> '{guia,pixPayload}') !~* '^000201");
    expect(migration).toContain("g.pix_code ~* '^000201");
    expect(migration).not.toContain("g.pix_code ~ '^000201");
    expect(migration).not.toMatch(/UPDATE\s+public\.payment_guides/i);
  });
  it("resumes from the frozen snapshot before any PIX-binding or issuer logic", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/saas/ExternalPaymentsPage.tsx"), "utf8");
    const resume = source.indexOf("if (officialOriginal.document_snapshot) {");
    const bind = source.indexOf('"qa_mp_pix_bind_to_guide_v1"');
    const issuer = source.indexOf("const charge = isolatedQa", resume);
    expect(resume).toBeGreaterThan(-1);
    expect(resume).toBeLessThan(issuer);
    expect(resume).toBeLessThan(bind);
    expect(source).toContain("await archiveAndOpenGuide(effectiveScopeId, officialOriginal.document_snapshot, reservedGuideWindow)");
    expect(source).toContain("if (!canResumeQaFrozenGuide(officialOriginal))");
  });
});
