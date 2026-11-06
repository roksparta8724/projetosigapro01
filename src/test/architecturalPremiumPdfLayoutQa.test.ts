import {describe,it,expect} from "vitest";
import {createArchitecturalReadingReportPdf} from "@/lib/architecturalReadingReportPdf";
import {normalizeArchitecturalPdfExtraction} from "@/lib/architecturalPdfReadings";

const identity={
  municipalityId:"49dac0b6-6352-4744-9aab-9ff91c59d970",
  municipalityName:"Prefeitura Municipal de Campo Limpo Paulista",
  protocol:"PM-2026-00004",ownerName:"PROPRIETARIO QA04",
  ownerDocument:"000.000.000-00",professionalName:"ENGENHEIRO QA04",
  propertyAddress:"Rua de Ensaio, 42",propertyRegistration:"INSCRICAO QA04",
  lot:"12",block:"A",declaredUse:"RESIDENCIAL",
};
function specimen(source:"pdf_text_local"|"ai_pdf_text"|"ai_pdf_visual",long=false){
  const metrics=[
    {metric:"lot_area_m2",value:300,page:3,quote:"AREA DO TERRENO: 300,00 m2",confidence:"high"},
    {metric:"front_setback_m",value:5,page:2,quote:"Recuo frontal proposto: 5,00 m",confidence:"high"},
    {metric:"rear_setback_m",value:12,page:2,quote:"Recuo de fundos proposto: 12,00 m",confidence:"high"},
    {metric:"floor_count",value:1,page:1,quote:"PAVIMENTOS: 01",confidence:"high"},
  ];
  const result=normalizeArchitecturalPdfExtraction({
    document_type:"architectural_plan",has_site_plan:true,metrics,
    warnings:long?Array.from({length:16},(_,i)=>"Alerta de ensaio "+i+" ".repeat(45)):[],
  });
  return createArchitecturalReadingReportPdf({
    extraction:{
      ...result,source,automaticallyApproved:false,
      pageAudit:{count:3,evidencePages:[1,2,3],
        pagesWithoutMeasurementEvidence:[],countVerified:true,
        visualInspectionVerified:false,
        note:"A contagem do PDF nao certifica inspecao visual."},
      ...(source==="pdf_text_local"?{
        textCoverage:{pagesRead:3,pagesWithText:[1,2,3],pagesWithoutText:[]},
        supplementaryFacts:[
          {kind:"built_area_m2" as const,label:"Area construida declarada",
            value:80,unit:"m²" as const,page:3,quote:"AREA CONSTRUIDA DECLARADA: 80,00 m2"},
        ],
      }:{}),
    },
    processId:"915e1c63-ebda-4cdd-8e95-34316d9e0089",
    documentId:"4c3aa431-0ed5-4a62-9270-bb94ed32944d",
    documentVersion:2,fileName:"SIGAPRO-QA04-PLANTA-IMPLANTACAO-V2.pdf",
    identification:long?{...identity,
      ownerName:("PROPRIETARIO FICTICIO COM NOME LONGO ").repeat(12)}:identity,
    territorial:{cadastralLink:"missing",zoneVerified:false,reasons:[]} as never,
    generatedAt:new Date("2026-11-06T20:00:00.000Z"),
  });
}
const printed=(pdf:ReturnType<typeof specimen>)=>pdf.internal.pages.flat().join("\n");

describe("SIGAPRO - relatório A4 institucional de leitura por modalidade",()=>{
  it("gera capa com prefeitura e nomes das partes, mantendo o documento sem aprovação",()=>{
    const pdf=specimen("pdf_text_local");
    const str=printed(pdf);
    expect(String.fromCharCode(...new Uint8Array(pdf.output("arraybuffer")).slice(0,5))).toBe("%PDF-");
    expect(str).toContain("Prefeitura Municipal de Campo Limpo Paulista");
    expect(str).toContain("PM-2026-00004");
    expect(str).toContain("PROPRIETARIO QA04");
    expect(str).toContain("ENGENHEIRO QA04");
    expect(str).toContain("INSCRICAO QA04");
    expect(str).toContain("DOCUMENTO DE APOIO TECNICO");
    expect(str).toContain("PENDENTE DE VINCULO IMOBILIARIO");
    expect(str).toContain("NAO AVALIADA");
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    expect(pdf.getNumberOfPages()).toBeLessThanOrEqual(8);
    for(let i=1;i<=pdf.getNumberOfPages();i++){
      expect(pdf.internal.pages[i].join("\n")).toContain("SIGAPRO");
      expect(pdf.internal.pages[i].join("\n")).toContain("Leitura preliminar, sem efeito de aprovacao");
    }
  });
  it("documenta exatamente a diferença de fonte entre as três modalidades",()=>{
    const local=printed(specimen("pdf_text_local"));
    const text=printed(specimen("ai_pdf_text"));
    const visual=printed(specimen("ai_pdf_visual"));
    expect(local).toContain("EXTRACAO LOCAL DE COTAS");
    expect(local).toContain("Com texto selecionavel");
    expect(local).toContain("Outras cotas declaradas nas pranchas");
    expect(text).toContain("INTERPRETACAO DE TEXTO POR IA");
    expect(text).toContain("camada textual");
    expect(visual).toContain("LEITURA VISUAL POR IA");
    expect(visual).toContain("analise visual assistida");
    expect(local).not.toBe(text);
    expect(text).not.toBe(visual);
  });
  it("usa tabela compacta com páginas e não infere taxas e CA ausentes",()=>{
    const content=printed(specimen("pdf_text_local"));
    expect(content).toContain("Pavimentos");
    expect(content).toContain("Area construida declarada");
    expect(content).toContain("300");
    expect(content).toContain("nao equivale");
    expect(content).not.toContain("APROVADO AUTOMATICAMENTE");
  });
  it("não rompe a paginação com nomes e avisos longos",()=>{
    const pdf=specimen("ai_pdf_visual",true);
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    expect(pdf.getNumberOfPages()).toBeLessThan(12);
    for(let i=1;i<=pdf.getNumberOfPages();i++){
      const content=pdf.internal.pages[i].join("\n");
      expect(content).toContain("SIGAPRO");
      expect(content).toContain("Leitura preliminar, sem efeito de aprovacao");
    }
  });
});
