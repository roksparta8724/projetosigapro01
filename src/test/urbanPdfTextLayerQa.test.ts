// @vitest-environment jsdom
import {describe,it,expect,vi,beforeEach} from "vitest";
import {readFileSync} from "node:fs";
import {readUrbanPdfSourcePage,sourceLayerExcerpt} from "@/lib/urbanPdfTextLayer";
const fake=vi.hoisted(()=>({getDocument:vi.fn(),destroy:vi.fn(),cleanup:vi.fn()}));
vi.mock("pdfjs-dist",()=>({GlobalWorkerOptions:{workerSrc:""},
  getDocument:fake.getDocument,
}));
const pdf=()=>{const bytes=new TextEncoder().encode("%PDF-1.7\n"+"x".repeat(120));return {name:"original.pdf",size:bytes.byteLength,arrayBuffer:async()=>bytes.buffer} as File;};
const item=(str:string,x:number,y:number)=>({str,width:str.length*5,height:10,
  transform:[1,0,0,10,x,y],dir:"ltr",fontName:"f1",hasEOL:false});
describe("SIGAPRO — leitor local do texto PDF, antes de IA visual",()=>{
 beforeEach(()=>{
   vi.clearAllMocks();
   fake.getDocument.mockImplementation(()=>{
     const page={getViewport:()=>({convertToViewportPoint:(x:number,y:number)=>[x,600-y]}),
       getTextContent:async()=>({items:[
         item("ZONA ZM-B(e)",35,400),item("comercial",102,400),
         item("C.A. mínimo",140,450),item("0,05",180,400),
         item("0,5",212,400),item("1",250,400),item("50",300,400),
         item("70",350,400),item("3000",410,400),item("30",465,400),
         item("largura da via da testada + recuo",500,400),
         item("10",570,400),item("8",604,400),item("5",640,400),
       ]}),
       cleanup:fake.cleanup,
     };
     return {promise:Promise.resolve({numPages:110,getPage:async()=>page}),destroy:fake.destroy};
   });
 });
 it("extrai camada textual e coordenadas sem enviar o PDF ou preencher campos",async()=>{
   const result=await readUrbanPdfSourcePage(pdf(),36,"ZM-B(e)","comercial");
   expect(result.page).toBe(36);
   expect(result.totalPages).toBe(110);
   expect(result.textStatus).toBe("text_available");
   expect(result.zoneMatches.map(x=>x.text)).toEqual(["ZONA ZM-B(e)"]);
   expect(result.usageMatches.map(x=>x.text)).toEqual(["comercial"]);
   expect(result.runs.find(x=>x.text==="0,05")?.x).toBe(180);
   expect(result.runs.find(x=>x.text==="0,05")?.y).toBe(190);
   expect(sourceLayerExcerpt(result)).toContain("largura da via");
   expect(fake.getDocument).toHaveBeenCalledTimes(1);
   expect(fake.getDocument.mock.calls[0][0].isEvalSupported).toBe(false);
   expect(fake.cleanup).toHaveBeenCalledTimes(1);
   expect(fake.destroy).toHaveBeenCalledTimes(1);
 });
 it("rejeita pagina errada ou arquivo com assinatura falsa, sem inferir indices",async()=>{
   await expect(readUrbanPdfSourcePage(pdf(),111,"ZM-B(e)","comercial")).rejects.toThrow("não existe");
   await expect(readUrbanPdfSourcePage(({name:"documento.pdf",size:6,arrayBuffer:async()=>new TextEncoder().encode("GIF89a").buffer} as File),1,"ZM-B(e)","comercial"))
     .rejects.toThrow("assinatura PDF");
   expect(fake.destroy).toHaveBeenCalledTimes(1);
 });
 it("indica quando PDF nao possui texto: nenhuma precisao inventada",async()=>{
   fake.getDocument.mockImplementation(()=>({
     promise:Promise.resolve({numPages:2,getPage:async()=>({
       getViewport:()=>({convertToViewportPoint:()=>[0,0]}),
       getTextContent:async()=>({items:[]}),cleanup:fake.cleanup})}),
     destroy:fake.destroy,
   }));
   const result=await readUrbanPdfSourcePage(pdf(),1,"ZC","comercial");
   expect(result.textStatus).toBe("no_text_layer");
   expect(result.runs).toHaveLength(0);
   expect(result.zoneMatches).toHaveLength(0);
   expect(result.warnings.join(" ")).toContain("OCR assistido");
 });
 it("contrato de seguranca: nao envia PDF e nao ativa legis",()=>{
   const code=readFileSync("src/lib/urbanPdfTextLayer.ts","utf8");
   const ui=readFileSync("src/components/platform/UrbanLegalMatrixImporter.tsx","utf8");
   expect(code).toContain("isEvalSupported:false");
   expect(code).not.toContain("fetch(");
   expect(code).not.toContain("backendClient");
   expect(ui).toContain('data-urban-pdf-native-reader="true"');
   expect(ui).toContain("await inspectOriginalPdf()");
   expect(ui).toContain('data-urban-pdf-native-run="true"');
 });
});