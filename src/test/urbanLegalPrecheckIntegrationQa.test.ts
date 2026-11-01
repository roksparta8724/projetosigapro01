import {describe,expect,it} from "vitest";
import {resolveUrbanLegalCoverage,type UrbanVerifiedLegalSource} from "@/lib/urbanLegalProof";
import type {UrbanRegulationVersion} from "@/lib/urbanPrecheck";
import {readFileSync} from "node:fs";
const city="11111111-1111-4111-8111-111111111111";
const other="22222222-2222-4222-8222-222222222222";
const rule:UrbanRegulationVersion={
 id:"a",municipality_id:city,zone_code:"ZM-B(e)",use_code:"COMERCIAL",version:2,status:"active",
 effective_from:"2025-01-01",created_at:"2025-01-01T00:00:00Z",
 rules:[{metric:"front_setback_m",limit:10,reference:"Lei 379/2009, Quadro I"},
        {metric:"occupancy_percent",limit:50,reference:"Lei 379/2009, Quadro I"}],
};
const sample:UrbanVerifiedLegalSource={
 id:"33333333-3333-4333-8333-333333333333",
 evidence_id:"44444444-4444-4444-8444-444444444444",
 municipality_id:city,document_title:"LC 379/2009 Quadro I",
 document_sha256:"a".repeat(64),page_number:36,metric:"front_setback_m",
 excerpt:"Recuo frontal mínimo da zona ZM-B(e), uso comercial.",
 zone_code:"ZM-B(e)",use_code:"comercial",effective_from:"2025-01-01",effective_until:null,
 verification_method:"text_layer_verified",
};
describe("SIGAPRO – acervo legal fundamentando pré-conferência por zona, uso e métrica",()=>{
 it("requer fonte individual por cada regra ativa",()=>{
  const partial=resolveUrbanLegalCoverage(rule,[sample],city,"2026-11-01");
  expect(partial).toMatchObject({status:"missing",required:2,matched:1,missing:["occupancy_percent"]});
  const full=resolveUrbanLegalCoverage(rule,[sample,{...sample,id:"55555555-5555-4555-8555-555555555555",
    evidence_id:"66666666-6666-4666-8666-666666666666",metric:"occupancy_percent",
    excerpt:"Taxa de ocupação máxima de cinquenta por cento."}],city,"2026-11-01");
  expect(full.status).toBe("ready");expect(full.matched).toBe(2);
  expect(full.evidenceIds).toHaveLength(2);
 });
 it("nunca utiliza fonte de outro município, zona, uso, índice ou vigência",()=>{
  const variants=[
   {...sample,municipality_id:other},{...sample,zone_code:"ZM-B1"},
   {...sample,use_code:"residencial"},{...sample,metric:"rear_setback_m"},
   {...sample,effective_until:"2026-10-01"},{...sample,effective_from:"2027-01-01"},
   {...sample,document_sha256:"invalid"},{...sample,verification_method:"unconfirmed"},
  ];
  for(const e of variants)expect(resolveUrbanLegalCoverage(rule,[e],city,"2026-11-01").matched).toBe(0);
 });
 it("rejeita normas em rascunho e catálogos truncados",()=>{
  expect(resolveUrbanLegalCoverage({...rule,status:"draft"},[sample],city,"2026-11-01").status).toBe("unavailable");
  expect(resolveUrbanLegalCoverage(rule,Array.from({length:250},()=>sample),city,"2026-11-01").status).toBe("incomplete_catalog");
  expect(resolveUrbanLegalCoverage(rule,null,city,"2026-11-01").status).toBe("missing");
 });
 it("UI exige atestado humano e ID real no escritor v5, nunca aprovação automática",()=>{
  const ui=readFileSync("src/components/platform/UrbanPrecheckPanel.tsx","utf8");
  const writer=readFileSync("src/integrations/backend/urbanPrecheckClient.ts","utf8");
  expect(ui).toContain('data-sigapro-urban-legal-coverage="true"');
  expect(ui).toContain('legalCoverage.status==="ready" && legalAcknowledged');
  expect(ui).toContain("evidenceIds:legalCoverage.evidenceIds");
  expect(ui).toContain('data-sigapro-urban-cited-metric={rule.metric}');
  expect(writer).toContain("_legal_review: {");
  expect(writer).toContain("evidence_ids:legalReview.evidenceIds");
  expect(writer).toContain('document_scope_confirmed:legalReview.documentScopeConfirmed');
  expect(writer).not.toContain("activateUrbanRegulation(versionId");
 });
});
