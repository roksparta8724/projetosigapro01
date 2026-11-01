import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const sql=readFileSync("neon/migrations/20261030_urban_legal_matrix_import_v1.sql","utf8");
const ui=readFileSync("src/components/platform/UrbanLegalMatrixImporter.tsx","utf8");
describe("SIGAPRO — atomic import and QA-only write gate",()=>{
  it("writes Quadro I evidence and numeric drafts in one SQL transaction, never activating",()=>{
    expect(sql).toContain("create or replace function public.save_urban_matrix_numeric_review_v1(");
    expect(sql).toContain("perform public.save_urban_legal_evidence_scoped_v3(");
    expect(sql).toContain("_draft := public.save_urban_regulation_draft_v1(");
    expect(sql).toContain("public.save_urban_legal_matrix_import_v1(");
    expect(sql).not.toContain("activate_urban_regulation_v1(");
  });
  it("refuses prod or unmatched preview Neon endpoints for writes",()=>{
    expect(ui).toContain('VITE_SIGAPRO_URBAN_MATRIX_QA_ENABLED==="true"');
    expect(ui).toContain('authEp===dataEp');
    expect(ui).toContain('authEp!=="ep-blue-cloud-b4hhgb4t"');
    expect(ui).toContain("!qaWriteEnabled");
    expect(ui).toContain('"save_urban_matrix_numeric_review_v1"');
    expect(ui).not.toContain("saveUrbanRegulationDraft(");
  });
  it("previews local PDF without uploading original to AI",()=>{
    expect(ui).toContain("URL.createObjectURL(file)");
    expect(ui).toContain("URL.revokeObjectURL(local)");
    expect(ui).toContain('documentTitle:file.name,pageText:text.trim()');
    expect(ui).toContain('rows={7} maxLength={6000}');
  });
});