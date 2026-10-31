import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const ui=readFileSync("src/components/platform/UrbanLegalMatrixImporter.tsx","utf8");
const board=readFileSync("src/components/platform/UrbanMatrixBatchReviewBoard.tsx","utf8");
const sql=readFileSync("neon/migrations/20261031_urban_matrix_batch_staging_qa_v1.sql","utf8");
describe("SIGAPRO — lote histórico QA, sem ativação e por prefeitura",()=>{
 it("só exibe a matriz após verificar SHA-256 do PDF na carga",()=>{
  expect(ui).toContain("const actualHash=await verifyPdfAndHash(file)");
  expect(ui).toContain("actualHash!==candidate.arquivo_sha256");
  expect(ui).toContain("<UrbanMatrixBatchReviewBoard");
  expect(ui).toContain("municipalityId={municipalityId} file={file} reviewPackage={reviewPackage}");
  expect(board).toContain('data-urban-batch-review="true"');
  expect(board).toContain("checkLocalPdf(file,reviewPackage.arquivo_sha256)");
 });
 it("permite conferir em lote só linhas sem pendência, com declaração humana",()=>{
  expect(board).toContain("disabled={!attested||!eligible.length||sameCount}");
  expect(board).toContain("setChecked(eligible.map(x=>x.index))");
  expect(board).toContain("disabled={!attested||!row.bulkEligible}");
  expect(board).toContain('data-urban-batch-uncheck="true"');
  expect(board).toContain('aria-label="Conferi as linhas do lote no PDF"');
  expect(board).toContain('onOpenRow(row.index)');
 });
 it("salva as linhas históricas como lote pendente, mas não publica regras",()=>{
  expect(board).toContain('"save_urban_matrix_batch_staging_v1"');
  expect(board).toContain("makeUrbanBatchStaging(reviewPackage,reviewed)");
  expect(board).toContain("!qaWriteEnabled");
  expect(board).toContain("pending");
  expect(board).not.toContain("activate_urban_regulation");
  expect(board).not.toContain("save_urban_regulation_draft_v1");
  expect(board).toContain('"list_urban_matrix_batch_staging_v1"');
 });
 it("SQL mantém isolamento municipal, versão e idempotência, bloqueia dados parciais",()=>{
  expect(sql).toContain("create table if not exists public.urban_matrix_batch_staging_v1");
  expect(sql).toContain("status text not null default 'pending_legal_review'");
  expect(sql).toContain("enable row level security");
  expect(sql).toContain("force row level security");
  expect(sql).toContain("public.is_urban_regulation_admin_v1(_municipality_id)");
  expect(sql).toContain("public.current_profile_id()");
  expect(sql).toContain("pg_advisory_xact_lock");
  expect(sql).toContain("unique(municipality_id,document_sha256,version)");
  expect(sql).toContain("unique(municipality_id,document_sha256,fingerprint)");
  expect(sql).toContain("from public.urban_matrix_batch_staging_v1 where municipality_id=_municipality_id");
  expect(sql).not.toContain("activate_urban_regulation_v1(");
  expect(sql).not.toContain("save_urban_regulation_draft_v1(");
 });
});
