import {afterEach,describe,expect,it,vi} from "vitest";
import {extractVisualPdf} from "../../server/architectural-pdf-provider";
afterEach(()=>vi.unstubAllGlobals());
const account="a".repeat(32),key="existing-workers-ai-token-example-long-1234";
describe("Workers AI PDF conversion with existing SIGAPRO R2 and Cloudflare config",()=>{
 it("extracts PDF text using official Cloudflare REST, keeps geometry and fake citations blocked",async()=>{
  let called=0;
  vi.stubGlobal("fetch",vi.fn(async(url:string,options:RequestInit)=>{
    called++;
    if(called===1){
      expect(url).toContain("/ai/tomarkdown");
      expect(options.body).toBeInstanceOf(FormData);
      expect((options.headers as Record<string,string>).Authorization).toBe("Bearer "+key);
      return {ok:true,json:async()=>({success:true,result:[{format:"markdown",
        data:"## Página 1\\nÁrea do lote 250 m²\\nCA informado: 1,20\\nRecuo frontal: 5 metros"}]})};
    }
    expect(url).toContain("/ai/v1/chat/completions");
    const req=JSON.parse(String(options.body));
    expect(req.model).toBe("@cf/zai-org/glm-4.7-flash");
    expect(JSON.stringify(req)).not.toContain("api.anthropic.com");
    return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
      document_type:"architectural_plan",has_site_plan:true,warnings:[],
      metrics:[
        {metric:"lot_area_m2",value:250,page:1,quote:"Área do lote 250 m²",confidence:"high"},
        {metric:"front_setback_m",value:5,page:1,quote:"Recuo frontal: 5 metros",confidence:"high"},
        {metric:"height_m",value:70,page:1,quote:"Altura não existe no texto",confidence:"high"},
      ],
    })}}]})};
  }));
  const doc=new TextEncoder().encode("%PDF- test PDF sample bytes");
  const result=await extractVisualPdf(doc,"plantas.pdf",{
    kind:"cloudflare",key,accountId:account,model:"@cf/zai-org/glm-4.7-flash"
  });
  expect(called).toBe(2);
  expect(result.source).toBe("ai_pdf_text");
  expect(result.automaticallyApproved).toBe(false);
  expect(result.hasSitePlan).toBe(false);
  expect(result.readings.find(x=>x.metric==="lot_area_m2")?.value).toBe(250);
  expect(result.readings.find(x=>x.metric==="front_setback_m")?.usableForReview).toBe(false);
  expect(result.readings.find(x=>x.metric==="front_setback_m")?.value).toBeNull();
  expect(result.readings.find(x=>x.metric==="height_m")?.value).toBeNull();
 });
 it("fails closed when PDF markdown conversion does not return usable text",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>({ok:true,json:async()=>({success:true,result:[]})})));
  await expect(extractVisualPdf(new TextEncoder().encode("%PDF-"),"planta.pdf",{
    kind:"cloudflare",key,accountId:account,model:"@cf/zai-org/glm-4.7-flash"
  })).rejects.toThrow("AI_INCOMPLETE");
 });
});
