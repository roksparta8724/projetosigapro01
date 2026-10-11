import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("commercial proposal generator", () => {
  it("does not auto-attach the first municipality to a new proposal", () => {
    const source = read("src/pages/saas/MasterPlansPage.tsx");
    expect(source).not.toContain("setSelectedInstitutionId(safeInstitutions[0].id)");
    expect(source).toContain('value={selectedInstitutionId || "__manual"}');
    expect(source).toContain("Preenchimento manual — novo cliente");
    expect(source).toContain("O gerador não vincula automaticamente nenhuma Prefeitura");
  });

  it("accepts a handwritten/digitalized signature image and sends it to the PDF", () => {
    const page = read("src/pages/saas/MasterPlansPage.tsx");
    const pdf = read("src/lib/commercialPdf.ts");
    expect(page).toContain("signatureImageDataUrl");
    expect(page).toContain("Assinatura digitalizada (opcional)");
    expect(page).toContain("signatureImageDataUrl,");
    expect(pdf).toContain("signatureImageDataUrl?: string");
    expect(pdf).toContain("signatureAsset");
    expect(pdf).toContain("ASSINATURA INSTITUCIONAL");
  });

  it("allows manual proposals without an existing municipality record", () => {
    const source = read("src/pages/saas/MasterPlansPage.tsx");
    expect(source).toContain('if (!customerName.trim())');
    expect(source).toContain("Informe a Prefeitura ou cliente da proposta.");
    expect(source).not.toContain("Selecione uma prefeitura antes de gerar a proposta.");
  });
});
