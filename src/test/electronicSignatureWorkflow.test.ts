import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("electronic signature workflow", () => {
  const migration = read("neon/migrations/20261015122500_electronic_signatures.sql");
  const unified = read("neon/migrations/20261015143000_unified_electronic_signature_workflow.sql");
  const atomicProtocol = read("neon/migrations/20261015150000_atomic_signed_external_protocol.sql");
  const workflowReadModels = read("neon/migrations/20261015153000_signature_workflow_read_models.sql");
  const backend = read("src/integrations/backend/platformImpl.ts");
  const dialog = read("src/components/platform/ElectronicSignatureDialog.tsx");
  const analysis = read("src/pages/saas/DocumentAnalysisPage.tsx");
  const processDetail = read("src/pages/saas/ProcessDetailPage.tsx");
  const guide = read("src/components/GuiaRecolhimentoOficial.tsx");
  const protocol = read("src/pages/saas/ProtocolarProjetoPage.tsx");
  const viewer = read("src/pages/saas/DocumentViewerPage.tsx");
  const seal = read("src/components/platform/ElectronicSignatureSeal.tsx");
  const verification = read("src/pages/SignatureVerificationPage.tsx");
  const signedWorkflow = read("src/components/platform/SignedApprovalWorkflowPanel.tsx");

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
    expect(migration).toContain("approve_process_document_signed_v2");
    expect(migration).toContain("select d.process_id,d.version,lower(d.file_hash)");
    expect(migration).toContain("public.review_process_document(_document_id,'aprovado')");
    expect(analysis).toContain("approveRemoteProcessDocumentWithSignature");
    expect(analysis).not.toContain("sha256RemoteFile(accessUrl)");
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
    expect(dialog).toContain("Cada operação de assinatura exige nova confirmação de senha");
  });

  it("prints a visible electronic signature seal on the official guide", () => {
    expect(guide).toContain("assinaturaEletronica");
    expect(guide).toContain("Documento assinado eletronicamente por");
    expect(guide).toContain("Código:");
    expect(guide).toContain("SHA-256:");
    expect(processDetail).toContain("electronicSignatureLevelLabel");
  });

  it("requires a real content hash and signs professional protocol documents atomically", () => {
    expect(unified).toContain("append_process_documents_v2");
    expect(unified).toContain("Documento sem SHA-256 real do conteudo");
    expect(unified).toContain("sign_professional_process_document_v1");
    expect(atomicProtocol).toContain("create_signed_external_process_v1");
    expect(atomicProtocol).toContain("professional_signature_complete");
    expect(protocol).not.toContain('signed: normalizeLabel(item.label).includes("projeto arquitetonico")');
    expect(protocol).toContain("createRemoteSignedExternalProcess");
    expect(protocol).toContain("fileHash: uploaded.fileHash");
  });

  it("prevents cross-process professional signing and exposes public verification without PII", () => {
    expect(unified).toContain("Profissional sem vinculo");
    expect(unified).toContain("verify_electronic_signature_v1");
    expect(unified).not.toContain("'cpf'");
    expect(unified).not.toContain("'email'");
    expect(verification).toContain("Verificação de assinatura eletrônica");
    expect(verification).toContain("sem expor CPF, e-mail");
  });

  it("shows reusable institutional signature seals inside the official document viewer", () => {
    expect(seal).toContain("Assinatura eletrônica SIGAPRO");
    expect(seal).toContain("Código de verificação");
    expect(seal).toContain("SHA-256 do conteúdo");
    expect(viewer).toContain("ElectronicSignatureSeal");
    expect(viewer).not.toContain("window.location.replace(accessUrl)");
  });

  it("preserves the ordered analyst director secretary signed workflow", () => {
    expect(unified).toContain("sign_and_finalize_process_technical_conclusion_electronic_v1");
    expect(unified).toContain("sign_required_process_document_electronic_v1");
    expect(unified).toContain("execute_signed_superior_approval_action_electronic_v1");
    expect(workflowReadModels).toContain("get_my_technical_conclusion_editor_v1");
    expect(workflowReadModels).toContain("list_my_required_process_documents_for_signature_v1");
    expect(signedWorkflow).toContain("Assinar e encaminhar");
    expect(signedWorkflow).toContain("Assinar documento");
    expect(signedWorkflow).toContain("Assinar decisão superior");
    expect(signedWorkflow).toContain("Concluir processo aprovado");
  });
});
