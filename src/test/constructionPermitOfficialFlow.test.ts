import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("official construction permit workflow", () => {
  const panel = readFileSync(
    resolve(process.cwd(), "src/components/platform/ConstructionPermitPanel.tsx"),
    "utf8",
  );
  const permitLib = readFileSync(
    resolve(process.cwd(), "src/lib/constructionPermit.ts"),
    "utf8",
  );
  const permitPdf = readFileSync(
    resolve(process.cwd(), "src/lib/constructionPermitPdf.ts"),
    "utf8",
  );
  const signatureApi = readFileSync(
    resolve(process.cwd(), "api/e-sign-artifact.ts"),
    "utf8",
  );

  it("generates the permit PDF from the official fill modal", () => {
    expect(panel).toContain("Gerar PDF do Alvará");
    expect(panel).toContain("municipalityLogoUrl");
    expect(panel).toContain("municipalityAddress");
    expect(panel).toContain("municipalityPhone");
    expect(panel).toContain("municipalityEmail");
  });

  it("uses director as the only required municipal signer", () => {
    expect(panel).toContain("Assinatura da Diretoria");
    expect(panel).not.toContain("Assinar como Analista");
    expect(panel).not.toContain("Assinatura da Análise Técnica");
    expect(permitPdf).toContain("directorOfficial");
    expect(permitPdf).toContain("ALVARÁ MUNICIPAL EMITIDO");
    expect(signatureApi).toContain("PERMIT_SIGNER_SLOT_NOT_ALLOWED");
    expect(signatureApi).toContain('"diretoria", "secretaria"');
  });

  it("keeps secretary signature optional and renders it only when actually signed", () => {
    expect(permitLib).toContain("secretarySignature");
    expect(panel).toContain("Assinar também como Secretário");
    expect(panel).toContain("secretaryOfficial");
    expect(permitPdf).toContain("const hasSecretary = secretaryOfficial");
    expect(permitPdf).toContain("Secretaria municipal");
  });

  it("requires password-confirmed electronic signing and verification evidence", () => {
    expect(panel).toContain("signProcessArtifactWithPassword");
    expect(panel).toContain('type="password"');
    expect(panel).toContain("Confirmar com minha senha");
    expect(panel).toContain("getProcessArtifactSignatures");
    expect(permitPdf).toContain("ASSINATURA ELETRÔNICA VÁLIDA");
    expect(permitPdf).toContain("SHA-256:");
  });

  it("builds a light premium municipal PDF with crest and contact data", () => {
    expect(permitPdf).toContain("CAMPO_LIMPO_BRASAO_FALLBACK");
    expect(permitPdf).toContain("loadImageDataUrl");
    expect(permitPdf).toContain("pdf.addImage");
    expect(permitPdf).toContain("municipalityAddress");
    expect(permitPdf).toContain("municipalityPhone");
    expect(permitPdf).toContain("municipalityEmail");
    expect(permitPdf).not.toContain("RASCUNHO - SEM VALIDADE");
  });
});
