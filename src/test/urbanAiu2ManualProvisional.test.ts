import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {compareAiu2Interim,getAiu2ProvisionalCriterion} from "@/lib/urbanAiu2Provisional";
import type {UrbanMatrixAnalystGuidance} from "@/integrations/backend/urbanPrecheckClient";
const guidance:UrbanMatrixAnalystGuidance={
 row_index:21,field_code:"ca_minimo_original",proposed_value:1,original_ocr_text:"01",
 attribution:"reported_by_user_as_analyst_guidance",status:"pending_documentary_confirmation",
 source_note:"Orientação de analista, sem documento definitivo.",created_at:"2026-11-03T19:51:42.997Z",
 provisional_manual_value:1,provisional_status:"manual_only_pending_concidade",
 provisional_version:1,provisional_note:"CONCIDADE não deliberou."
};
const row={quadro:"I",pagina_pdf:37,zona_conforme_tabela:"AIU(2)",ca_minimo_original:null};
describe("AIU2 CA mínimo operacional 1 — separado da legislação",()=>{
 it("applies only to the exact original row, not to other zones or official legal rules",()=>{
  const c=getAiu2ProvisionalCriterion(row,21,guidance);
  expect(c).toEqual({metric:"floor_area_ratio_min",limit:1,originalOcr:"01",
   pendingAuthority:"CONCIDADE",legallyValidated:false,autoApproves:false});
  expect(getAiu2ProvisionalCriterion({...row,zona_conforme_tabela:"AIU(1)"},21,guidance)).toBeNull();
  expect(getAiu2ProvisionalCriterion(row,20,guidance)).toBeNull();
  expect(getAiu2ProvisionalCriterion(row,21,{...guidance,provisional_status:"withdrawn"})).toBeNull();
  expect(getAiu2ProvisionalCriterion(row,21,{...guidance,provisional_manual_value:0.1})).toBeNull();
  expect(getAiu2ProvisionalCriterion({...row,ca_minimo_original:"0,1"},21,guidance)).toBeNull();
 });
 it("compares CA with temporary 1 without reporting legal approval",()=>{
  const c=getAiu2ProvisionalCriterion(row,21,guidance)!;
  expect(compareAiu2Interim(c,"0,85")).toBe("below_provisional");
  expect(compareAiu2Interim(c,"1")).toBe("meets_provisional");
  expect(compareAiu2Interim(c,"1,5")).toBe("meets_provisional");
  expect(compareAiu2Interim(c,"x")).toBe("invalid");
  expect(compareAiu2Interim(c,"")).toBe("empty");
 });
 it("keeps append-only municipal guidance and original PDF source intact",()=>{
  const sql=readFileSync("neon/migrations/20261104_aiu2_manual_provisional_criterion_v1.sql","utf8");
  const seed=readFileSync("neon/qa-seeds/20261104_aiu2_manual_provisional_1_qa.sql","utf8");
  const ui=readFileSync("src/components/platform/UrbanLegalMatrixReviewPanel.tsx","utf8");
  expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.urban_matrix_analyst_provisional_criteria_v1");
  expect(sql).toContain("UNIQUE(guidance_id,version)");
  expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
  expect(sql).toContain("'provisional_manual_value'");
  expect(seed).toContain("manual_only_pending_concidade");
  expect(seed).toContain("1.0000");
  expect(seed).toContain("ON CONFLICT(guidance_id,version) DO NOTHING");
  expect(ui).toContain("<Aiu2ProvisionalComparison");
  expect(ui).toContain("CA mínimo = 1,00");
  expect(sql).not.toContain("UPDATE public.urban_regulation_versions");
  expect(sql).not.toContain("UPDATE public.urban_matrix_batch_staging_v1");
 });
});
