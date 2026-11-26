import {afterEach,describe,expect,it,vi} from "vitest";
import {resolveVisualPdfProvider,extractVisualPdf} from "../../server/architectural-pdf-provider";
import {createQa04ArchitecturalPdfBytes} from "@/lib/qa04ArchitecturalFixture";
const config:Record<string,string>={SIGAPRO_AI_PDF_PROVIDER:"private",SIGAPRO_AI_PDF_PRIVATE_ENABLED:"true",SIGAPRO_AI_GATEWAY_URL:"https://ia.sigapromunicipal.com.br",SIGAPRO_AI_GATEWAY_TOKEN:"x".repeat(48),SIGAPRO_AI_MODEL:"Qwen/test"};
const get=(values:Record<string,string>={})=>(key:string)=>({...config,...values})[key]||"";
afterEach(()=>vi.unstubAllGlobals());
describe("Private PDF textual adapter",()=>{
 it("requires explicit configuration and never falls back to another paid provider",()=>{
  expect(resolveVisualPdfProvider(get()).enabled).toBe(true);
  for(const settings of [{SIGAPRO_AI_PDF_EXTERNAL_POLICY:"local_only"},{SIGAPRO_AI_PDF_PRIVATE_ENABLED:"false"},{SIGAPRO_AI_PDF_PROVIDER:"",SIGAPRO_AI_PROVIDER:"private"},{SIGAPRO_AI_GATEWAY_URL:"https://127.0.0.1"}]){
   expect(resolveVisualPdfProvider(get(settings)).enabled).toBe(false);
  }
 });
 it("sends bounded page text, rejects wrong-page citations and geometry, preserves human review",async()=>{
  const cfg=resolveVisualPdfProvider(get());
  if(!cfg.enabled)throw Error("test fixture missing");
  const request=vi.fn(async()=>({ok:true,status:200,json:async()=>({choices:[{finish_reason:"stop",message:{content:JSON.stringify({
    document_type:"architectural_plan",has_site_plan:true,warnings:[],metrics:[
     {metric:"lot_area_m2",value:300,page:1,quote:"TERRENO: 12,00 x 25,00 m = 300,00 m2",confidence:"high"},
     {metric:"front_setback_m",value:5,page:2,quote:"Recuo frontal proposto: 5,00 m",confidence:"high"},
     {metric:"height_m",value:10,page:3,quote:"Recuo frontal proposto: 5,00 m",confidence:"high"}
    ]
  })}}]})}));
  vi.stubGlobal("fetch",request);
  const result=await extractVisualPdf(new Uint8Array(createQa04ArchitecturalPdfBytes()),"private-file.pdf",cfg.provider);
  expect(result.source).toBe("ai_pdf_text");
  expect(result.automaticallyApproved).toBe(false);
  expect(result.hasSitePlan).toBe(false);
  expect(result.readings.find(x=>x.metric==="front_setback_m")?.value).toBeNull();
  expect(result.readings.find(x=>x.metric==="height_m")?.value).toBeNull();
  expect(request).toHaveBeenCalledOnce();
  const [url,options]=vi.mocked(fetch).mock.calls[0];
  expect(url).toBe("https://ia.sigapromunicipal.com.br/v1/sigapro/pdf-text");
  expect(options?.redirect).toBe("error");
  expect(String(options?.body)).not.toContain("private-file.pdf");
  expect(String(options?.body)).not.toContain("application/pdf");
 });
});
