import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
describe("SIGAPRO urban QA — no municipal rule activation without verified legal references",()=>{
 it("requires evidence for each legal index in exact zone/use/municipality/date",()=>{
  const sql=readFileSync("neon/migrations/20261101_urban_regulation_evidence_activation_gate_v2_qa.sql","utf8");
  expect(sql).toContain("CREATE OR REPLACE FUNCTION public.activate_urban_regulation_v2");
  expect(sql).toContain("public.is_urban_regulation_admin_v1");
  expect(sql).toContain("jsonb_array_elements(_v.rules) r(rule)");
  expect(sql).toContain("s.municipality_id=_v.municipality_id");
  expect(sql).toContain("s.effective_from<=_v.effective_from");
  expect(sql).toContain("e.metric=r.rule->>'metric'");
  expect(sql).toContain("public.activate_urban_regulation_v1(_version_id)");
  expect(sql).toContain("REVOKE ALL ON FUNCTION public.activate_urban_regulation_v1(uuid) FROM authenticated;");
 });
 it("UI uses guarded activation and warns about Quadro II",()=>{
  const client=readFileSync("src/integrations/backend/urbanPrecheckClient.ts","utf8");
  const settings=readFileSync("src/components/platform/MunicipalUrbanRulesSettings.tsx","utf8");
  expect(client).toContain('"activate_urban_regulation_v2"');
  expect(settings).toContain("as condicionantes do Quadro II");
 });
});
