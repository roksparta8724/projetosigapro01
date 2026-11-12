import {describe,it,expect,vi,afterEach} from "vitest";
import {jsPDF} from "jspdf";
import {extractNativeSelectablePdfPages} from "./native-architectural-pdf";
import {extractVisualPdf,type VisualPdfProvider} from "./architectural-pdf-provider";

const provider:VisualPdfProvider={
  kind:"cloudflare",key:"qa-synthetic-not-real-token",accountId:"a".repeat(32),
  model:"@cf/zai-org/glm-4.7-flash",
};
function pdf(){
  const p=new jsPDF();
  p.text("PROJETO ARQUITETONICO",10,15);
  p.text("Area do terreno: 300 m2",10,25);
  p.addPage();
  p.text("PLANTA DE IMPLANTACAO",10,15);
  p.text("Recuo frontal proposto: 5,00 m",10,25);
  return new Uint8Array(p.output("arraybuffer"));
}
afterEach(()=>vi.unstubAllGlobals());

describe("SIGAPRO: real selectable PDF text -> Workers AI with page evidence",()=>{
  it("extracts ordered pages locally, avoiding PDF conversion and its failure",async()=>{
    const pages=extractNativeSelectablePdfPages(pdf());
    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({page:1});
    expect(pages[0].text).toContain("Area do terreno: 300 m2");
    expect(pages[1]).toMatchObject({page:2});
    expect(pages[1].text).toContain("Recuo frontal proposto: 5,00 m");
    const calls=vi.fn(async(url:string,opts:RequestInit)=>{
      expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/"+provider.accountId+"/ai/v1/chat/completions");
      const input=JSON.parse(String(opts.body));
      expect(input.model).toBe(provider.model);
      expect(input.messages[1].content).toContain("Página: 1");
      expect(input.messages[1].content).toContain("Página: 2");
      expect(input.messages[1].content).toContain("Area do terreno: 300 m2");
      expect((opts.headers as Record<string,string>).Authorization).toBe("Bearer "+provider.key);
      return {ok:true,status:200,json:async()=>({
        choices:[{finish_reason:"stop",message:{content:JSON.stringify({
          document_type:"architectural_plan",has_site_plan:true,warnings:[],
          metrics:[
            {metric:"lot_area_m2",value:300,page:1,
              quote:"Area do terreno: 300 m2",confidence:"high"},
            {metric:"front_setback_m",value:5,page:2,
              quote:"Recuo frontal proposto: 5,00 m",confidence:"high"},
          ],
        })}}],
      })};
    });
    // Only textual data enters the external provider. No Cloudflare toMarkdown
    // upload and no hidden Claude/Gemini fallback.
    vi.stubGlobal("fetch",calls);
    const output=await extractVisualPdf(pdf(),"qa.pdf",provider);
    expect(calls).toHaveBeenCalledTimes(1);
    expect(output.source).toBe("ai_pdf_text");
    expect(output.automaticallyApproved).toBe(false);
    expect(output.hasSitePlan).toBe(false);
    expect(output.readings.find(r=>r.metric==="lot_area_m2"))
      .toMatchObject({value:300,page:1});
    expect(output.readings.find(r=>r.metric==="front_setback_m")?.value).toBeNull();
  });

  it("rejects a quote moved to an incorrect page",async()=>{
    const mock=vi.fn(async()=>({ok:true,status:200,json:async()=>({
      choices:[{finish_reason:"stop",message:{content:JSON.stringify({
        document_type:"architectural_plan",has_site_plan:false,warnings:[],
        metrics:[{metric:"lot_area_m2",value:300,page:2,
          quote:"Area do terreno: 300 m2",confidence:"high"}],
      })}}],
    })}));
    vi.stubGlobal("fetch",mock);
    const output=await extractVisualPdf(pdf(),"qa.pdf",provider);
    expect(output.readings.find(r=>r.metric==="lot_area_m2")?.value).toBeNull();
    expect(mock).toHaveBeenCalledOnce();
  });

  it("does not invent text from scanned or unsupported PDF, preserving conversion guard",async()=>{
    const p=new jsPDF();
    p.rect(15,15,30,40);
    const bytes=new Uint8Array(p.output("arraybuffer"));
    expect(()=>extractNativeSelectablePdfPages(bytes)).toThrow("PDF_NATIVE_NO_SELECTABLE_TEXT");
    const f=vi.fn(async (url:string)=>({
      ok:false,status:422,
    }));
    vi.stubGlobal("fetch",f);
    await expect(extractVisualPdf(bytes,"scanned.pdf",provider))
      .rejects.toThrow("CLOUDFLARE_PDF_CONVERSION_REJECTED");
    expect(f).toHaveBeenCalledOnce();
    expect(String(f.mock.calls[0][0])).toContain("/ai/tomarkdown");
  });
});
