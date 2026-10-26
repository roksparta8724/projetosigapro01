import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const external = readFileSync("src/pages/saas/ExternalPaymentsPage.tsx", "utf8");
const original = readFileSync("src/lib/guideOriginal.ts", "utf8");
const native = readFileSync("src/integrations/r2/client.ts", "utf8");
const functionSource = readFileSync("functions/sigaproqa/index.js", "utf8");
const flow = external.slice(
  external.indexOf("const openExternalGuide = async"),
  external.indexOf("  // Enquanto existe guia inicial pendente"),
);

describe("SIGAPRO QA original PDF, not just a temporary bank HTML preview", () => {
  it("resolves the exact Neon guide and opens a previous original BEFORE another bank order", () => {
    const index = flow.indexOf("officialOriginal = await readGuideOriginal(effectiveScopeId, guide.code)");
    const open = flow.indexOf("await openStoredGuide(officialOriginal, reservedGuideWindow)", index);
    expect(index).toBeGreaterThan(0);
    expect(open).toBeGreaterThan(index);
    expect(flow.indexOf("await ensureMercadoPagoGuideCharge(")).toBeGreaterThan(open);
  });
  it("revalidates the sandbox bank reference, environment and canonical barcode from Neon", () => {
    expect(flow).toContain('officialOriginal?.provider_environment === "test"');
    expect(flow).toContain("tested.orderId === officialOriginal?.bank_reference");
    expect(flow).toContain("const sandboxIssued = Boolean(");
    expect(flow).toContain("savedSandbox && officialOriginal");
    expect(flow).toContain("!isGuideSettled(officialOriginal)");
    expect(flow).not.toContain("readGuideOriginal(effectiveScopeId, guide.code).catch(() => null)");
    expect(flow).toContain("sandboxIssued ? confirmedBanking.barcode :");
    expect(flow).toContain("sandboxIssued ? confirmedBanking.digitableLine :");
    expect(flow).toContain("const originalAmount = confirmedOriginal ? Number(confirmedOriginal.amount) : guide.amount;");
    expect(flow).toContain("const issuedAt = confirmedOriginal?.created_at || guide.issuedAt");
  });
  it("never reports issuance until the bank order is read back and verified against the exact Neon process", () => {
    const issue = external.slice(
      external.indexOf("const issueSandboxBoleto = async"),
      external.indexOf("const issueSandboxPix = async"),
    );
    const readIndex = issue.indexOf("const persisted = await readGuideOriginal(effectiveScopeId, guide.code)");
    const verifyIndex = issue.indexOf("verifyPersistedQaBoleto({");
    const successIndex = issue.indexOf('setGuideActionStatus("Boleto de TESTE confirmado');
    expect(readIndex).toBeGreaterThan(0);
    expect(verifyIndex).toBeGreaterThan(readIndex);
    expect(successIndex).toBeGreaterThan(verifyIndex);
    expect(issue).toContain("processId: process.id");
    expect(issue).toContain("guideCode: guide.code");
    expect(flow).toContain("officialOriginal.process_id !== process.id");
  });

  it("archives only a confirmed sandbox guide, never a non-payable QA preview", () => {
    const archive = flow.indexOf("if (!isolatedQa || sandboxIssued) {");
    const preview = flow.indexOf("const opened = openGuiaRecolhimentoOficialWindow(");
    expect(archive).toBeGreaterThan(0);
    expect(preview).toBeGreaterThan(archive);
    expect(flow.slice(archive,preview)).toContain("confirmedOriginal.provider_environment !== \"test\"");
    expect(flow.slice(archive,preview)).toContain("guideDocument.guia.nonPayablePreview");
    expect(flow.slice(archive,preview)).toContain("await archiveAndOpenGuide(effectiveScopeId, guideDocument, reservedGuideWindow)");
    expect(original).toContain("if (props.guia.nonPayablePreview) return false;");
  });
  it("uses isolated Neon Function storage, strictly not R2, for this PDF", () => {
    expect(native).toContain("if (isolatedQa) {");
    expect(native).toContain("return uploadQaNative(");
    expect(native).toContain("if (isolatedQa) return readQaNative(");
    expect(functionSource).toContain('"authorize_payment_guide_original_upload_v2"');
    expect(functionSource).toContain('"authorize_payment_guide_original_read_v1"');
    expect(functionSource).toContain('{"if-none-match":"*"}');
    expect(functionSource).toContain("if(scope.type===\"dam-original\"&&sha(bytes)!==scope.originalSha)");
    expect(original).toContain('"attach_payment_guide_original_v1"');
  });
});
