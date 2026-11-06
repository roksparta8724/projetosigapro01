import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {createArchitecturalReadingReportPdf} from "@/lib/architecturalReadingReportPdf";
import {normalizeArchitecturalPdfExtraction} from "@/lib/architecturalPdfReadings";

function build(method:"pdf_text_local"|"ai_pdf_text"|"ai_pdf_visual"){
  const extracted=normalizeArchitecturalPdfExtraction({
    document_type:"architectural_plan",has_site_plan:true,
    warnings:[],metrics:[{metric:"lot_area_m2",value:250,page:2,
      quote:"Area do lote 250 m2",confidence:"high"}],
  });
  const pdf=createArchitecturalReadingReportPdf({
    extraction:{...extracted,source:method,automaticallyApproved:false},
    processId:"915e1c63-ebda-4cdd-8e95-34316d9e0089",
    documentId:"4c3aa431-0ed5-4a62-9270-bb94ed32944d",
    documentVersion:2,fileName:"planta.pdf",
    generatedAt:new Date("2026-11-06T12:00:00Z"),
    identification:{
      municipalityId:"49dac0b6-6352-4744-9aab-9ff91c59d970",
      municipalityName:"Prefeitura de Campo Limpo Paulista",
      protocol:"PM-2026-00004",ownerName:"Proprietario de Ensaio",
      ownerDocument:"000.000.000-00",
      professionalName:"Engenheiro de Ensaio",
      propertyAddress:"Rua Ficticia, 100",propertyRegistration:"QA-IMOVEL-04",
      lot:"20",block:"B",declaredUse:"residencial",
    },
    territorial:{cadastralLink:"missing",zoneVerified:false,reasons:[]} as never,
  });
  const commands=pdf.internal.pages.flat().join("\n");
  return {pdf,commands};
}

describe("SIGAPRO — relatório documental personalizado e sem reprovação fictícia",()=>{
  it("exibe identificação processual e prefeitura com fonte declarada",()=>{
    const {commands,pdf}=build("pdf_text_local");
    expect(commands).toContain("Prefeitura de Campo Limpo Paulista");
    expect(commands).toContain("PM-2026-00004");
    expect(commands).toContain("Proprietario de Ensaio");
    expect(commands).toContain("Engenheiro de Ensaio");
    expect(commands).toContain("QA-IMOVEL-04");
    expect(commands).toContain("Identificacao obtida do cadastro processual");
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
  it("distingue efetivamente três tipos de relatório, em vez de cópias indistinguíveis",()=>{
    const local=build("pdf_text_local").commands;
    const documental=build("ai_pdf_text").commands;
    const visual=build("ai_pdf_visual").commands;
    expect(local).toContain("EXTRACAO LOCAL DE COTAS");
    expect(documental).toContain("INTERPRETACAO DE TEXTO POR IA");
    expect(visual).toContain("LEITURA VISUAL POR IA");
    expect(local).not.toBe(documental);
    expect(documental).not.toBe(visual);
  });
  it("não reprova projeto quando falta vínculo cadastral ou perímetro oficial",()=>{
    const {commands}=build("ai_pdf_text");
    expect(commands).toContain("PENDENTE DE VINCULO IMOBILIARIO");
    expect(commands).toContain("NAO AVALIADA");
    expect(commands).toContain("nao e irregularidade comprovada");
    expect(commands).toContain("NAO significa nao conformidade");
  });
  it("usa campos do processo e muda o nome do arquivo pelo método real",()=>{
    const client=readFileSync("src/components/platform/ArchitecturalPdfAiPanel.tsx","utf8");
    const page=readFileSync("src/pages/saas/DocumentAnalysisPage.tsx","utf8");
    expect(client).toContain("ownerName:process.ownerName");
    expect(client).toContain("professionalName:process.technicalLead");
    expect(client).toContain("propertyRegistration:process.property?.registration");
    expect(client).toContain('?"extracao-local"');
    expect(client).toContain('?"interpretacao-texto-ia"');
    expect(client).toContain(':"leitura-visual-ia"');
    expect(page).toContain("municipality?.id===(process.municipalityId||process.tenantId)");
  });
});