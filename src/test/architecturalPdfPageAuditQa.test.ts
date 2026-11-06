import {describe,expect,it} from "vitest";
import {jsPDF} from "jspdf";
import {auditArchitecturalPdfPages} from "@/lib/architecturalPdfPageAudit";
import {normalizeArchitecturalPdfExtraction} from "@/lib/architecturalPdfReadings";
import {createQa04ArchitecturalPdf} from "@/lib/qa04ArchitecturalFixture";
import {extractNativeArchitecturalPdf} from "../../server/native-architectural-pdf";
import {readFileSync} from "node:fs";

function parse(b:Uint8Array,page:number){
  const readings=normalizeArchitecturalPdfExtraction({
    document_type:"architectural_plan",has_site_plan:true,warnings:[],
    metrics:[{metric:"front_setback_m",value:5,page,
      quote:"Recuo frontal proposto: 5,00 m",confidence:"high"}],
  });
  return auditArchitecturalPdfPages(b,readings);
}
describe("SIGAPRO QA — inventário seguro de todas as páginas do PDF",()=>{
  it("conta todas as três pranchas do ensaio real e mostra páginas sem evidências de medidas",async()=>{
    const file=createQa04ArchitecturalPdf();
    const buffer=new Uint8Array(await file.arrayBuffer());
    const audited=auditArchitecturalPdfPages(buffer,extractNativeArchitecturalPdf(buffer));
    expect(audited.pageAudit).toMatchObject({
      count:3,countVerified:true,visualInspectionVerified:false,
      evidencePages:[2],pagesWithoutMeasurementEvidence:[1,3],
    });
    expect(audited.automaticallyApproved).toBe(false);
  });
  it("rejeita de fato uma medida citando uma página inexistente",()=>{
    const pdf=new jsPDF();
    pdf.text("Projeto arquitetonico",10,20);
    pdf.addPage();pdf.text("Planta de implantacao",10,20);
    const audited=parse(new Uint8Array(pdf.output("arraybuffer")),99);
    expect(audited.pageAudit.count).toBe(2);
    const front=audited.readings.find(row=>row.metric==="front_setback_m");
    expect(front).toMatchObject({value:null,page:null,usableForReview:false});
    expect(audited.warnings.join(" ")).toContain("recusadas");
  });
  it("não inventa total de páginas ao receber objeto ilegível ou inválido",()=>{
    const audited=parse(new TextEncoder().encode("%PDF- incomplete"),9);
    expect(audited.pageAudit.count).toBeNull();
    expect(audited.pageAudit.countVerified).toBe(false);
    expect(audited.pageAudit.visualInspectionVerified).toBe(false);
  });
  it("liga auditoria à resposta do processo e ao PDF sem elevar rascunho a conformidade",()=>{
    const server=readFileSync("server/ai-project-extract.ts","utf8");
    const ui=readFileSync("src/components/platform/ArchitecturalPdfAiPanel.tsx","utf8");
    const report=readFileSync("src/lib/architecturalReadingReportPdf.ts","utf8");
    expect(server).toContain("auditArchitecturalPdfPages(pdf,extracted)");
    expect(server).toContain("...audited,processId:doc.process_id");
    expect(ui).toContain('data-sigapro-pdf-page-audit="true"');
    expect(report).toContain("Inventario de paginas e escopo verificado");
    expect(report).toContain("nao equivalem a leitura visual");
  });
});
