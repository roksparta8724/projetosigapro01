import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const ui=readFileSync("src/components/platform/UrbanLegalMatrixImporter.tsx","utf8");
const importer=readFileSync("src/lib/urbanMatrixImport.ts","utf8");
const settings=readFileSync("src/components/platform/MunicipalUrbanRulesSettings.tsx","utf8");
const sql=readFileSync("neon/migrations/20261030_urban_legal_matrix_import_v1.sql","utf8");
describe("SIGAPRO matrix import: reviewed-only tenant isolated",()=>{
 it("uses Node ESM-compatible imports in serverless runtime, not extensionless source imports",()=>{
  expect(importer).toContain('from "./urbanPrecheck.js"');
  expect(importer).not.toContain('from "./urbanPrecheck";');
 });
 it("provides Quadro I/II with no auto activation",()=>{
  expect(settings).toContain("<UrbanLegalMatrixImporter");
  expect(ui).toContain("Quadro I — Índices numéricos");
  expect(ui).toContain("Quadro II — Categorias e condições de uso");
  expect(ui).toContain("Registrar linhas conferidas como RASCUNHO");
  expect(ui).toContain("Registro manual assistido — sem enviar dados à IA");
  expect(ui).toContain("Ler imagem e pré-preencher a transcrição com IA");
  expect(ui).toContain("setOcrDraft(true);setOcrVerified(false)");
  expect(ui).toContain("ocrReconciliationBlocked");
  expect(ui).toContain('imageDataUrl:data');
  expect(ui).toContain('"X-SIGAPRO-VISION":"1"');
  expect(ui).toContain("Adicionar linha para conferência (sem gravar)");
  expect(ui).toContain("extractLiteralCandidates({candidates:[proposed]}");

  expect(ui).not.toContain("activateUrbanRegulation(");
 });
 it("binds citations to local PDF SHA-256 and requires confirmation",()=>{
  expect(ui).toContain('crypto.subtle.digest("SHA-256", await file.arrayBuffer())');
  expect(sql).toContain("perform public.save_urban_legal_evidence_scoped_v3(");
  expect(ui).toContain('"save_urban_legal_matrix_import_v1"');
  expect(ui).toContain("window.confirm(");
  expect(ui).toContain("checked.includes(i)");
 });
 it("stores reviewed-only versions with tenant and RLS",()=>{
  expect(sql).toContain("alter table public.urban_legal_matrix_imports enable row level security");
  expect(sql).toContain("revoke all on public.urban_legal_matrix_imports from authenticated");
  expect(sql).toContain("public.is_urban_regulation_admin_v1(_municipality_id)");
  expect(sql).toContain("status text not null default 'reviewed_draft'");
  expect(sql).not.toContain("activate_urban_regulation_v1(");
 });
});
