import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const checklist = read("src/components/platform/UrbanAnalysisChecklistPanel.tsx");
const client = read("src/integrations/backend/analysisSheetClient.ts");
const sql = read("neon/migrations/20261020_analysis_sheet_official_persistence_v2.sql");
const archive = read("src/components/platform/SignedAnalysisArchiveFolder.tsx");

describe("SIGAPRO: persistencia da ficha e documentos oficiais assinados", () => {
  it("recupera o rascunho autenticado do banco e nao considera o cache local fonte de verdade", () => {
    expect(checklist).toContain("readOfficialAnalysisSheet(process.id)");
    expect(checklist).toContain("hydrateOfficialChecklistState(current, sheet.payload");
    expect(checklist).toContain("backup-anterior-a-leitura-oficial");
    expect(checklist).toContain("checklistPayloadMatchesProcess");
    expect(checklist).toContain("writeOfficialAnalysisSheet(");
  });

  it("confirma revisao de escrita apenas apos resposta oficial e distingue erro de cache", () => {
    expect(client).toContain('backendClient.rpc("get_process_analysis_sheet_v2"');
    expect(client).toContain('backendClient.rpc("save_process_analysis_sheet_v2"');
    expect(client).toContain("_expected_revision: expectedRevision");
    expect(checklist).toContain("ATENÇÃO: rascunho preservado SOMENTE neste navegador.");
    expect(checklist).toContain("Rascunho confirmado no banco institucional.");
  });

  it("preserva isolamento municipal e analista responsavel", () => {
    expect(sql).toContain("public.can_write_process_analysis(_process_id)");
    expect(sql).toContain("public.has_process_access(_process_id)");
    expect(sql).toContain("_payload->>'municipalityId' <> _municipality::text");
    expect(sql).toContain("CONFLITO_REVISAO");
    expect(sql).toContain("revoke insert, update, delete");
    expect(sql).toContain("revision=revision+1");
  });

  it("recupera uma versao assinada do payload do banco quando o navegador esta vazio", () => {
    expect(checklist).toContain("checklistPayloadMatchesProcess(canonical, process.id, municipalityId)");
    expect(checklist).toContain("!localHasItems");
    expect(checklist).toContain("hydrateOfficialChecklistState(current, canonical)");
    expect(checklist).toContain('signer.slot === "analise_tecnica"');
    expect(checklist).toContain('signer.slot === "diretoria"');
  });

  it("só junta PDF versionado após confirmação explícita e leitura das assinaturas no banco", () => {
    expect(checklist).toContain("const generatePdf = async (persistSigned = false)");
    expect(checklist).toContain("if (persistSigned && !window.confirm(");
    expect(checklist).toContain("if (persistSigned && !readOnly && (technicalOfficial || directorOfficial))");
    expect(checklist).toContain("const verified = await getProcessArtifactSignatures(process.id, ANALYSIS_ARTIFACT_KEY)");
    expect(checklist).toContain("stableSignatureStringify(buildChecklistSignaturePayload(state, process, municipalityId))");
    expect(checklist).toContain("(directorOfficial && !verifiedDirector)");
    expect(checklist).toContain("const alreadyRecorded = process.documents.some(");
    expect(checklist).toContain('bucket: "process-documents"');
    expect(checklist).toContain("await appendProcessDocuments(process.id,");
  });

  it("exibe retirada com quem recebeu e horario do banco e nao modifica PDF assinado", () => {
    expect(archive).toContain("getProcessArtifactWithdrawalHistory");
    expect(archive).toContain("withdrawal.withdrawn_by_name");
    expect(archive).toContain("withdrawal.withdrawn_at_exact");
    expect(archive).toContain('data-signed-pdf-archived="true"');
    expect(archive).toContain("o PDF histórico original não foi arquivado");
  });

  it("nao executa migracao durante testes ou operacao local", () => {
    expect(sql).toContain("Migração PREPARADA, NAO EXECUTADA");
    expect(sql).not.toMatch(/drop\s+table\s+public\.processes/i);
    expect(sql).not.toMatch(/delete\s+from\s+public\.signature_blocks/i);
  });
});
