import { describe, expect, it } from "vitest";
import { assessUrbanAiReadiness, type UrbanReadinessInput } from "@/lib/urbanAiReadiness";
import { URBAN_METRICS, type UrbanRegulationVersion } from "@/lib/urbanPrecheck";
import type { UrbanLegalEvidenceScope } from "@/lib/urbanEvidenceCoverage";

const baseline: UrbanReadinessInput = {
  files:{usoSolo:"",zoneamento:"",planoDiretor:"",leisComplementares:""},
  source:null,audits:[],quadroII:null,matrixImports:[],
  verifiedEvidence:[],regulations:[],versionedLawCount:0,
};
const version:UrbanRegulationVersion = {
  id:"v1",municipality_id:"municipio-a",zone_code:"ZR",use_code:"RESIDENCIAL",
  effective_from:"2026-01-01",version:1,status:"active",created_at:"2026-01-01T10:00:00Z",
  rules:URBAN_METRICS.map(({key})=>({metric:key,limit:1,
    reference:"Fonte hipotética para QA, sem lei oficial"})),
};
function evidence(metric:string): UrbanLegalEvidenceScope {
  return {
    id:"evidence-"+metric,municipality_id:"municipio-a",zone_code:"ZR",
    use_code:"RESIDENCIAL",metric,
    document_title:"Lei hipotética para QA",document_sha256:"a".repeat(64),
    page_number:36,excerpt:"Trecho literal hipotético usado somente no teste automatizado",
    verification_method:"visual_double_transcription",effective_from:"2025-12-01",
    effective_until:null,
  };
}
describe("SIGAPRO QA — ativação condicionada à cobertura integral das 11 métricas",()=>{
  it("exibe todos os índices como indisponíveis quando a fonte não tem versão legal",()=>{
    const summary=assessUrbanAiReadiness(baseline);
    expect(summary.metrics).toHaveLength(11);
    expect(summary.metrics.every(item=>item.legalScopesReady===0)).toBe(true);
    expect(summary.readyForHumanAssistedPrecheck).toBe(false);
  });
  it("bloqueia toda a versão quando uma única evidência obrigatória está ausente",()=>{
    const summary=assessUrbanAiReadiness({...baseline,regulations:[version],
      verifiedEvidence:URBAN_METRICS.slice(0,10).map(({key})=>evidence(key))});
    expect(summary.counts.evidencedActive).toBe(0);
    expect(summary.metrics.every(item=>item.legalScopesReady===0)).toBe(true);
  });
  it("permite contabilizar os escopos de todos os 11 índices somente com evidência integral",()=>{
    const summary=assessUrbanAiReadiness({...baseline,regulations:[version],
      verifiedEvidence:URBAN_METRICS.map(({key})=>evidence(key))});
    expect(summary.counts.evidencedActive).toBe(1);
    expect(summary.metrics).toHaveLength(11);
    expect(summary.metrics.every(item=>item.legalScopesReady===1)).toBe(true);
    expect(summary.readyForHumanAssistedPrecheck).toBe(false);
  });
  it("não confunde documento de outra prefeitura com evidência legal",()=>{
    const summary=assessUrbanAiReadiness({...baseline,regulations:[version],
      verifiedEvidence:URBAN_METRICS.map(({key})=>({
        ...evidence(key),municipality_id:"municipio-b",
      }))});
    expect(summary.metrics.every(item=>item.legalScopesReady===0)).toBe(true);
  });
});
