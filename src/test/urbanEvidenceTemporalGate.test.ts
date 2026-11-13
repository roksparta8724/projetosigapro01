import {describe,expect,it} from "vitest";
import {evidenceCoversUrbanRule,countCoveredUrbanMetrics,type UrbanLegalEvidenceScope}
  from "@/lib/urbanEvidenceCoverage";
import type {UrbanRegulationVersion} from "@/lib/urbanPrecheck";
const town="49dac0b6-6352-4744-9aab-9ff91c59d970";
const version:UrbanRegulationVersion={
  id:"version",municipality_id:town,zone_code:"Z1",use_code:"R",
  effective_from:"2026-01-01",version:1,status:"active",created_at:"2026-01-01",
  rules:[{metric:"front_setback_m",limit:5,reference:"Lei municipal 100/2025, art. 20"}],
};
const item:UrbanLegalEvidenceScope={
  id:"evidence",municipality_id:town,zone_code:"Z1",use_code:"R",
  metric:"front_setback_m",document_title:"Lei Municipal nº 100/2025",
  document_sha256:"a".repeat(64),page_number:3,
  excerpt:"Recuo frontal mínimo de cinco metros conforme o artigo.",
  verification_method:"text_layer_verified",
  effective_from:"2025-12-01",effective_until:null,
};
describe("SIGAPRO municipal legal provenance validation",()=>{
  it("requires exact tenant, zone, use, metric and documentary basis",()=>{
    expect(evidenceCoversUrbanRule(version,"front_setback_m",item)).toBe(true);
    expect(countCoveredUrbanMetrics(version,[item])).toBe(1);
    expect(evidenceCoversUrbanRule(version,"front_setback_m",{...item,municipality_id:"other"})).toBe(false);
    expect(evidenceCoversUrbanRule(version,"front_setback_m",{...item,zone_code:"Z2"})).toBe(false);
    expect(evidenceCoversUrbanRule(version,"front_setback_m",{...item,metric:"rear_setback_m"})).toBe(false);
  });
  it("rejects impossible and expired date windows without inventing a legal version",()=>{
    const bad=[
      {effective_from:"2025-02-30"},{effective_from:"0000-00-00"},
      {effective_from:"2026-02-01"},{effective_until:"2025-12-31"},
      {effective_until:"2026-13-01"},{effective_until:"2025-01-01"},
    ];
    for(const change of bad)
      expect(evidenceCoversUrbanRule(version,"front_setback_m",{...item,...change})).toBe(false);
    expect(evidenceCoversUrbanRule({...version,effective_from:"2026-02-30"},"front_setback_m",item)).toBe(false);
  });
  it("rejects unidentifiable source, missing quote or unverified browser OCR",()=>{
    const bad=[
      {id:""},{document_title:""},{document_sha256:"x".repeat(64)},
      {page_number:0},{excerpt:"trecho curto"},
      {verification_method:"browser_ocr_human_verified" as const},
    ];
    for(const change of bad)
      expect(evidenceCoversUrbanRule(version,"front_setback_m",{...item,...change})).toBe(false);
  });
});
