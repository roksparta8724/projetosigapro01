import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("official electronic signatures", () => {
  const checklist = readFileSync(
    resolve(process.cwd(), "src/components/platform/UrbanAnalysisChecklistPanel.tsx"),
    "utf8",
  );
  const api = readFileSync(resolve(process.cwd(), "api/e-sign-artifact.ts"), "utf8");
  const client = readFileSync(
    resolve(process.cwd(), "src/integrations/esign/artifactClient.ts"),
    "utf8",
  );
  const viteConfig = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");
  const migration = readFileSync(
    resolve(process.cwd(), "neon/migrations/20261015_process_artifact_e_signatures.sql"),
    "utf8",
  );
  const migrationV2 = readFileSync(
    resolve(process.cwd(), "neon/migrations/20261015_process_artifact_e_signatures_v2.sql"),
    "utf8",
  );
  const directorRequestMigration = readFileSync(
    resolve(process.cwd(), "neon/migrations/20261015_director_signature_request_flow.sql"),
    "utf8",
  );

  it("never signs the technical checklist only in localStorage", () => {
    expect(checklist).toContain("signProcessArtifactWithPassword");
    expect(checklist).toContain('type="password"');
    expect(checklist).toContain("Confirmar com minha senha");
    expect(checklist).toContain("technicalOfficial");
    expect(checklist).toContain("fiscalOfficial");
  });

  it("builds the protocol label from the string field and never from the whole process object", () => {
    expect(checklist).toContain("protocol: formatOfficialProcessNumber(process.protocol)");
    expect(checklist).not.toContain("protocol: formatOfficialProcessNumber(process),");
  });

  it("binds the signature to the exact checklist payload", () => {
    expect(checklist).toContain("buildChecklistSignaturePayload");
    expect(checklist).toContain("stableSignatureStringify");
    expect(checklist).toContain("A ficha foi alterada após a última assinatura eletrônica");
  });

  it("uses the unprotected official custom domain for localhost signing", () => {
    expect(viteConfig).toContain('"https://sigapromunicipal.com.br"');
    expect(viteConfig).not.toContain("projetosigapro01-git-fix-analise-d2ff63-roksparta8724s-projects.vercel.app");
    expect(viteConfig).not.toContain('import eSignArtifactHandler from "./api/e-sign-artifact"');
    expect(viteConfig).toContain('stage: "dev_proxy"');
  });

  it("never renders object Object when an API or platform error is structured JSON", () => {
    expect(client).toContain("normalizeApiError");
    expect(client).toContain("readApiResponse");
    expect(client).not.toContain("throw new Error(payload.error ||");
  });

  it("returns a precise stage and code for every critical server failure", () => {
    expect(api).toContain("SIGNER_CONTEXT_DENIED");
    expect(api).toContain("PASSWORD_REAUTH_FAILED");
    expect(api).toContain("AUTH_SERVICE_UNAVAILABLE");
    expect(api).toContain("SIGNATURE_RPC_FAILED");
    expect(api).toContain("SIGNATURE_SERVER_ERROR");
  });

  it("reauthenticates against Neon Auth and never persists the password", () => {
    expect(api).toContain("/sign-in/email");
    expect(api).toContain("Senha de acesso incorreta");
    expect(api).toContain("artifactHash");
    expect(api).toContain("EXPECTED_SIGNATURE_SECRET_HASH");
    expect(api).toContain("sign_process_artifact_v2");
    expect(api).not.toContain("_password");
    expect(api).not.toContain("artifact_payload: password");
    expect(api).toContain("_artifact_payload: payload");
  });

  it("confirms the signature by reading it back from the official database before visual success", () => {
    expect(checklist).toContain("SIGNATURE_READBACK_FAILED");
    expect(checklist).toContain("getProcessArtifactSignatures(process.id, ANALYSIS_ARTIFACT_KEY)");
    expect(checklist).toContain("payloadMatches");
    expect(checklist).toContain("Nenhum sucesso visual foi aplicado");
  });

  it("uses a server-only key fingerprint in v2 and never depends on the legacy HMAC secret table", () => {
    expect(api).toContain("sign_process_artifact_v2");
    expect(api).toContain("EXPECTED_SIGNATURE_SECRET_HASH");
    expect(migrationV2).toContain("sign_process_artifact_v2");
    expect(migrationV2).toContain("b90c8fd07d7b6232b4043961d8b9cb65e289628ce7b6b759fc7997d93c0533cd");
    expect(migrationV2).not.toContain("select secret_value");
  });

  it("generates the municipal analysis PDF in exactly two pages with the crest and signature evidence", () => {
    expect(checklist).toContain("resolveMunicipalityLogoUrl");
    expect(checklist).toContain("loadPdfImageDataUrl");
    expect(checklist).toContain("Brasao-campo-limpo-paulista2.png");
    expect(checklist).toContain("protocolLabel");
    expect(checklist).toContain("doc.addImage");
    expect(checklist).toContain("Página ${pageNumber} de ${totalPages}");
    expect(checklist).toContain("ASSINATURA ELETRÔNICA VÁLIDA");
    expect(checklist).toContain("Código:");
    expect(checklist).toContain("SHA-256:");
    expect(checklist.match(/doc\.addPage\(\)/g) ?? []).toHaveLength(1);
    expect(checklist).not.toContain('doc.setFontSize(28);');
  });

  it("shows the verified electronic signature as a premium evidence card on screen", () => {
    expect(checklist).toContain("renderSignatureEvidence");
    expect(checklist).toContain("Assinatura eletrônica válida");
    expect(checklist).toContain("Código de verificação");
    expect(checklist).toContain("Integridade SHA-256");
    expect(checklist).toContain("Gerando PDF oficial...");
    expect(checklist).toContain("Gerar PDF oficial");
    expect(checklist).not.toContain("Gerar PDF rascunho");
    expect(checklist).not.toContain("PDF premium de rascunho");
    expect(checklist).not.toContain("RASCUNHO - aguardando conferência fiscal");
  });

  it("lets the analyst request the director signature and exposes it in the official PDF", () => {
    expect(checklist).toContain("requestDirectorSignature");
    expect(checklist).toContain("Solicitar assinatura do Diretor");
    expect(checklist).toContain("Assinar como Diretor");
    expect(checklist).toContain('"diretoria"');
    expect(checklist).toContain("state.directorSignature");
    expect(checklist).toContain('"Diretoria"');
    expect(checklist).toContain("ASSINATURA SOLICITADA");
  });

  it("binds director signing to a formal pending request for the exact signed artifact", () => {
    expect(directorRequestMigration).toContain("process_signature_requests");
    expect(directorRequestMigration).toContain("request_process_artifact_signature_v1");
    expect(directorRequestMigration).toContain("get_process_artifact_signature_request_v1");
    expect(directorRequestMigration).toContain("trg_enforce_process_signature_request");
    expect(directorRequestMigration).toContain("artifact_hash=_block.evidence_hash");
    expect(directorRequestMigration).toContain("status='stale'");
    expect(directorRequestMigration).toContain("Assinatura da Diretoria solicitada");
  });

  it("keeps immutable database evidence and audit trail", () => {
    expect(migration).toContain("sign_process_artifact_v1");
    expect(migration).toContain("artifact_payload");
    expect(migration).toContain("verification_code");
    expect(migration).toContain("process_audit_entries");
    expect(migration).toContain("password_reauth");
  });
});
