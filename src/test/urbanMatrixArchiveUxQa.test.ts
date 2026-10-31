import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const importer=readFileSync("src/components/platform/UrbanLegalMatrixImporter.tsx","utf8");
const board=readFileSync("src/components/platform/UrbanMatrixBatchReviewBoard.tsx","utf8");
const archive=readFileSync("src/components/platform/UrbanMatrixArchivePanel.tsx","utf8");
const css=readFileSync("src/styles/surface-polarity.css","utf8");
const migration=readFileSync("neon/migrations/20261031_urban_matrix_archive_reopen_qa_v1.sql","utf8");
describe("SIGAPRO QA – acervo visível, OCR liberado e contraste premium",()=>{
  it("lista rascunhos sem depender de recarregar JSON/PDF e abre registro da prefeitura",()=>{
    expect(importer).toContain("<UrbanMatrixArchivePanel municipalityId={municipalityId}");
    expect(archive).toContain('"list_urban_matrix_batch_staging_v1"');
    expect(archive).toContain('"get_urban_matrix_batch_staging_v1"');
    expect(archive).toContain('data-urban-archive-history="true"');
    expect(archive).toContain('data-urban-archive-opened="true"');
    expect(archive).toContain('onRestore(opened)');
    expect(importer).toContain("verifyPdfAndHash(file)");
    expect(importer).toContain("actualHash!==draft.document_sha256");
    expect(importer).toContain("setArchiveReloadToken(previous=>previous+1)");
  });
  it("recusa recriar lote já existente, preservando 23 linhas e vigência pendente",()=>{
    expect(board).toContain("h.document_sha256===reviewPackage.arquivo_sha256");
    expect(board).toContain("disabled={busy||savedHere||archiveLookupBusy||archiveLookupFailed||!qaWriteEnabled}");
    expect(board).toContain("Rascunho já arquivado no Neon QA");
    expect(board).toContain("data-urban-batch-history-error");
    expect(migration).toContain("public.is_urban_regulation_admin_v1(_municipality_id)");
    expect(migration).toContain("municipality_id=_municipality_id");
    expect(migration).toContain("'pending_legal_review'");
    expect(migration).not.toContain("activate_urban_regulation_v1");
  });
  it("preenche página e escopo pela matriz verificada antes de habilitar IA visual",()=>{
    expect(importer).toContain("setPage(String(firstRow.pagina_pdf))");
    expect(importer).toContain("setZone(normalizeUrbanCode(firstRow.zona_conforme_tabela))");
    expect(importer).toContain("onChange={e=>openBatchRow(Number(e.target.value))}");
    expect(importer).toContain('data-urban-ai-page-status="true"');
    expect(importer).toContain('data-urban-text-ai-prerequisites="true"');
    expect(importer).toContain("text.trim().length<40");
    expect(importer).toContain("Nenhuma regra foi ativada");
  });
  it("aplica branco real aos botões azuis sem apagar texto de cards claros",()=>{
    expect(board).toContain('data-sigapro-contrast="dark"');
    expect(archive).toContain('data-urban-archive-header="true"');
    expect(css).toContain('button[data-sigapro-contrast="dark"]');
    expect(css).toContain("-webkit-text-fill-color:#fff !important");
    expect(css).toContain('[data-urban-archive-history="true"] p');
  });
});
