import {describe,expect,it,vi,beforeEach} from "vitest";
import {readFileSync} from "node:fs";
import handler,{validateProcessChunkPayload} from "../../server/api/r2-process-proxy-upload";
import {callDataApiRpc,resolveMunicipalDocumentTarget} from "../../server/municipal-storage";
import {PROCESS_INLINE_MAX_BYTES,largeProcessAttachmentMime} from "@/integrations/r2/processChunkUpload";

vi.mock("../../server/municipal-storage.js",()=>({
  readBearer:(req:{headers?:{authorization?:string}})=>
    req.headers?.authorization?.startsWith("Bearer ")?
      req.headers.authorization.slice(7):"",
  callDataApiRpc:vi.fn(),
  resolveMunicipalDocumentTarget:vi.fn(),
}));
const city="49dac0b6-6352-4744-9aab-9ff91c59d970";
const processId="2244ccaa-1111-4111-8111-123456abcdef";
const guideId="3234ccaa-1111-4111-8111-123456abcdef";
const sha="b".repeat(64);
const key="municipalities/"+city+"/processes/"+processId+
  "/dam-originals/"+guideId+"/"+sha+".pdf";
const sample={action:"abort",bucket:"process-documents",objectKey:key,
  fileSize:4*1024*1024,contentType:"application/pdf",
  uploadId:"4234ccaa-1111-4111-8111-123456abcdef"};
const allowed=(payload:unknown)=>({ok:true,status:200,payload,error:""});
async function request(body:unknown,authenticated=true){
  const state:{code:number;data:Record<string,unknown>|null}={code:200,data:null};
  const req={method:"POST",body,
    headers:{host:"qa.sigapro.example",
      authorization:authenticated?"Bearer qa-mock-token":""}};
  const res={
    set statusCode(v:number){state.code=v;},
    get statusCode(){return state.code;},
    setHeader:vi.fn(),
    end:(json:string)=>{state.data=JSON.parse(json) as Record<string,unknown>},
  };
  await handler(req as never,res as never);
  return state;
}
describe("SIGAPRO: multi-part de DAM original acima do limite HTTP",()=>{
  beforeEach(()=>vi.resetAllMocks());
  it("aceita somente chave canonica SHA256, ate 25 MB e MIME PDF",()=>{
    const input=validateProcessChunkPayload(sample);
    expect(input).toMatchObject({municipalityId:city,actorId:guideId,
      damOriginal:{processId,guideId,sha256:sha},count:2});
    expect(validateProcessChunkPayload({...sample,action:"finalize",fileSha256:sha}))
      .toMatchObject({fileSha256:sha,damOriginal:{guideId}});
    expect(validateProcessChunkPayload({...sample,action:"finalize",fileSha256:"c".repeat(64)}))
      .toBeNull();
    expect(validateProcessChunkPayload({...sample,fileSize:25*1024*1024+1})).toBeNull();
    expect(validateProcessChunkPayload({...sample,contentType:"image/png"})).toBeNull();
    expect(validateProcessChunkPayload({...sample,objectKey:key.replace("/processes/","/attachments/")})).toBeNull();
  });
  it("encaminha o PDF grande pelo mesmo cliente de chunks, sem comprimir a guia e QR",()=>{
    const file={name:"guia.pdf",size:PROCESS_INLINE_MAX_BYTES+1,type:"application/pdf"};
    expect(largeProcessAttachmentMime({bucket:"process-documents",objectKey:key,file}))
      .toBe("application/pdf");
    expect(largeProcessAttachmentMime({bucket:"process-documents",objectKey:key,
      file:{...file,size:25*1024*1024+1}})).toBeNull();
    expect(largeProcessAttachmentMime({bucket:"process-documents",objectKey:key,
      file:{...file,type:"text/html"}})).toBeNull();
    const client=readFileSync("src/integrations/r2/processChunkUpload.ts","utf8");
    expect(client).toContain("dam[1].toLowerCase() !== fileSha256");
    expect(client).toContain("await postPart({...base,action:\"finalize\",fileSha256}");
  });
  it("bloqueia antes de ler banco sem autenticacao",async()=>{
    expect((await request(sample,false)).code).toBe(401);
    expect(callDataApiRpc).not.toHaveBeenCalled();
  });
  it("guia paga, congelamento invalido ou perfil nao autorizado bloqueiam qualquer escrita",async()=>{
    vi.mocked(callDataApiRpc).mockResolvedValue({ok:true,status:200,payload:false,error:""});
    const out=await request(sample);
    expect(out.code).toBe(403);
    expect(vi.mocked(callDataApiRpc).mock.calls[0]).toMatchObject([
      expect.anything(),"authorize_payment_guide_original_upload_v2",
      {_guide_id:guideId,_municipality_id:city,_process_id:processId},
    ]);
    expect(resolveMunicipalDocumentTarget).not.toHaveBeenCalled();
  });
  it("autorizacao bancaria nao pula plano ou cota municipal",async()=>{
    vi.mocked(callDataApiRpc)
      .mockResolvedValueOnce(allowed(true))
      .mockResolvedValueOnce({ok:false,status:409,payload:null,error:"quota"});
    const out=await request(sample);
    expect(out.code).toBe(409);
    expect(vi.mocked(callDataApiRpc).mock.calls.map(c=>c[1]))
      .toEqual(["authorize_payment_guide_original_upload_v2","assert_municipality_entitlement_v1"]);
    expect(resolveMunicipalDocumentTarget).not.toHaveBeenCalled();
  });
  it("no fim do multipart valida bytes reais antes de expor sucesso",()=>{
    const code=readFileSync("server/api/r2-process-proxy-upload.ts","utf8");
    expect(code).toContain("if (v.damOriginal) {");
    expect(code).toContain("await assertStoredDamOriginal(client,{");
    expect(code).toContain("expectedSha256:v.damOriginal.sha256");
    expect(code).toContain("IfNoneMatch:\"*\"");
  });
});
