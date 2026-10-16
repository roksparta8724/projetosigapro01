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

  it("generates the permit PDF from the official fill modal after choosing a signing path", () => {
    expect(panel).toContain("Enviar ao Diretor para assinar eletronicamente");
    expect(panel).toContain("Gerar PDF para assinatura à caneta");
    expect(panel).toContain("municipalityLogoUrl");
    expect(panel).toContain("municipalityAddress");
    expect(panel).toContain("municipalityPhone");
    expect(panel).toContain("municipalityEmail");
  });

  it("keeps the signing actions visible and routes only to an eligible director", () => {
    expect(panel).toContain("sticky bottom-0");
    expect(panel).toContain("directors.length === 0");
    expect(panel).toContain("nenhum perfil ativo está cadastrado como Diretor(a)");
    expect(panel).toContain("Gerar PDF para assinatura à caneta");
  });

  it("uses director as the only required municipal signer", () => {
    expect(panel).toContain("Assinatura da Diretoria");
    expect(panel).not.toContain("Assinar como Analista");
    expect(panel).not.toContain("Assinatura da Análise Técnica");
    expect(permitPdf).toContain("directorOfficial");
    expect(permitPdf).toContain("ALVARÁ MUNICIPAL EMITIDO");
    expect(signatureApi).toContain("PERMIT_DIRECTOR_REQUEST_REQUIRED");
    expect(signatureApi).toContain("PERMIT_DIRECTOR_SIGNATURE_REQUIRED");
  });

  it("keeps secretary electronic signature optional and reserves a clean secretary line in the manual PDF", () => {
    expect(permitLib).toContain("secretarySignature");
    expect(panel).toContain("Assinar também como Secretário");
    expect(panel).toContain("secretaryOfficial");
    expect(permitPdf).toContain("const showManualAuthorityLines");
    expect(permitPdf).toContain("const hasSecretary = secretaryOfficial || showManualAuthorityLines");
    expect(permitPdf).toContain("Secretaria municipal");
    expect(permitPdf).toContain("Secretário(a) Municipal");
  });

  it("requires password-confirmed electronic signing and verification evidence", () => {
    expect(panel).toContain("signProcessArtifactWithPassword");
    expect(panel).toContain('type="password"');
    expect(panel).toContain("Confirmar com minha senha");
    expect(panel).toContain("getProcessArtifactSignatures");
    expect(permitPdf).toContain("VALIDAÇÃO MUNICIPAL");
    expect(permitPdf).toContain("Código:");
    expect(permitPdf).toContain("SHA-256:");
  });

  it("keeps signature workflow instructions out of the official PDF", () => {
    expect(permitPdf).not.toContain("ASSINATURA MANUAL");
    expect(permitPdf).not.toContain("ALVARÁ PREPARADO PARA ASSINATURA À CANETA");
    expect(permitPdf).not.toContain("Pronto para assinatura da Diretoria à caneta");
    expect(permitPdf).not.toContain("assinatura manual da Diretoria");
    expect(permitPdf).not.toContain("A assinatura da Secretaria é complementar");
    expect(permitPdf).toContain("ALVARÁ DE CONSTRUÇÃO");
    expect(permitPdf).toContain("Diretor(a) Responsável");
    expect(permitPdf).toContain("Secretário(a) Municipal");
    expect(permitPdf).toContain("Processo Administrativo");
  });

  it("builds a light premium municipal PDF with crest and contact data", () => {
    expect(permitPdf).toContain("CAMPO_LIMPO_BRASAO_FALLBACK");
    expect(permitPdf).toContain("loadImageDataUrl");
    expect(permitPdf).toContain("pdf.addImage");
    expect(permitPdf).toContain("effectiveAddress");
    expect(permitPdf).toContain("effectivePhone");
    expect(permitPdf).toContain("Prefeitura Municipal de Campo Limpo Paulista");
    expect(permitPdf).toContain("municipalityEmail");
    expect(permitPdf).not.toContain("RASCUNHO - SEM VALIDADE");
  });
});
