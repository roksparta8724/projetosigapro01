import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("electronic signature workflow", () => {
  const migration = read("neon/migrations/20261015122500_electronic_signatures.sql");
  const backend = read("src/integrations/backend/platformImpl.ts");
  const dialog = read("src/components/platform/ElectronicSignatureDialog.tsx");
  const analysis = read("src/pages/saas/DocumentAnalysisPage.tsx");
  const processDetail = read("src/pages/saas/ProcessDetailPage.tsx");
  const guide = read("src/components/GuiaRecolhimentoOficial.tsx");

  it("never stores the password in the signature ledger", () => {
    expect(migration).toContain("create table if not exists public.electronic_signatures");
    expect(migration).not.toContain("password text");
    expect(migration).not.toContain("password_hash");
    expect(migration).toContain("auth_method text not null default 'password'");
  });

  it("requires a recently revalidated auth token before signing", () => {
    expect(migration).toContain("require_recent_password_auth_v1");
    expect(migration).toContain("Sua confirmação de senha expirou");
    expect(migration).toContain("current_auth_iat_v1");
    expect(backend).toContain("signInWithPassword");
    expect(backend).toContain("A identidade revalidada não corresponde");
  });

  it("anchors signatures to SHA-256 and a server generated verification code", () => {
    expect(migration).toContain("content_sha256");
    expect(migration).toContain("extensions.digest");
    expect(migration).toContain("'SIG-'||to_char");
    expect(migration).toContain("signature_fingerprint");
  });

  it("approves documents transactionally with a password-backed signature", () => {
    expect(migration).toContain("approve_process_document_signed_v1");
    expect(migration).toContain("public.review_process_document(_document_id,'aprovado')");
    expect(analysis).toContain("approveRemoteProcessDocumentWithSignature");
    expect(analysis).toContain("sha256RemoteFile(accessUrl)");
    expect(analysis).toContain("Aprovar e assinar");
  });

  it("signs guide issuance and dispatches with server-side hashes", () => {
    expect(migration).toContain("issue_process_payment_guide_signed_v2");
    expect(migration).toContain("create_process_dispatch_signed_v2");
    expect(migration).toContain("to_jsonb(g)::text");
    expect(migration).toContain("to_jsonb(d)::text");
    expect(processDetail).toContain("issueRemotePaymentGuideWithSignature");
    expect(processDetail).toContain("createRemoteProcessDispatchWithSignature");
    expect(processDetail).toContain("Assinar e efetivar despacho");
  });

  it("requires explicit consent and current password in the premium signing dialog", () => {
    expect(dialog).toContain('type="password"');
    expect(dialog).toContain('autoComplete="current-password"');
    expect(dialog).toContain("Sua senha é enviada somente ao provedor de autenticação");
    expect(dialog).toContain("Reconheço o conteúdo acima");
    expect(dialog).toContain("cada assinatura exige nova confirmação de senha");
  });

  it("prints a visible electronic signature seal on the official guide", () => {
    expect(guide).toContain("assinaturaEletronica");
    expect(guide).toContain("Documento assinado eletronicamente por");
    expect(guide).toContain("Código:");
    expect(guide).toContain("SHA-256:");
    expect(processDetail).toContain("electronicSignatureLevelLabel");
  });
});
