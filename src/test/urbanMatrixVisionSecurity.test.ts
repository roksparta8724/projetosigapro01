import {describe,expect,it,vi,beforeEach,afterEach} from "vitest";
const m=vi.hoisted(()=>({rpc:vi.fn(),env:vi.fn(),fetch:vi.fn()}));
vi.mock("../../server/municipal-storage.js",()=>({callDataApiRpc:m.rpc,readEnv:m.env}));
vi.mock("../../server/cloudflare-ai-provider.js",()=>({resolveCloudflareAiConfig:()=>({
 token:"fake-token",model:"@cf/zai-org/glm-4.7-flash",endpoint:"https://invalid.example/",
})}));
import {validateVisionInput,suggestUrbanMatrixPageText} from "../../server/urban-matrix-vision";
const city="11111111-1111-4111-8111-111111111111",other="22222222-2222-4222-8222-222222222222";
const image=Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(900,0)]).toString("base64");
const dataUrl="data:image/jpeg;base64,"+image;
const body={action:"urban-matrix-vision",quadro:"I",pageNumber:36,imageDataUrl:dataUrl};
const admin={municipality_id:city,tenant_id:city,is_master:false};
async function call(identity:Record<string,unknown>=admin,request:unknown=body){
 let payload:Record<string,unknown>={};
 const req={method:"POST",headers:{origin:"https://qa.example",authorization:"Bearer mock"}};
 const res={statusCode:200,setHeader:vi.fn(),end:vi.fn((v:string)=>{payload=JSON.parse(v)})};
 await suggestUrbanMatrixPageText(req as never,res as never,identity,request);
 return {code:res.statusCode,payload};
}
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv("VERCEL_ENV","preview");
 m.env.mockImplementation((key:string)=>key==="VITE_SIGAPRO_URBAN_MATRIX_QA_ENABLED"?"true":
  key==="SIGAPRO_AI_PROVIDER"?"cloudflare":
  key==="SIGAPRO_CF_ACCOUNT_ID"?"0123456789abcdef0123456789abcdef":"placeholder");
 m.rpc.mockResolvedValue({ok:true,status:200,payload:true});
 vi.stubGlobal("fetch",m.fetch);
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks()});
describe("Cloudflare visual Quadro OCR — protected QA drafts only",()=>{
 it("rejects invalid image, wrong mime, oversized and image-free JSON",()=>{
  expect(validateVisionInput(body)?.quadro).toBe("I");
  expect(validateVisionInput({...body,imageDataUrl:"data:image/svg+xml;base64,"+image})).toBeNull();
  expect(validateVisionInput({...body,imageDataUrl:"data:image/png;base64,"+image})).toBeNull();
  expect(validateVisionInput({...body,imageDataUrl:"data:image/jpeg;base64,"+"A".repeat(1_400_010)})).toBeNull();
 });
 it("fails closed in production before calling RPC/vision",async()=>{
  vi.stubEnv("VERCEL_ENV","production");
  expect((await call()).code).toBe(403);
  expect(m.rpc).not.toHaveBeenCalled();expect(m.fetch).not.toHaveBeenCalled();
 });
 it("rejects cross-tenant or master before vision",async()=>{
  expect((await call({...admin,tenant_id:other})).code).toBe(403);
  expect((await call({...admin,is_master:true})).code).toBe(403);
  expect(m.rpc).not.toHaveBeenCalled();expect(m.fetch).not.toHaveBeenCalled();
 });
 it("rejects users without municipality admin permission",async()=>{
  m.rpc.mockResolvedValueOnce({ok:true,status:200,payload:false});
  expect((await call()).code).toBe(403);
  expect(m.fetch).not.toHaveBeenCalled();
 });
 it("returns only unverified transcription; never activates or saves a draft",async()=>{
  const structured={
    zona:"ZM-B(e)",uso:"comercial",ca_minimo:"0,05",
    ca_basico:"0,5",ca_maximo:"1",ocupacao_maxima:"50%",
    permeabilidade_minima:"70%",lote_minimo:"3000 m²",
    testada_minima:"30 m",gabarito:"largura da via da testada + recuo",
    recuo_frontal:"10 m",recuo_fundos:"8 m",recuo_lateral:"5 m",
  };
  m.fetch.mockResolvedValue({ok:true,json:async()=>({result:{answer:JSON.stringify(structured)}})});
  const res=await call();
  expect(res.code).toBe(200);
  expect(res.payload.status).toBe("unverified_structured_ocr_draft");
  expect(res.payload.recognizable).toBe(13);
  expect(res.payload.total).toBe(13);
  expect(res.payload.draftText).toContain("C.A. mínimo: 0,05");
  expect(res.payload.automaticallyActivated).toBe(false);
  expect(res.payload.originalDocumentUploaded).toBe(false);
  expect(m.rpc).toHaveBeenCalledWith(expect.anything(),"is_urban_regulation_admin_v1",{
   _municipality_id:city,
  });
  expect(m.fetch).toHaveBeenCalledOnce();
  const callArgs=m.fetch.mock.calls[0];
  expect(callArgs[0]).toContain("/ai/run/@cf/moondream/moondream3.1-9B-A2B");
  expect(callArgs[1].body).not.toContain("password");
  const sent=JSON.parse(callArgs[1].body) as {question:string;image:string;task:string;stream:boolean};
  expect(sent.image).toBe(dataUrl);
  expect(sent.task).toBe("query");
  expect(sent.stream).toBe(false);
  expect(sent.question.length).toBeGreaterThan(50);
 });
 it("never treats a provider HTTP 200 with narrative text as valid structured OCR",async()=>{
   m.fetch.mockResolvedValue({ok:true,json:async()=>({result:{answer:
     "Os decimais estão preservados e nenhum valor foi inventado."}})});
   const res=await call();
   expect(res.code).toBe(200);
   expect(res.payload.status).toBe("unverified_unstructured_ocr_response");
   expect(res.payload.code).toBe("URBAN_VISION_UNSTRUCTURED");
   expect(res.payload.automaticallyActivated).toBe(false);
   expect(res.payload.originalDocumentUploaded).toBe(false);
   expect(res.payload.draftText).toBeUndefined();
   expect(res.payload.ocrPreview).toContain("Os decimais");
 });
 it("short or absent OCR output never generates verified numerical cells",async()=>{
   m.fetch.mockResolvedValue({ok:true,json:async()=>({result:{answer:"Nada legível"}})});
   const res=await call();
   expect(res.code).toBe(200);
   expect(res.payload.status).toBe("unverified_unstructured_ocr_response");
   expect(res.payload.recognizable).toBe(0);
   expect(res.payload.draftText).toBeUndefined();
 });
 it("returns non-success on Cloudflare error; never falls back to a different provider",async()=>{
  m.fetch.mockResolvedValue({ok:false,status:403});
  const res=await call();
  expect(res.code).toBe(502);
  expect(res.payload.draftText).toBeUndefined();
 });
});