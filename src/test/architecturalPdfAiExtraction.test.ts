import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createReviewedDrawingHandoff, readReviewedDrawingHandoff, makeReviewedDrawingEvidence, normalizeArchitecturalPdfExtraction } from "@/lib/architecturalPdfReadings";

describe("SIGAPRO IA — PDF architectural drawing extraction, fail closed",()=>{
 it("recognizes exact page and quote and never claims automatic municipal approval",()=>{
  const out=normalizeArchitecturalPdfExtraction({
    document_type:"architectural_plan",has_site_plan:true,
    metrics:[
      {metric:"front_setback_m",value:5,page:2,quote:"Recuo frontal 5,00 m",confidence:"high"},
      {metric:"lot_area_m2",value:250,page:1,quote:"Área do terreno 250 m²",confidence:"medium"},
      {metric:"permeability_percent",value:120,page:1,quote:"taxa? 120%",confidence:"low"},
    ],warnings:[],
  });
  expect(out.automaticallyApproved).toBe(false);
  expect(out.source).toBe("ai_pdf_visual");
  expect(out.readings).toHaveLength(11);
  expect(out.readings.find(x=>x.metric==="front_setback_m")).toMatchObject({
    value:5,page:2,usableForReview:true,
  });
  expect(out.readings.find(x=>x.metric==="permeability_percent")?.usableForReview).toBe(false);
  expect(out.readings.find(x=>x.metric==="permeability_percent")?.value).toBeNull();
  expect(out.readings.find(x=>x.metric==="rear_setback_m")?.usableForReview).toBe(false);
 });
 it("blocks duplicate, unreferenced, uncertain or nonarchitectural values",()=>{
  const duplicate=normalizeArchitecturalPdfExtraction({
    document_type:"architectural_plan",has_site_plan:true,warnings:[],
    metrics:[
      {metric:"side_setback_m",value:1.5,page:1,quote:"Lateral esquerda 1,50 m",confidence:"high"},
      {metric:"side_setback_m",value:2,page:2,quote:"Lateral direita 2,00 m",confidence:"high"},
      {metric:"height_m",value:12,page:null,quote:"Altura máxima 12,00 m",confidence:"high"},
    ],
  });
  expect(duplicate.readings.find(x=>x.metric==="side_setback_m")?.usableForReview).toBe(false);
  expect(duplicate.readings.find(x=>x.metric==="height_m")?.usableForReview).toBe(false);
  const other=normalizeArchitecturalPdfExtraction({
    document_type:"other",has_site_plan:true,metrics:[{
      metric:"front_setback_m",value:100,page:1,quote:"Recuo de cem metros",confidence:"high",
    }],warnings:[],
  });
  expect(other.hasSitePlan).toBe(false);
  expect(other.readings.every(x=>!x.usableForReview)).toBe(true);
 });
 it("protects the source identifier in analyst-reviewed measurement citations",()=>{
  expect(makeReviewedDrawingEvidence("projeto.pdf",3,"Recuo frontal 5,00 m")).toContain("página 3");
  expect(()=>makeReviewedDrawingEvidence("projeto.pdf",null,"frontal")).toThrow();
 });
 it("connects visual PDF extraction to the actual precheck without bypassing confirmed legal evidence",()=>{
  const endpoint=readFileSync("server/ai-project-extract.ts","utf8");
  const panel=readFileSync("src/components/platform/ArchitecturalPdfAiPanel.tsx","utf8");
  const precheck=readFileSync("src/components/platform/UrbanPrecheckPanel.tsx","utf8");
  expect(endpoint).toContain('process.env.VERCEL_ENV!=="preview"');
  expect(endpoint).toContain("authorize_technical_document_signing_v1");
  expect(endpoint).toContain("get_current_profile_context");
  const provider=readFileSync("server/architectural-pdf-provider.ts","utf8");
  expect(endpoint).toContain("resolveVisualPdfProvider");
  expect(endpoint).toContain("extractVisualPdf");
  expect(provider).toContain("ANTHROPIC_API_KEY");
  expect(provider).toContain("SIGAPRO_AI_PDF_ENABLED");
  expect(provider).toContain("api.anthropic.com/v1/messages");
  expect(provider).toContain('type:"document",source:{type:"base64"');
  expect(provider).toContain('output_config:{format:{type:"json_schema"');
  expect(provider).toContain('store:false');
  expect(provider).toContain('text:{format:{type:"json_schema"');
  const aiRoute=readFileSync("api/ai-assistant.ts","utf8");
  expect(aiRoute).toContain('action === "project-extract"');
  expect(panel).toContain('confirmedTransfer:true');
  expect(panel).toContain('data-sigapro-ai-apply-reviewed="true"');
  expect(panel).toContain("row.usableForReview && checked[row.metric]");
  const documentWorkspace=readFileSync("src/pages/saas/DocumentAnalysisPage.tsx","utf8");
  expect(documentWorkspace).toContain("<ArchitecturalPdfAiPanel");
  expect(precheck).not.toContain("<ArchitecturalPdfAiPanel");
  expect(precheck).toContain("readReviewedDrawingHandoff");
  expect(precheck).toContain("setLegalReviewConfirmed(false)");
  expect(precheck).toContain('data-urban-precheck-legal-review="true"');
  expect(precheck).toContain("legalScopesReady && legalReviewConfirmed");
 });
 it("transporta apenas a medida conferida do PDF original para o processo correto",()=>{
   const fileName="SIGAPRO-QA04-PLANTA-IMPLANTACAO-V2.pdf";
   const handoff=createReviewedDrawingHandoff({
     processId:"proc-04",municipalityId:"municipio-qa",
     document:{id:"doc-v2",version:2,fileName},
     reviewed:{lot_area_m2:{
       value:"250,00",evidence:makeReviewedDrawingEvidence(fileName,2,"Área do lote: 250,00 m²"),
     }},
   });
   expect(handoff).not.toBeNull();
   const context={processId:"proc-04",municipalityId:"municipio-qa",
     documents:[{id:"doc-v2",version:2,fileName,uploaded:true}]};
   expect(readReviewedDrawingHandoff(handoff,context)).toEqual({
     lot_area_m2:{value:"250,00",
       evidence:makeReviewedDrawingEvidence(fileName,2,"Área do lote: 250,00 m²")},
   });
   expect(readReviewedDrawingHandoff(handoff,{...context,municipalityId:"municipio-externo"})).toBeNull();
   expect(readReviewedDrawingHandoff(handoff,{...context,processId:"outro-processo"})).toBeNull();
   expect(readReviewedDrawingHandoff(handoff,{...context,
     documents:[{...context.documents[0],version:3}]})).toBeNull();
   expect(readReviewedDrawingHandoff(handoff,{...context,
     documents:[{...context.documents[0],uploaded:false}]})).toBeNull();
   expect(readReviewedDrawingHandoff(handoff,context,Date.now()+16*60000)).toBeNull();
 });
 it("rejeita citações sem prancha, valores não numéricos e campos forjados",()=>{
   const document={id:"doc-v2",version:2,fileName:"projeto.pdf"};
   expect(createReviewedDrawingHandoff({processId:"p",municipalityId:"m",document,
     reviewed:{lot_area_m2:{value:"250",evidence:"texto sem página"}}})).toBeNull();
   expect(createReviewedDrawingHandoff({processId:"p",municipalityId:"m",document,
     reviewed:{lot_area_m2:{value:"250m²",
       evidence:"Prancha/PDF projeto.pdf, página 2; medição"}}})).toBeNull();
   const valid=createReviewedDrawingHandoff({processId:"p",municipalityId:"m",document,
     reviewed:{lot_area_m2:{value:"250",evidence:"Prancha/PDF projeto.pdf, página 2; medição"}}});
   expect(valid).not.toBeNull();
   if(!valid)return;
   const context={processId:"p",municipalityId:"m",
     documents:[{...document,uploaded:true}]};
   const forged={sigaproReviewedDrawing:{...valid.sigaproReviewedDrawing,
     reviewed:{not_an_urban_metric:{value:"123",evidence:"Prancha/PDF projeto.pdf, página 2"}}}};
   expect(readReviewedDrawingHandoff(forged,context)).toBeNull();
 });

});
