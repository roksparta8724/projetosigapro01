import { describe, expect, it } from "vitest";
import { buildUrbanQuadroIIReviewQueue } from "@/lib/urbanQuadroIIReviewQueue";
import { LC379_QUADRO_II_SHA } from "@/lib/urbanQuadroIIPdfAssistedPrefill";
import { CAMPO_LIMPO_PAULISTA_MUNICIPALITY_ID } from "@/lib/urbanOfficialLegalSources";
import type { UrbanQuadroIIWorkspace } from "@/integrations/backend/urbanPrecheckClient";

const suggestion = (category_code: string, literal_source_excerpt?: string) => ({
  category_code, use_description:"Serviço especializado", source_excerpt:"OCR não conferido.",
  literal_source_excerpt, status:"proposal_unverified" as const,
});
function workspace(): UrbanQuadroIIWorkspace {
  return {
    status:"pending_legal_review", batch_id:"batch",
    document_sha256:"a".repeat(64),document_title:"quadros.pdf",
    pages:[
      {page_number:38,topic:"Institucional",visual_warning:false,draft_count:0,
       source_quality:"machine_unverified",proposals:[
         suggestion("E1.1","1 vaga para cada 50m², ou fração, de sala de aula"),
         suggestion("E1.2"),suggestion("E1.2"),
       ]},
      {page_number:43,topic:"Serviços S1",visual_warning:true,draft_count:0,
       source_quality:"visual_required",proposals:[suggestion("S1.1"),suggestion("S1.2","Trecho disponível mas PDF girado exige inspeção")]},
      {page_number:44,topic:"Continuação S1",visual_warning:false,draft_count:0,
       source_quality:"machine_unverified",proposals:[]},
    ],
    entries:[],
    legal_approval:false,ready_for_ai:false,
  };
}

describe("SIGAPRO — fila QA de conferência urbanística do Quadro II",()=>{
  it("organiza candidatos, identifica OCR não comprovado e nunca habilita legislação automaticamente",()=>{
    const result=buildUrbanQuadroIIReviewQueue(workspace());
    expect(result).toMatchObject({
      total:4,drafts:0,visualRequired:2,literalCandidates:2,missingLiteral:2,
      legallyActive:0,
    });
    expect(result.items.map(item=>item.categoryCode)).toEqual(["E1.1","E1.2","S1.1","S1.2"]);
    expect(result.items.find(item=>item.categoryCode==="E1.1")?.status).toBe("literal_candidate");
    expect(result.items.find(item=>item.categoryCode==="S1.2")?.status).toBe("visual_required");
  });
  it("distingue rascunho de norma ativa e evita contar uma categoria duas vezes",()=>{
    const source=workspace();
    source.entries=[{
      id:"draft",page_number:38,category_code:"e1.1",
      use_description:"Serviço especializado",permitted_zones_text:"",
      road_hierarchy_text:"",parking_requirement_text:"",special_conditions_text:"",
      source_excerpt:"1 vaga para cada 50m², ou fração, de sala de aula",
      status:"draft_unverified",created_by_profile_id:"analyst",created_at:"2026-11-04T00:00:00Z",
    }];
    const result=buildUrbanQuadroIIReviewQueue(source);
    expect(result).toMatchObject({total:4,drafts:1,literalCandidates:1,missingLiteral:2,legallyActive:0});
    expect(result.items.find(item=>item.categoryCode==="E1.1")?.status).toBe("draft_unverified");
  });
  it("conta a leitura assistida do PDF original mesmo com página girada; 4 candidatos não significam 4 regras",()=>{
    const source=workspace();
    source.document_sha256=LC379_QUADRO_II_SHA;
    const result=buildUrbanQuadroIIReviewQueue(source,CAMPO_LIMPO_PAULISTA_MUNICIPALITY_ID);
    expect(result).toMatchObject({total:4,drafts:0,literalCandidates:4,missingLiteral:0,
      visualRequired:2,legallyActive:0});
    expect(result.items.find(item=>item.categoryCode==="S1.2")?.status).toBe("visual_required");
    expect(result.items.find(item=>item.categoryCode==="E1.2")?.status).toBe("literal_candidate");
    expect(buildUrbanQuadroIIReviewQueue(source,"outra-prefeitura").literalCandidates).toBe(2);
  });
  it("não considera fontes arquivadas nem listas incompletas como prontas",()=>{
    const source=workspace();
    source.status="archived_source";
    expect(buildUrbanQuadroIIReviewQueue(source).total).toBe(0);
    expect(buildUrbanQuadroIIReviewQueue(null)).toMatchObject({total:0,legallyActive:0});
  });
});
