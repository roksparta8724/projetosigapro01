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
  const withdrawalMigration = readFileSync(
    resolve(process.cwd(), "neon/migrations/20261015_analysis_withdrawal_record.sql"),
    "utf8",
  );
  const withdrawalDirectMigration = readFileSync(
    resolve(process.cwd(), "neon/migrations/20261016_analysis_withdrawal_direct_table.sql"),
    "utf8",
  );

  it("never signs the technical checklist only in localStorage", () => {
    expect(checklist).toContain("signProcessArtifactWithPassword");
    expect(checklist).toContain('type="password"');
    expect(checklist).toContain("Confirmar com minha senha");
    expect(checklist).toContain("technicalOfficial");
    expect(checklist).toContain("directorOfficial");
    expect(checklist).not.toContain("fiscalOfficial");
    expect(checklist).not.toContain("conferencia_fiscal");
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

  it("enforces analyst-and-director-only signing for the municipal analysis checklist", () => {
    expect(api).toContain("SIGNER_SLOT_NOT_ALLOWED_FOR_ARTIFACT");
    expect(api).toContain('artifactType === "urban_analysis_checklist"');
    expect(api).toContain('"analise_tecnica", "diretoria"');
    expect(api).toContain("somente o Analista Técnico e a Diretoria podem assinar");
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

  it("opens the official PDF in a reserved native viewer tab at a readable institutional zoom", () => {
    expect(checklist).toContain('window.open("about:blank", "_blank")');
    expect(checklist).toContain("reservedPdfWindow.location.replace(viewerUrl)");
    expect(checklist).toContain("#page=1&zoom=125&toolbar=1&navpanes=0&scrollbar=1");
    expect(checklist).toContain('"UseNone" as Parameters<typeof doc.setDisplayMode>[2]');
    expect(checklist).toContain('creator: "SIGAPRO Municipal"');
    expect(checklist).not.toContain("doc.save(fileName)");
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

  it("balances the two-page PDF by filling page one before carrying rows to page two", () => {
    expect(checklist).toContain("takeRowsThatFit");
    expect(checklist).toContain("page1RowsBottomY = 273");
    expect(checklist).toContain("page1Engineering");
    expect(checklist).toContain("page2Engineering");
    expect(checklist).toContain("engineeringSectionTitle");
    expect(checklist).not.toContain('ENGINEERING_ITEMS.slice(0, 20)');
    expect(checklist).not.toContain('"Engenharia - Itens 21 a 31"');
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

  it("keeps this ficha limited to analyst and director signatures and records physical pickup separately", () => {
    expect(checklist).toContain("Assinaturas do Analista Técnico e da Diretoria");
    expect(checklist).toContain("2ª assinatura");
    expect(checklist).not.toContain("Conferência do Fiscal de Obras");
    expect(checklist).not.toContain("Assinar conferência fiscal");
    expect(checklist).toContain("Retirada em mãos");
    expect(checklist).toContain("Retirada em mãos por");
    expect(checklist).toContain("Data da retirada");
    expect(checklist).toContain("saveProcessArtifactWithdrawal");
    expect(checklist).toContain("withdrawalMatchesCurrentVersion");
  });

  it("persists pickup outside the signed payload so later delivery does not invalidate signatures", () => {
    expect(withdrawalMigration).toContain("process_artifact_withdrawals");
    expect(withdrawalMigration).toContain("upsert_process_artifact_withdrawal_v1");
    expect(withdrawalMigration).toContain("get_process_artifact_withdrawal_v1");
    expect(withdrawalMigration).toContain("Retirada em mãos registrada");
    expect(withdrawalMigration).toContain("artifact_hash");
    expect(withdrawalMigration).toContain("alter column artifact_hash drop not null");
    expect(withdrawalMigration).not.toContain("precisam estar concluídas antes de registrar a retirada");
    expect(checklist).toContain('disabled={!canRecordWithdrawal || withdrawalBusy}');
    expect(checklist).not.toContain('disabled={!canSignTechnical || !isFullySigned || withdrawalBusy}');
    expect(checklist).not.toContain("A retirada será liberada para registro após as assinaturas");
    expect(checklist).not.toContain("withdrawn_by_name: state");
  });

  it("keeps pickup inputs readable and prints the latest saved pickup without 'Não registrada'", () => {
    expect(checklist).toContain("!bg-white !text-slate-950");
    expect(checklist).toContain("caret-sky-600");
    expect(checklist).toContain("[color-scheme:light]");
    expect(checklist).toContain("focus:!bg-sky-700");
    expect(checklist).toContain("focus:!text-white");
    expect(checklist).toContain("focus:[&::-webkit-datetime-edit]:!text-white");
    expect(checklist).toContain("getProcessArtifactWithdrawal");
    expect(checklist).toContain("pdfWithdrawalRecord");
    expect(checklist).toContain("____________________________________________");
    expect(checklist).toContain("____/____/________");
    expect(checklist).not.toContain('Retirada por: ${withdrawalMatchesCurrentVersion ? withdrawalRecord?.withdrawn_by_name : "Não registrada"}');
    expect(checklist).not.toContain(': "Não registrada"');
  });

  it("persists pickup through the protected table instead of the stale RPC schema cache", () => {
    expect(client).toContain('.from("process_artifact_withdrawals")');
    expect(client).toContain('.upsert(row, { onConflict: "process_id,artifact_key" })');
    expect(client).not.toContain('"upsert_process_artifact_withdrawal_v1"');
    expect(withdrawalDirectMigration).toContain("enable row level security");
    expect(withdrawalDirectMigration).toContain("process_artifact_withdrawals_insert");
    expect(withdrawalDirectMigration).toContain("trg_prepare_process_artifact_withdrawal_v1");
    expect(withdrawalDirectMigration).toContain("trg_audit_process_artifact_withdrawal_v1");
  });

  it("prints pickup from DB or current form and keeps success feedback to only Registrado", () => {
    expect(checklist).toContain("pdfWithdrawalRecord?.withdrawn_by_name?.trim()");
    expect(checklist).toContain("withdrawalName.trim()");
    expect(checklist).toContain("pdfWithdrawalRecord?.withdrawn_at?.slice(0, 10)");
    expect(checklist).toContain("withdrawalDate");
    expect(checklist).toContain('setNotice("Registrado")');
    expect(checklist).not.toContain("PDF oficial gerado em 2 páginas");
  });

  it("forces white characters on the blue native date selection", () => {
    expect(checklist).toContain("[&::-webkit-datetime-edit-day-field:focus]:!text-white");
    expect(checklist).toContain("[&::-webkit-datetime-edit-month-field:focus]:!text-white");
    expect(checklist).toContain("[&::-webkit-datetime-edit-year-field:focus]:!text-white");
    expect(checklist).toContain("focus:[&::-webkit-datetime-edit-text]:!text-white");
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
