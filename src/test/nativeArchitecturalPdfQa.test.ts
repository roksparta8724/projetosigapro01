import {describe,expect,it} from "vitest";
import {jsPDF} from "jspdf";
import {createQa04ArchitecturalPdf,QA04_SITE_GEOMETRY} from "@/lib/qa04ArchitecturalFixture";
import {benchmarkQa04ArchitecturalReadings} from "@/lib/architecturalPdfReadings";
import {extractNativeArchitecturalPdf} from "../../server/native-architectural-pdf";

function pdfBytes(pdf:jsPDF){return new Uint8Array(pdf.output("arraybuffer"));}

describe("SIGAPRO QA — leitura real do PDF sem chamadas a IA externa",()=>{
  it("lê os BYTES reais do documento fictício 04 e confere três recuos na prancha 2",async()=>{
    const fixture=createQa04ArchitecturalPdf();
    const actual=new Uint8Array(await fixture.arrayBuffer());
    expect(Buffer.from(actual.subarray(0,5)).toString("ascii")).toBe("%PDF-");
    const result=extractNativeArchitecturalPdf(actual);
    expect(result.source).toBe("pdf_text_local");
    expect(result.documentType).toBe("architectural_plan");
    expect(result.hasSitePlan).toBe(true);
    expect(result.automaticallyApproved).toBe(false);
    expect(QA04_SITE_GEOMETRY.frontSetbackM).toBe(5);
    expect(QA04_SITE_GEOMETRY.leftSetbackM).toBe(1);
    expect(QA04_SITE_GEOMETRY.rearSetbackM).toBe(12);
    const report=benchmarkQa04ArchitecturalReadings(result.readings);
    expect(report.passed).toBe(3);
    expect(report.cases.map(x=>x.readPage)).toEqual([2,2,2]);
    expect(result.warnings.join(" ")).toContain("Conformidade");
  });
  it("lê PDF com stream de texto compactado e mantém página real",()=>{
    const pdf=new jsPDF({compress:true});
    pdf.text("PROJETO ARQUITETONICO",10,15);
    pdf.text("PLANTA DE IMPLANTACAO",10,22);
    pdf.text("Recuo frontal proposto: 5,00 m",10,30);
    pdf.text("Recuo lateral esquerdo: 1,00 m",10,38);
    pdf.text("Recuo de fundos proposto: 12,00 m",10,46);
    const result=extractNativeArchitecturalPdf(pdfBytes(pdf));
    expect(result.source).toBe("pdf_text_local");
    expect(result.readings.find(x=>x.metric==="front_setback_m")).toMatchObject({
      value:5,page:1,usableForReview:true,
    });
    expect(result.readings.find(x=>x.metric==="rear_setback_m")).toMatchObject({
      value:12,page:1,usableForReview:true,
    });
  });
  it("não escolhe uma cota dentre duas cotas conflitantes",()=>{
    const pdf=new jsPDF();
    pdf.text("PROJETO ARQUITETONICO - PLANTA DE IMPLANTACAO",10,15);
    pdf.text("Recuo frontal proposto: 5,00 m",10,25);
    pdf.text("Recuo frontal proposto: 3,00 m",10,35);
    pdf.text("Recuo de fundos proposto: 12,00 m",10,45);
    const result=extractNativeArchitecturalPdf(pdfBytes(pdf));
    expect(result.readings.find(x=>x.metric==="front_setback_m")?.value).toBeNull();
    expect(result.warnings.join(" ")).toContain("conflitantes");
    expect(result.automaticallyApproved).toBe(false);
  });
  it("não inventa geometria quando o PDF não possui texto das cotas",()=>{
    const pdf=new jsPDF();
    pdf.rect(20,20,45,80);pdf.rect(30,40,20,25);
    const result=extractNativeArchitecturalPdf(pdfBytes(pdf));
    expect(result.hasSitePlan).toBe(false);
    expect(result.readings.every(x=>x.value===null)).toBe(true);
    expect(result.automaticallyApproved).toBe(false);
  });
  it("rejeita bytes inválidos e não interpreta qualquer dado como PDF",()=>{
    expect(()=>extractNativeArchitecturalPdf(new TextEncoder().encode("not a pdf")))
      .toThrow("PDF_NATIVE_INVALID");
    const pdf=pdfBytes(new jsPDF());
    const damaged=pdf.subarray(0,pdf.length-20);
    expect(()=>extractNativeArchitecturalPdf(damaged)).toThrow("PDF_NATIVE_INVALID");
  });
});
