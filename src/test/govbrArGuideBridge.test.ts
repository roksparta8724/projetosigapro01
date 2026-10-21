import { describe, expect, it } from "vitest";
import { availableGovbrArGuideTypes, formatGovbrArGuideLabel, hasGovbrArReference, isGovbrArGuideDocument, validateGovbrArPdf } from "@/components/platform/GovbrArGuideBridge";
import type { ProcessDocument } from "@/lib/platform";

function govbrDoc(reference: string, fileHash = "a".repeat(64)): ProcessDocument {
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
    expect(isGovbrArGuideDocument({ ...imported, source: "profissional" })).toBe(false);
    expect(isGovbrArGuideDocument({ ...imported, fileHash: "invalid" })).toBe(false);
    expect(isGovbrArGuideDocument({ ...imported, label: "Alvará de Aprovação" })).toBe(false);
  });

  it("detecta repetição da mesma referência oficial, ignorando caixa", () => {
    expect(hasGovbrArReference([govbrDoc("AR-2026-001")], "ar-2026-001")).toBe(true);
    expect(hasGovbrArReference([govbrDoc("AR-2026-001")], "AR-2026-002")).toBe(false);
    expect(hasGovbrArReference([], "AR-2026-001")).toBe(false);
  });

  it("separa Cadastro Eventual do Protocolo e impostos do Financeiro", () => {
    expect(availableGovbrArGuideTypes("protocolo").map((type) => type.kind)).toEqual(["protocolo"]);
    expect(availableGovbrArGuideTypes("financeiro").map((type) => type.kind))
      .toEqual(["iss_obra", "aprovacao_final", "habite_se"]);
    expect(formatGovbrArGuideLabel("1846/2026", "protocolo")).toContain("Cadastro Eventual");
    expect(formatGovbrArGuideLabel("14805/2023", "iss_obra")).toContain("Cadastro Mobiliário");
  });

  it("identifica cada tipo de taxa, sem gerar linha digitável ou cobrança", () => {
    expect(formatGovbrArGuideLabel("AR-20", "habite_se")).toContain("Habite-se");
    expect(formatGovbrArGuideLabel("AR-21", "iss_obra")).toContain("ISSQN");
  });

  it("rejeita arquivos não PDF antes de enviar ao R2", async () => {
    const file = {
      name: "guia.pdf",
      size: 40,
      slice: () => ({ arrayBuffer: async () => new TextEncoder().encode("INVALID").buffer }),
    } as unknown as File;
    await expect(validateGovbrArPdf(file)).rejects.toThrow("assinatura de PDF");
  });

  it("rejeita nomes de arquivo sem extensão PDF", async () => {
    const file = new File(["not a valid PDF document at all"], "guia.txt", { type: "text/plain" });
    await expect(validateGovbrArPdf(file)).rejects.toThrow("PDF original");
  });
});
