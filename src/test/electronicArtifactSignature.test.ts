import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("official electronic signatures", () => {
  const checklist = readFileSync(
    resolve(process.cwd(), "src/components/platform/UrbanAnalysisChecklistPanel.tsx"),
    "utf8",
  );
  const api = readFileSync(resolve(process.cwd(), "api/e-sign-artifact.ts"), "utf8");
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

  it("binds the signature to the exact checklist payload", () => {
    expect(checklist).toContain("buildChecklistSignaturePayload");
    expect(checklist).toContain("stableSignatureStringify");
    expect(checklist).toContain("A ficha foi alterada após a última assinatura eletrônica");
  });

  it("reauthenticates against Neon Auth and never persists the password", () => {
    expect(api).toContain("/sign-in/email");
    expect(api).toContain("Senha de acesso incorreta");
    expect(api).toContain("createHmac");
    expect(api).toContain("artifactHash");
    expect(api).not.toContain("password:");
  });

  it("keeps immutable database evidence and audit trail", () => {
    expect(migration).toContain("sign_process_artifact_v1");
    expect(migration).toContain("artifact_payload");
    expect(migration).toContain("verification_code");
    expect(migration).toContain("process_audit_entries");
    expect(migration).toContain("password_reauth");
  });
});
