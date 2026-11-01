import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {isSingleUrbanZone,verifyUrbanEvidenceInput,normalizeLegalExcerpt}
 from "@/lib/urbanLegalEvidenceRegistration";
import type {UrbanRegulationVersion} from "@/lib/urbanPrecheck";
const city="11111111-1111-4111-8111-111111111111";
const version:UrbanRegulationVersion={
 id:"33333333-3333-4333-8333-333333333333",municipality_id:city,zone_code:"ZM-B(e)",
 use_code:"COMERCIAL",effective_from:"2026-01-01",version:1,status:"draft",
 rules:[{metric:"front_setback_m",limit:10,reference:"LC 379/2009, Quadro I"}],
 created_at:"2026-10-01",
};
const data={version,municipalityId:city,metric:"front_setback_m" as const,
 filename:"quadros.pdf",fileSize:150000,page:36,
 excerpt:"Recuo frontal mínimo de dez metros.",repeatExcerpt:"Recuo frontal mínimo de dez metros.",
 method:"visual_double_transcription" as const,from:"2026-01-01",until:"",
 confirmed:true};
describe("SIGAPRO QA — cadastro de evidência por regra real",()=>{
 it("aceita zona individual com parênteses e rejeita zona composta ou inválida",()=>{
  expect(isSingleUrbanZone("ZM-B(e)")).toBe(true);
  expect(isSingleUrbanZone("ZM-B3(A)")).toBe(true);
  expect(isSingleUrbanZone("ZM-B3(A) e ZM-B3(B)")).toBe(false);
  expect(isSingleUrbanZone("ZM-MA(1,2,3,4)")).toBe(false);
  expect(isSingleUrbanZone("ZM-B(e); DROP TABLE")).toBe(false);
 });
 it("exige texto/dupla transcrição, vigência válida e aceite humano",()=>{
  expect(verifyUrbanEvidenceInput(data)).toBeNull();
  expect(verifyUrbanEvidenceInput({...data,repeatExcerpt:"outro texto"})).toMatch(/Repita/);
  expect(verifyUrbanEvidenceInput({...data,confirmed:false})).toMatch(/Confira/);
  expect(verifyUrbanEvidenceInput({...data,from:"2026-02-30"})).toMatch(/datas civis/);
  expect(verifyUrbanEvidenceInput({...data,until:"2025-01-01"})).toMatch(/datas civis/);
  expect(verifyUrbanEvidenceInput({...data,municipalityId:"outro"})).toMatch(/mesma versão/);
  expect(verifyUrbanEvidenceInput({...data,metric:"floor_count"})).toMatch(/mesma versão/);
  expect(verifyUrbanEvidenceInput({...data,version:{...version,status:"superseded"}})).toMatch(/mesma versão/);
 });
 it("não permite o modo textual sem correspondência literal do trecho",()=>{
  expect(verifyUrbanEvidenceInput({...data,method:"text_layer_verified",
    textLayer:"OUTROS ARTIGOS"})).toMatch(/não corresponde/);
  expect(verifyUrbanEvidenceInput({...data,method:"text_layer_verified",
    textLayer:"A lei define Recuo frontal minimo de dez metros."})).toBeNull();
  expect(normalizeLegalExcerpt("MÍNIMO")).toBe("minimo");
 });
 it("integra a confirmação em UI à função exclusiva e não ativa regras",()=>{
  const sql=readFileSync("neon/migrations/20261101_urban_legal_evidence_parenthesized_zone_v4_qa.sql","utf8");
  const client=readFileSync("src/integrations/backend/urbanPrecheckClient.ts","utf8");
  const component=readFileSync("src/components/platform/UrbanLegalEvidenceCatalogPanel.tsx","utf8");
  const settings=readFileSync("src/components/platform/MunicipalUrbanRulesSettings.tsx","utf8");
  expect(sql).toContain("public.save_urban_legal_evidence_scoped_v4");
  expect(sql).toContain("public.is_urban_regulation_admin_v1");
  expect(sql).toContain("public.save_urban_legal_evidence_v1(");
  expect(sql).not.toContain("activate_urban_regulation_v1");
  expect(client).toContain('"save_urban_legal_evidence_scoped_v4"');
  expect(component).toContain('data-urban-legal-evidence-catalog="true"');
  expect(component).toContain('data-urban-legal-metric-coverage="true"');
  expect(component).toContain('readUrbanPdfSourcePage(file,pageNumber');
  expect(component).toContain('crypto.subtle.digest("SHA-256",bytes)');
  expect(component).toContain("refreshed.some");
  expect(settings).toContain("<UrbanLegalEvidenceCatalogPanel");
 });
});
