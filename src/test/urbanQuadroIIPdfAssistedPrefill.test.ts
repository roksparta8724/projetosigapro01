import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  LC379_QUADRO_II_SHA, prepareQuadroIIPdfAssistedPrefill,
} from "@/lib/urbanQuadroIIPdfAssistedPrefill";
import { CAMPO_LIMPO_PAULISTA_MUNICIPALITY_ID } from "@/lib/urbanOfficialLegalSources";
import type { UrbanQuadroIISuggestion } from "@/integrations/backend/urbanPrecheckClient";

const proposal=(category_code:string, literal_source_excerpt?:string):UrbanQuadroIISuggestion=>({
  category_code,use_description:"Exemplo de teste do Quadro II",source_excerpt:"OCR sintético não validado.",
  permitted_zones_text:"ZC",
  road_hierarchy_text:"",parking_requirement_text:"",
  special_conditions_text:"",literal_source_excerpt,status:"proposal_unverified",
});
const read=(file:string)=>readFileSync(file,"utf8");
describe("SIGAPRO PDF — pré-preenchimento por tabela, página e documento original",()=>{
  it("preenche E1.2 com vagas de estacionamento e carga corretamente separadas",()=>{
    const result=prepareQuadroIIPdfAssistedPrefill(
      CAMPO_LIMPO_PAULISTA_MUNICIPALITY_ID,LC379_QUADRO_II_SHA,38,proposal("E1.2"));
    expect(result.hasLiteralCandidate).toBe(true);
    expect(result.pages).toEqual([38]);
    expect(result.sourceExcerpt).toContain("1:7");
    expect(result.parkingRequirement).toContain("20 m²");
    expect(result.specialConditions).toContain("Vagas para carga: no mínimo 1 vaga");
    expect(result.roadHierarchy).toBe("N3, E3");
    expect(result.manualReviewRequired).toBe(true);
  });
  it("usa as páginas 43 e 44 para completar o serviço, sem liberar zoneamento",()=>{
    const result=prepareQuadroIIPdfAssistedPrefill(
      CAMPO_LIMPO_PAULISTA_MUNICIPALITY_ID,LC379_QUADRO_II_SHA,43,proposal("S1.2"));
    expect(result.pages).toEqual([43,44]);
    expect(result.roadHierarchy).toBe("N3, E3");
    expect(result.parkingRequirement).toContain("75 m²");
    expect(result.sourceExcerpt).toContain("Escritórios técnicos profissionais");
  });
  it("não preenche trecho literal fabricado nem vaza transcrição para outra prefeitura",()=>{
    const crossTenant=prepareQuadroIIPdfAssistedPrefill("other-municipality",
      LC379_QUADRO_II_SHA,38,proposal("E1.2"));
    expect(crossTenant.hasLiteralCandidate).toBe(false);
    expect(crossTenant.sourceExcerpt).toBe("");
    const otherDocument=prepareQuadroIIPdfAssistedPrefill(
      CAMPO_LIMPO_PAULISTA_MUNICIPALITY_ID,"b".repeat(64),38,proposal("E1.2"));
    expect(otherDocument.sourceExcerpt).toBe("");
    const quoted=prepareQuadroIIPdfAssistedPrefill("other-municipality",
      "b".repeat(64),38,proposal("E1.2","Trecho literal cadastrado e pendente de conferência"));
    expect(quoted.hasLiteralCandidate).toBe(true);
  });
  it("não coloca em lote taxas de estacionamento com números ou células ambíguas",()=>{
    for(const [pageNumber, categoryCode] of [
      [39,"E2.2"], [39,"E2.5"], [40,"E3.1"], [40,"E3.2"], [40,"E3.3"],
      [39,"E2.7"],
    ] as const) {
      const result=prepareQuadroIIPdfAssistedPrefill(
        CAMPO_LIMPO_PAULISTA_MUNICIPALITY_ID,LC379_QUADRO_II_SHA,pageNumber,
        proposal(categoryCode));
      expect(result.requiresFocusedReview).toBe(true);
      expect(result.focusedReviewReasons.length).toBeGreaterThan(0);
      expect(result.manualReviewRequired).toBe(true);
    }
    const clear=prepareQuadroIIPdfAssistedPrefill(
      CAMPO_LIMPO_PAULISTA_MUNICIPALITY_ID,LC379_QUADRO_II_SHA,38,
      proposal("E1.1"));
    expect(clear.requiresFocusedReview).toBe(false);
  });
  it("preserva aviso do OCR de proporção borrada mesmo que haja trecho candidato",()=>{
    const uncertain=proposal("E1.2");
    uncertain.field_warnings=["A proporção de vagas está borrada no original."];
    const result=prepareQuadroIIPdfAssistedPrefill(
      CAMPO_LIMPO_PAULISTA_MUNICIPALITY_ID,LC379_QUADRO_II_SHA,38,uncertain);
    expect(result.hasLiteralCandidate).toBe(true);
    expect(result.requiresFocusedReview).toBe(true);
  });
  it("mantém a unidade contraditória do PDF como pendência técnica, sem conversão inventada",()=>{
    const auditorium=prepareQuadroIIPdfAssistedPrefill(
      CAMPO_LIMPO_PAULISTA_MUNICIPALITY_ID,LC379_QUADRO_II_SHA,40,proposal("E3.2"));
    const stadium=prepareQuadroIIPdfAssistedPrefill(
      CAMPO_LIMPO_PAULISTA_MUNICIPALITY_ID,LC379_QUADRO_II_SHA,40,proposal("E3.3"));
    for(const item of [auditorium,stadium]) {
      expect(item.requiresFocusedReview).toBe(true);
      expect(item.focusedReviewReasons.join(" ")).toContain("Ambiguidade na própria tabela original");
      expect(item.focusedReviewReasons.join(" ")).toContain("1:15 m²");
      expect(item.focusedReviewReasons.join(" ")).toContain("Não calcular vagas automaticamente.");
      // A quote containing only the activity name is NOT evidence of the parking number.
      expect(item.sourceExcerpt).not.toContain("1:15");
      expect(item.parkingRequirement).toBe("");
    }
  });
  it("mantém falta de trecho literal explícita em C2.7, sem inventar índice",()=>{
    const result=prepareQuadroIIPdfAssistedPrefill(
      CAMPO_LIMPO_PAULISTA_MUNICIPALITY_ID,LC379_QUADRO_II_SHA,48,proposal("C2.7"));
    expect(result.hasLiteralCandidate).toBe(false);
    expect(result.sourceExcerpt).toBe("");
    expect(result.warnings.some(w=>w.includes("Trecho literal insuficiente"))).toBe(true);
  });
  it("não faz aprovação ou gravação automática; só salva após confirmação de página pelo usuário",()=>{
    const panel=read("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx");
    expect(panel).toContain('data-sigapro-quadro-ii-batch-prefill="true"');
    expect(panel).toContain("const savePageDrafts = async () =>");
    expect(panel).toContain("!batchReviewed");
    expect(panel).toContain('permittedZones: ""');
    expect(panel).toContain("setBatchReviewed(false)");
    expect(panel).toContain("!assisted.requiresFocusedReview");
    expect(panel).toContain("needsIndividualReview");
    expect(panel).toContain("pageNeedsVisualReview");
    expect(panel).toContain("saveUrbanQuadroIIDraft(");
    expect(panel).not.toContain('activate_urban_regulation');
    expect(panel).toContain("Nenhuma norma foi ativada");
    expect(panel).toContain("data-sigapro-saved-draft-source-warning");
    expect(panel).toContain("sourceCheck?.requiresFocusedReview");
    expect(panel).toContain("Não precisa cadastrá-lo novamente");
  });
});
