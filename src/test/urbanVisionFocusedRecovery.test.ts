import { describe,expect,it,vi,beforeEach,afterEach } from "vitest";
import { parseFocusedUrbanCell } from "@/lib/urbanVisionStructured";
import {validateVisionInput,suggestUrbanMatrixPageText} from "../../server/urban-matrix-vision";
import {readFileSync} from "node:fs";
const fake=vi.hoisted(()=>({rpc:vi.fn(),env:vi.fn(),fetch:vi.fn()}));
vi.mock("../../server/municipal-storage.js",()=>({callDataApiRpc:fake.rpc,readEnv:fake.env}));
vi.mock("../../server/cloudflare-ai-provider.js",()=>({resolveCloudflareAiConfig:()=>({
 token:"fake-token",model:"@cf/moondream/moondream3.1-9B-A2B",endpoint:"https://invalid.example",
})}));
const city="11111111-1111-4111-8111-111111111111";
const img="data:image/jpeg;base64,"+Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(900,0)]).toString("base64");
describe("SIGAPRO — 2ª leitura seletiva por célula, sem aprovações automáticas",()=>{
 beforeEach(()=>{
   vi.resetAllMocks();vi.stubEnv("VERCEL_ENV","preview");
   fake.env.mockImplementation((k:string)=>k==="VITE_SIGAPRO_URBAN_MATRIX_QA_ENABLED"?"true":
     k==="SIGAPRO_AI_PROVIDER"?"cloudflare":k==="SIGAPRO_CF_ACCOUNT_ID"?"0123456789abcdef0123456789abcdef":"placeholder");
   fake.rpc.mockResolvedValue({ok:true,status:200,payload:true});
   vi.stubGlobal("fetch",fake.fetch);
 });
 afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
 it("rejects unsupported fields and forbids fieldKey on regular OCR",()=>{
  const body={action:"urban-matrix-vision",quadro:"I",pageNumber:36,imageDataUrl:img};
  expect(validateVisionInput({...body,mode:"focused",fieldKey:"ca_minimo"})?.fieldKey).toBe("ca_minimo");
  expect(validateVisionInput({...body,mode:"focused",fieldKey:"owner_password"})).toBeNull();
  expect(validateVisionInput({...body,mode:"focused"})).toBeNull();
  expect(validateVisionInput({...body,mode:"structured",fieldKey:"zona"})).toBeNull();
 });
 it("validates numbers literally and rejects guesses or prose",()=>{
  expect(parseFocusedUrbanCell("0,05","ca_minimo")).toBe("0,05");
  expect(parseFocusedUrbanCell("C.A. mínimo: 0,05","ca_minimo")).toBe("0,05");
  expect(parseFocusedUrbanCell("0,5 ou 0,05","ca_minimo")).toBeNull();
  expect(parseFocusedUrbanCell("O valor provavelmente é 0,05","ca_minimo")).toBeNull();
  expect(parseFocusedUrbanCell("0,5","ca_minimo")).toBe("0,5"); // unverified, never compared to official PDF
  expect(parseFocusedUrbanCell("comercial","zona")).toBeNull();
  expect(parseFocusedUrbanCell("ZM-B(e)","zona")).toBe("ZM-B(e)");
  expect(parseFocusedUrbanCell("[ILEGÍVEL]","ca_basico")).toBeNull();
 });
 it("only asks for the requested header and never exposes the historical JSON as a hint",async()=>{
  fake.fetch.mockResolvedValue({ok:true,json:async()=>({result:{answer:"0,05"}})});
  let output:any=null;
  const req={method:"POST"};
  const res={statusCode:200,setHeader:vi.fn(),end:vi.fn((value:string)=>{output=JSON.parse(value);})};
  await suggestUrbanMatrixPageText(req as never,res as never,{
   municipality_id:city,tenant_id:city,is_master:false
  },{action:"urban-matrix-vision",quadro:"I",pageNumber:36,imageDataUrl:img,mode:"focused",fieldKey:"ca_minimo"});
  expect(res.statusCode).toBe(200);
  expect(output.status).toBe("unverified_focused_cell");
  expect(output.read).toBe("0,05");
  expect(output.automaticallyActivated).toBe(false);
  const sent=JSON.parse(fake.fetch.mock.calls[0][1].body);
  expect(sent.question).toContain("C.A. mínimo");
  expect(sent.question).not.toContain("0,05");
  expect(sent.question).not.toContain("3000");
  expect(sent.image).toBe(img);
 });
 it("UI only offers a separately tracked, explicitly initiated call",()=>{
  const src=readFileSync("src/components/platform/UrbanLegalMatrixImporter.tsx","utf8");
  expect(src).toContain('data-urban-focus-review="true"');
  expect(src).toContain('onClick={()=>void readPageImage("focused")}');
  expect(src).toContain('visionMode==="focused"?{fieldKey:focusSelection}:{}');
  expect(src).toContain("setFocusedResults(previous=>({...previous,[focusSelection]:read}))");
  expect(src).toContain('setFocusCandidates([]);setFocusedResults({});setFocusNotice("")');
  expect(src).not.toContain("setText(read)");
 });
});