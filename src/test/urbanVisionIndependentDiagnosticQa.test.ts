import { describe,it,expect,vi,beforeEach,afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { compareUrbanVisionDrafts } from "@/lib/urbanVisionDiagnostic";
import {parseUrbanVisionResult} from "@/lib/urbanVisionStructured";
import {validateVisionInput,suggestUrbanMatrixPageText} from "../../server/urban-matrix-vision";
const mock=vi.hoisted(()=>({rpc:vi.fn(),env:vi.fn(),fetch:vi.fn()}));
vi.mock("../../server/municipal-storage.js",()=>({callDataApiRpc:mock.rpc,readEnv:mock.env}));
vi.mock("../../server/cloudflare-ai-provider.js",()=>({resolveCloudflareAiConfig:()=>({
 token:"fake-token",model:"@cf/moondream/moondream3.1-9B-A2B",endpoint:"https://invalid.example"
})}));
const image="data:image/jpeg;base64,"+Buffer.concat([Buffer.from([0xff,0xd8,0xff]),Buffer.alloc(900)]).toString("base64");
const city="11111111-1111-4111-8111-111111111111";
describe("SIGAPRO — 13 campos com auditoria independente Gemma 4, sem gravacao",()=>{
 beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv("VERCEL_ENV","preview");
  mock.env.mockImplementation((name:string)=>name==="SIGAPRO_AI_PROVIDER"?"cloudflare":
    name==="SIGAPRO_CF_ACCOUNT_ID"?"0123456789abcdef0123456789abcdef":
    name==="VITE_SIGAPRO_URBAN_MATRIX_QA_ENABLED"?"true":"placeholder");
  mock.rpc.mockResolvedValue({ok:true,status:200,payload:true});
  vi.stubGlobal("fetch",mock.fetch);
 });
 afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.restoreAllMocks();});
 it("nao recebe campo extra nem senha e aceita apenas a segunda consulta autorizada",()=>{
  const body={action:"urban-matrix-vision",quadro:"I",pageNumber:36,imageDataUrl:image,mode:"expert"};
  expect(validateVisionInput(body)?.mode).toBe("expert");
  expect(validateVisionInput({...body,fieldKey:"zona"})).toBeNull();
  expect(validateVisionInput({...body,mode:"unknown"})).toBeNull();
 });
 it("usa Gemma 4 Vision com contrato de imagem documentado e sem contexto legal esperado",async()=>{
  const answer=JSON.stringify({zona:"ZM-B(e)",uso:"comercial",ca_minimo:"0,05",recuo_frontal:"10"});
  mock.fetch.mockResolvedValue({ok:true,status:200,json:async()=>({
    result:{choices:[{message:{content:answer}}]},
  })});
  let payload:any;
  const req={method:"POST"};
  const res={statusCode:200,setHeader:vi.fn(),end:vi.fn((value:string)=>{payload=JSON.parse(value);})};
  await suggestUrbanMatrixPageText(req as never,res as never,
   {municipality_id:city,tenant_id:city,is_master:false},
   {action:"urban-matrix-vision",quadro:"I",pageNumber:36,imageDataUrl:image,mode:"expert"});
  expect(res.statusCode).toBe(200);
  expect(payload.status).toBe("unverified_expert_ocr_draft");
  expect(payload.automaticallyActivated).toBe(false);
  const [url,opts]=mock.fetch.mock.calls[0];
  expect(url).toContain("/ai/run/@cf/google/gemma-4-26b-a4b-it");
  const sent=JSON.parse(opts.body);
  expect(sent.messages[0].content[1].type).toBe("image_url");
  expect(sent.messages[0].content[1].image_url.url).toBe(image);
  expect(sent.messages[0].content[0].text).not.toContain("0,05");
  expect(sent.chat_template_kwargs.enable_thinking).toBe(false);
  expect(sent.max_completion_tokens).toBe(2000);
 });
 it("detecta resposta da Gemma com tokens consumidos e conteúdo vazio",async()=>{
  mock.fetch.mockResolvedValue({ok:true,status:200,json:async()=>({
    result:{choices:[{finish_reason:"length",message:{content:"",reasoning_content:null}}],
      usage:{completion_tokens:1500}},
  })});
  let payload:any;
  const res={statusCode:200,setHeader:vi.fn(),end:vi.fn((value:string)=>{payload=JSON.parse(value);})};
  await suggestUrbanMatrixPageText({method:"POST"} as never,res as never,
    {municipality_id:city,tenant_id:city,is_master:false},
    {action:"urban-matrix-vision",quadro:"I",pageNumber:36,imageDataUrl:image,mode:"expert"});
  expect(payload.status).toBe("unverified_unstructured_ocr_response");
  expect(payload.diagnosticCode).toBe("GEMMA_EMPTY_COMPLETION");
  expect(payload.automaticallyActivated).toBe(false);
 });
 it("diagnostica divergencia de zona, lacunas e valores coincidentes",()=>{
  const first="Zona: ZM-B(e)\nUso: comercial\nC.A. mínimo: [ILEGÍVEL]\nRecuo frontal: 10";
  const second="Zona: comercial\nUso: comercial\nC.A. mínimo: 0,05\nRecuo frontal: 10 m";
  const rows=compareUrbanVisionDrafts(first,second);
  expect(rows).toHaveLength(13);
  expect(rows.find(x=>x.key==="zona")?.verdict).toBe("conflict");
  expect(rows.find(x=>x.key==="uso")?.verdict).toBe("agree");
  expect(rows.find(x=>x.key==="ca_minimo")?.verdict).toBe("one_model_only");
  expect(rows.find(x=>x.key==="recuo_frontal")?.verdict).toBe("conflict");
  expect(rows.find(x=>x.key==="ca_basico")?.verdict).toBe("not_read");
 });
 it("nunca trata a classe comercial como codigo da zona",()=>{
  const parsed=parseUrbanVisionResult(JSON.stringify({
    zona:"comercial",uso:"comercial",ca_minimo:"0,05",ca_basico:"0,5",
  }));
  expect(parsed?.unrecognized).toContain("zona");
  expect(parsed?.recognizable).toBe(3);
  expect(parsed?.draftText).toContain("Zona: [ILEGÍVEL]");
 });
 it("auditoria da IA nunca preenche indice nem aprova por consenso",()=>{
  const ui=readFileSync("src/components/platform/UrbanLegalMatrixImporter.tsx","utf8");
  expect(ui).toContain('data-urban-expert-audit="true"');
  expect(ui).toContain('onClick={()=>void readPageImage("expert")}');
  expect(ui).toContain('setAutoAuditPending(true)');
  expect(ui).toContain('void readPageImage("expert")');
  expect(ui).toContain('Executar leitura completa e diagnóstico com 2 IAs');
  expect(ui).toContain('setFocusCandidates(diagnosticsPending)');
  expect(ui).toContain('setExpertDiagnostics(null);setExpertStatus("");setOcrVerified(false)');
  expect(ui).toContain('const scopeIsCurrent=()=>');
  expect(ui).toContain('if(!scopeIsCurrent())return;');
  expect(ui).toContain('current.file===requestedScope.file && current.pageImage===requestedScope.pageImage');
  expect(ui).not.toContain('},[text]);');
  expect(ui).toContain('compareUrbanVisionDrafts(hasInitialDraft?text:"",result.draftText)');
  expect(ui).toContain("Nenhum índice foi aprovado.");
  expect(ui).toContain('setExpertDiagnostics(null);setExpertStatus("")');
 });
});
