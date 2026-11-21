import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { URBAN_METRICS } from "@/lib/urbanPrecheck";
const sql=readFileSync("neon/migrations/20261104_urban_additional_numeric_metrics_v1.sql","utf8");
describe("SIGAPRO urban numeric indices — Neon and frontend parity",()=>{
 it("supports minimum CA, lot area and frontage on both layers",()=>{
  expect(URBAN_METRICS.length).toBe(11);
  for(const key of ["floor_area_ratio_min","lot_area_m2","lot_frontage_m"]){
   expect(URBAN_METRICS.some(x=>x.key===key)).toBe(true);
   expect(sql).toContain(key);
  }
  for(const name of ["save_urban_regulation_draft_v1","save_urban_matrix_numeric_review_v1",
    "save_urban_legal_evidence_v1","save_urban_precheck_run_v1","save_urban_precheck_run_v2"]){
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public."+name);
  }
  expect(sql).toContain("not between 1 and 11");
  expect(sql).not.toContain("DELETE FROM");
  expect(sql).not.toContain("UPDATE public.urban_regulation_versions SET status='active'");
 });
});
