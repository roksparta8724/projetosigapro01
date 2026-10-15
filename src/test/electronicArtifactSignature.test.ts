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

  it("keeps immutable database evidence and audit trail", () => {
    expect(migration).toContain("sign_process_artifact_v1");
    expect(migration).toContain("artifact_payload");
    expect(migration).toContain("verification_code");
    expect(migration).toContain("process_audit_entries");
    expect(migration).toContain("password_reauth");
  });
});
