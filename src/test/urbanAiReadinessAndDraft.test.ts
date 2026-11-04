import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assessUrbanAiReadiness } from "@/lib/urbanAiReadiness";
import { prepareUrbanRuleDraftFromReviewedRow } from "@/lib/urbanMatrixDraftPreparation";
import type { UrbanMatrixBatchDetail, UrbanMatrixRowReadingAudit } from "@/integrations/backend/urbanPrecheckClient";

const source: UrbanMatrixBatchDetail = {
  id: "batch", municipality_id: "tenant", document_title: "quadros.pdf",
  document_sha256: "a".repeat(64), source_municipality: "Campo Limpo Paulista",
  version: 1, status: "pending_legal_review",
  reviewed_indexes: [0,1,2,3,4,5,6,7,8,9,10,11,14,15,18,19],
  source_rows: Array.from({ length: 23 }, (_, i) => ({
    quadro: "I", pagina_pdf: i > 13 ? 37 : 36,
    zona_conforme_tabela: i === 21 ? "AIU(2)" : "ZM-B(e)",
    uso_predominante_conforme_tabela: "residencial",
    ca_maximo_original: "1", recuo_frontal_m: 5,
    pendencias_de_leitura: i === 21 ? "CA mínimo duvidoso" : "",
  })),
};
const audits: UrbanMatrixRowReadingAudit[] =
  [12,13,16,17,20,21,22].map((index) => ({
    id: "audit-"+index, batch_id:"batch", row_index:index,page_number:37,
    action:index===21?"needs_correction":"reading_verified",
    note:"Conferência do original com ressalvas técnicas e jurídicas.",
    created_at:"2026-11-03T10:00:00Z",actor_profile_id:"reviewer",
  }));
const documents = {usoSolo:"quadros.pdf",zoneamento:"zoneamento clp.pdf",
  planoDiretor:"",leisComplementares:"440-2011.pdf"};
describe("SIGAPRO IA — completude jurídica e rascunho sem ativação", () => {
  it("reconhece 22 leituras e AIU2 pendente, sem fingir liberação jurídica", () => {
    const result=assessUrbanAiReadiness({
      files:documents,source,audits,
      quadroII:{status:"pending_legal_review",pages:Array.from({length:14},(_,i)=>({
        page_number:38+i,topic:"Quadro II",visual_warning:i===5,draft_count:0,
        proposals:[{category_code:"C1",use_description:"Uso proposto",
          source_excerpt:"Texto não verificado",status:"proposal_unverified"}],
      })),entries:[]},
      matrixImports:[],verifiedEvidence:[],versionedLawCount:0,
      regulations:[{id:"fixture",municipality_id:"tenant",zone_code:"QA-SYNTHETIC",
        use_code:"RESIDENCIAL",effective_from:"2026-01-01",status:"active",
        version:1,rules:[{metric:"front_setback_m",limit:5,
          reference:"LEI FICTICIA QA SEM VALIDADE LEGAL"}],created_at:"2026-10-24T10:00:00Z"}],
    });
    expect(result.reading).toMatchObject({total:23,verified:22,needsCorrection:1,untreated:0});
    expect(result.quadroII).toMatchObject({pages:14,draftEntries:0,machineProposals:14});
    expect(result.counts).toMatchObject({officialActive:0,fictitiousQA:1,numericImports:0,
      verifiedEvidence:0,versionedLaws:0});
    expect(result.readyForHumanAssistedPrecheck).toBe(false);
    expect(result.checks.find((x)=>x.code==="pdf")?.passed).toBe(true);
    expect(result.checks.find((x)=>x.code==="quadro-i")?.passed).toBe(false);
  });
  it("não inventa CA nem vigência quando prepara índices para revisão", () => {
    const row = {quadro:"I",pagina_pdf:36,zona_conforme_tabela:"ZM-B(e)",
      uso_predominante_conforme_tabela:"comercial",ca_minimo_original:"0,05",
      ca_basico_original:"0,5",ca_maximo_original:"1",lote_minimo_m2:3000,
      testada_minima_m:30,recuo_frontal_m:10,recuo_lateral_m:5,
      taxa_ocupacao_maxima_pct:50,pendencias_de_leitura:""};
    const result = prepareUrbanRuleDraftFromReviewedRow(row,"quadros.pdf",true);
    expect(result?.zone).toBe("ZM-B(E)");
    expect(result?.fields.floor_area_ratio?.limit).toBe("1");
    expect(result?.fields.front_setback_m?.limit).toBe("10");
    expect(result?.fields.floor_area_ratio_min?.limit).toBe("0,05");
    expect(result?.fields.lot_area_m2?.limit).toBe("3000");
    expect(result?.fields.lot_frontage_m?.limit).toBe("30");
    expect(result?.otherLegalFields.join(" ")).toContain("CA mínimo: 0,05");
    expect(result?.otherLegalFields.join(" ")).toContain("Testada mínima (m): 30");
    expect(result?.warning).toContain("Nenhuma regra foi ativada");
    expect(prepareUrbanRuleDraftFromReviewedRow(row,"quadros.pdf",false)).toBeNull();
    expect(prepareUrbanRuleDraftFromReviewedRow({...row,pendencias_de_leitura:"Ilegível"},
      "quadros.pdf",true)).toBeNull();
    expect(prepareUrbanRuleDraftFromReviewedRow({...row,ca_maximo_original:"1 ou 2"},
      "quadros.pdf",true)?.fields.floor_area_ratio).toBeUndefined();
  });
  it("integra auditoria e pré-preenchimento sem salvar nem ativar automaticamente", () => {
    const rules=readFileSync("src/components/platform/MunicipalUrbanRulesSettings.tsx","utf8");
    const matrix=readFileSync("src/components/platform/UrbanLegalMatrixReviewPanel.tsx","utf8");
    const selector=readFileSync("src/lib/urbanPrecheck.ts","utf8");
    const readiness=readFileSync("src/components/platform/UrbanAiReadinessPanel.tsx","utf8");
    expect(rules).toContain("<UrbanAiReadinessPanel");
    expect(rules).toContain("onPrepareDraft={prepareFromMatrix}");
    expect(matrix).toContain("entry.readingReviewed && !entry.needsCorrection");
    expect(matrix).toContain("prepareUrbanRuleDraftFromReviewedRow");
    expect(rules).toContain('setEffectiveFrom("")');
    expect(selector).toContain("!isUrbanTestFixtureRule(rule)");
    expect(readiness).toContain("listUrbanVerifiedEvidenceScopes");
    expect(rules).toContain("<UrbanRegulationEvidencePanel");
  });
});
