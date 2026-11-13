import {describe,expect,it,vi,beforeEach} from "vitest";
import {readFileSync} from "node:fs";
import {countCoveredUrbanMetrics,evidenceCoversUrbanRule} from "@/lib/urbanEvidenceCoverage";
import type {UrbanRegulationVersion} from "@/lib/urbanPrecheck";
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("@/integrations/backend/databaseClient",()=>({backendClient:{rpc:mock.rpc}}));
import {saveUrbanScopedLegalEvidence} from "@/integrations/backend/urbanPrecheckClient";
const version:UrbanRegulationVersion={id:"id",municipality_id:"municipio-A",zone_code:"ZM-B(E)",
 use_code:"RESIDENCIAL",effective_from:"2009-12-02",version:1,status:"draft",
 created_at:"2026-11-04T00:00:00Z",rules:[
 {metric:"front_setback_m",limit:5,reference:"LC 379/2009 Quadro I"},
 {metric:"lot_area_m2",limit:250,reference:"LC 379/2009 Quadro I"},
 ]};
const source={id:"scope",municipality_id:"municipio-A",zone_code:"ZM-B(E)",use_code:"RESIDENCIAL",
 metric:"front_setback_m",document_title:"quadros.pdf",document_sha256:"a".repeat(64),page_number:36,
 excerpt:"Trecho literal da lei com a medida de recuo frontal.",
 verification_method:"visual_double_transcription" as const,effective_from:"2009-12-02",effective_until:null};
describe("SIGAPRO scoped official evidence — per metric, zone and municipality",()=>{
 beforeEach(()=>vi.resetAllMocks());
 it("never counts unrelated evidence as proof of an active rule",()=>{
  expect(countCoveredUrbanMetrics(version,[source])).toBe(1);
  expect(countCoveredUrbanMetrics(version,[source,{...source,metric:"lot_area_m2"}])).toBe(2);
  expect(evidenceCoversUrbanRule(version,"front_setback_m",{...source,municipality_id:"outro"})).toBe(false);
  expect(evidenceCoversUrbanRule(version,"front_setback_m",{...source,zone_code:"ZM-C"})).toBe(false);
  expect(evidenceCoversUrbanRule(version,"front_setback_m",{...source,effective_from:"2027-01-01"})).toBe(false);
  expect(evidenceCoversUrbanRule(version,"front_setback_m",{...source,page_number:0})).toBe(false);
  expect(evidenceCoversUrbanRule(version,"front_setback_m",{...source,verification_method:"browser_ocr_human_verified"})).toBe(false);
 });
 it("submits only to the secured version-scoped v4 RPC and verifies response",async()=>{
  mock.rpc.mockResolvedValue({data:{id:"evidence-1",status:"verified_evidence"},error:null});
  const args={versionId:"11111111-1111-4111-8111-111111111111",
   municipalityId:"22222222-2222-4222-8222-222222222222",documentTitle:"quadros.pdf",
   documentSha256:"a".repeat(64),metric:"lot_area_m2",pageNumber:36,
   excerpt:"Área mínima do lote conforme quadro I.",
   effectiveFrom:"2009-12-02",verificationMethod:"visual_double_transcription" as const};
  await expect(saveUrbanScopedLegalEvidence(args)).resolves.toMatchObject({status:"verified_evidence"});
  expect(mock.rpc).toHaveBeenCalledWith("save_urban_legal_evidence_scoped_v4",{
   _regulation_version_id:args.versionId,_document_title:"quadros.pdf",
   _document_sha256:args.documentSha256,_page_number:36,_metric:"lot_area_m2",
   _excerpt:args.excerpt,_effective_from:args.effectiveFrom,
   _effective_until:null,_verification_method:"visual_double_transcription",
  });
 });
 it("gates activation on every verified excerpt and explicit reviewer attestation",()=>{
  const panel=readFileSync("src/components/platform/UrbanRegulationEvidencePanel.tsx","utf8");
  const settings=readFileSync("src/components/platform/MunicipalUrbanRulesSettings.tsx","utf8");
  expect(panel).toContain("countCoveredUrbanMetrics(version, evidences)");
  expect(panel).toContain("disabled={!complete || loading || saving || !!error}");
  expect(panel).toContain("confirmed && !saving");
  expect(panel).toContain("listUrbanVerifiedEvidenceScopes(municipalityId)");
  expect(panel).toContain("source.document_sha256");
  expect(settings).toContain("<UrbanRegulationEvidencePanel");
 });
});
