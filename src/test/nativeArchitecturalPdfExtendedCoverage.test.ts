import { describe, expect, it } from "vitest";
import { jsPDF } from "jspdf";
import { extractNativeArchitecturalPdf } from "../../server/native-architectural-pdf";

const bytes=(pdf:jsPDF)=>new Uint8Array(pdf.output("arraybuffer"));

describe("SIGAPRO QA — leitura gratuita de pranchas com paginação real e números BR",()=>{
  it("lê uma implantação com apenas um recuo declarado, sem inventar fundos",()=>{
    const p=new jsPDF({compress:true});
    p.text("PROJETO ARQUITETONICO",10,15);
    p.text("PLANTA DE IMPLANTACAO",10,20);
    p.text("Recuo frontal proposto: 5,00 m",10,30);
    const out=extractNativeArchitecturalPdf(bytes(p));
    expect(out.hasSitePlan).toBe(true);
    expect(out.readings.find(x=>x.metric==="front_setback_m")).toMatchObject({value:5,page:1,usableForReview:true});
    expect(out.readings.find(x=>x.metric==="rear_setback_m")?.value).toBeNull();
    expect(out.automaticallyApproved).toBe(false);
  });
  it("lê milhar brasileiro e área decimal sem confundir 1.200 m² com 1,2 m²",()=>{
    const p=new jsPDF();
    p.text("PROJETO ARQUITETONICO",10,15);
    p.text("Area do terreno: 1.200,00 m2",10,25);
    const out=extractNativeArchitecturalPdf(bytes(p));
    expect(out.readings.find(x=>x.metric==="lot_area_m2")).toMatchObject({value:1200,page:1,usableForReview:true});
  });
  it("usa ordem da arvore /Pages /Kids mesmo quando objetos foram serializados em outra ordem",()=>{
    const p=new jsPDF();
    p.text("PROJETO ARQUITETONICO",10,15);
    p.addPage();
    p.text("PLANTA DE IMPLANTACAO",10,15);
    p.text("Recuo frontal proposto: 5,00 m",10,30);
    const original=p.output();
    const marker=/\/Kids\s*\[\s*(\d+\s+\d+\s+R)\s+(\d+\s+\d+\s+R)\s*\]/;
    expect(original).toMatch(marker);
    // Reverse /Kids; physical object order is unchanged. Native reader must
    // follow this ordering rather than assume the first object is page one.
    const reversed=original.replace(marker,(_m,a:string,b:string)=>"/Kids ["+b+" "+a+"]");
    const out=extractNativeArchitecturalPdf(Buffer.from(reversed,"latin1"));
    expect(out.readings.find(x=>x.metric==="front_setback_m")?.page).toBe(1);
    expect(out.textCoverage?.pagesRead).toBe(2);
  });
  it("lê hexadecimal PDF Tj com texto ASCII e com BOM UTF-16BE",()=>{
    const sentence="Recuo frontal proposto: 5,00 m";
    const p=new jsPDF();
    p.text("PROJETO ARQUITETONICO",10,15);
    p.text("PLANTA DE IMPLANTACAO",10,20);
    p.text(sentence,10,30);
    const original=p.output();
    const command="("+sentence+") Tj";
    expect(original).toContain(command);
    const asciiHex=Buffer.from(sentence,"latin1").toString("hex").toUpperCase();
    const rawAscii=original.replace(command,"<"+asciiHex+"> Tj");
    const plain=extractNativeArchitecturalPdf(Buffer.from(rawAscii,"latin1"));
    expect(plain.readings.find(x=>x.metric==="front_setback_m")).toMatchObject({
      value:5,page:1,usableForReview:true,
    });
    const encoded=Buffer.from(sentence,"utf16le");
    let utf16be="FEFF";
    for(let i=0;i<encoded.length;i+=2){
      utf16be+=encoded[i+1].toString(16).padStart(2,"0").toUpperCase();
      utf16be+=encoded[i].toString(16).padStart(2,"0").toUpperCase();
    }
    const rawUnicode=original.replace(command,"<"+utf16be+"> Tj");
    const unicode=extractNativeArchitecturalPdf(Buffer.from(rawUnicode,"latin1"));
    expect(unicode.readings.find(x=>x.metric==="front_setback_m")).toMatchObject({
      value:5,page:1,usableForReview:true,
    });
  });
  it("reconstitui strings de texto divididas entre tokens de um array TJ",()=>{
    const sentence="Recuo frontal proposto: 5,00 m";
    const p=new jsPDF();
    p.text("PROJETO ARQUITETONICO",10,15);
    p.text("PLANTA DE IMPLANTACAO",10,20);
    p.text(sentence,10,30);
    const original=p.output();
    const command="("+sentence+") Tj";
    expect(original).toContain(command);
    const h1=Buffer.from("Recuo frontal proposto: ","latin1").toString("hex");
    const h2=Buffer.from("5,00 m","latin1").toString("hex");
    const contents=original.replace(command,"[<"+h1+"> 50 <"+h2+">] TJ");
    const out=extractNativeArchitecturalPdf(Buffer.from(contents,"latin1"));
    expect(out.readings.find(x=>x.metric==="front_setback_m")).toMatchObject({
      value:5,page:1,usableForReview:true,
    });
  });
  it("recusa arvore ciclica/inconsistente sem atribuir paginas falsas",()=>{
    const p=new jsPDF();
    p.text("PROJETO ARQUITETONICO",10,15);
    const original=p.output();
    const tampered=original.replace(/\/Count\s+1\b/,"/Count 99");
    expect(tampered).not.toBe(original);
    expect(()=>extractNativeArchitecturalPdf(Buffer.from(tampered,"latin1"))).toThrow("PDF_NATIVE_PAGE_COUNT");
  });
});
