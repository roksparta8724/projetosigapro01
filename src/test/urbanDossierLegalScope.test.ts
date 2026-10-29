import {describe,expect,it} from "vitest";
import {urbanLegalEvidenceAppliesTo} from "@/lib/urbanLegalScope";
import type {UrbanLegalEvidence} from "@/lib/urbanLegalKnowledge";
import type {UrbanRegulationVersion} from "@/lib/urbanPrecheck";
import {readFileSync} from "node:fs";
const reg={id:"r",municipality_id:"cityA",zone_code:"ZR1",use_code:"RESIDENCIAL",
 effective_from:"2026-01-01",status:"active",rules:[]} as unknown as UrbanRegulationVersion;
const evidence={id:"e",evidence_id:"e",municipality_id:"cityA",document_title:"Lei municipal",
 document_sha256:"a".repeat(64),page_number:3,metric:"front_setback_m",
 excerpt:"Trecho confirmado de norma urbanistica",zone_code:"ZR1",
 use_code:"RESIDENCIAL",effective_from:"2026-01-01",effective_until:null,
 created_at:"2026-01-01"} as UrbanLegalEvidence;
describe("dossiê IA só apresenta lei aplicável à prefeitura e à zona",()=>{
 it("não reutiliza uma lei de outro município, zona, uso ou vigência",()=>{
  expect(urbanLegalEvidenceAppliesTo(evidence,reg,"2026-07-01")).toBe(true);
  expect(urbanLegalEvidenceAppliesTo({...evidence,municipality_id:"cityB"},reg,"2026-07-01")).toBe(false);
  expect(urbanLegalEvidenceAppliesTo({...evidence,zone_code:"ZR2"},reg,"2026-07-01")).toBe(false);
  expect(urbanLegalEvidenceAppliesTo({...evidence,use_code:"INDUSTRIAL"},reg,"2026-07-01")).toBe(false);
  expect(urbanLegalEvidenceAppliesTo({...evidence,effective_until:"2026-05-01"},reg,"2026-07-01")).toBe(false);
 });
 it("regra de contagem tem filtro de aplicabilidade, SHA e página no próprio painel",()=>{
  const panel=readFileSync("src/components/platform/UrbanPrecheckPanel.tsx","utf8");
  expect(panel).toContain("urbanLegalEvidenceAppliesTo(item,regulation,asOf)");
  expect(panel).toContain("item.document_sha256");
  expect(panel).toContain("item.page_number");
 });
});