import { describe, expect, it } from "vitest";
import { formatGovbrArGuideLabel, hasGovbrArReference, isGovbrArGuideDocument, validateGovbrArPdf } from "@/components/platform/GovbrArGuideBridge";
import type { ProcessDocument } from "@/lib/platform";

function govbrDoc(reference: string, fileHash = "test-hash"): ProcessDocument {
  return {
    id: "doc-1",
    label: formatGovbrArGuideLabel(reference, "protocolo"),
    uploaded: true,
    required: false,
    signed: false,
    source: "integracao",
    filePath: "municipalities/00000000-0000-4000-8000-000000000001/govbr-ar/mock/test.pdf",
    fileHash,
    version: 1,
    mimeType: "application/pdf",
  };
}

describe("Ponte GOVBR/AR — guia oficial importada", () => {
  it("identifica PDF GOVBR arquivado, sem confundir outros documentos", () => {
    const imported = govbrDoc("AR-2026-001");
    expect(isGovbrArGuideDocument(imported)).toBe(true);
    expect(isGovbrArGuideDocument({ ...imported, uploaded: false })).toBe(false);
    expect(isGovbrArGuideDocument({ ...imported, label: "Alvará de Aprovação" })).toBe(false);
  });

  it("detecta repetição da mesma referência oficial, ignorando caixa", () => {
    expect(hasGovbrArReference([govbrDoc("AR-2026-001")], "ar-2026-001")).toBe(true);
    expect(hasGovbrArReference([govbrDoc("AR-2026-001")], "AR-2026-002")).toBe(false);
    expect(hasGovbrArReference([], "AR-2026-001")).toBe(false);
  });

  it("identifica cada tipo de taxa, sem gerar linha digitável ou cobrança", () => {
    expect(formatGovbrArGuideLabel("AR-20", "habite_se")).toContain("Habite-se");
    expect(formatGovbrArGuideLabel("AR-21", "iss_obra")).toContain("ISSQN");
  });

  it("rejeita arquivos não PDF antes de enviar ao R2", async () => {
    const file = new File(["not a pdf file"], "guia.pdf", { type: "application/pdf" });
    await expect(validateGovbrArPdf(file)).rejects.toThrow("assinatura de PDF");
  });

  it("rejeita nomes de arquivo sem extensão PDF", async () => {
    const file = new File(["not a pdf file"], "guia.txt", { type: "text/plain" });
    await expect(validateGovbrArPdf(file)).rejects.toThrow("PDF original");
  });
});
