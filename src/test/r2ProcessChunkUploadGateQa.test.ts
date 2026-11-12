import { beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../server/api/r2-process-proxy-upload";
import { callDataApiRpc, resolveMunicipalDocumentTarget } from "../../server/municipal-storage";

vi.mock("../../server/municipal-storage.js", () => ({
  callDataApiRpc: vi.fn(),
  readBearer: (req: { headers?: { authorization?: string } }) =>
    req.headers?.authorization?.startsWith("Bearer ") ?
      req.headers.authorization.slice(7) : "",
  resolveMunicipalDocumentTarget: vi.fn(),
}));
const municipality = "49dac0b6-6352-4744-9aab-9ff91c59d970";
const owner = "2244ccaa-1111-4111-8111-123456abcdef";
const other = "1244ccaa-1111-4111-8111-123456abcdef";
const key = "municipalities/" + municipality + "/protocols/" + owner +
  "/3234ccaa-1111-4111-8111-123456abcdef-arquitetura.pdf";
const payload = {
  action:"abort",bucket:"process-documents",objectKey:key,
  fileSize:3*1024*1024,contentType:"application/pdf",
  uploadId:"4234ccaa-1111-4111-8111-123456abcdef",
};
const valid = (value:unknown) => ({ok:true,status:200,payload:value,error:""});
function makeResponse() {
  const state:{statusCode:number,body:unknown,headers:Record<string,string>} = {
    statusCode:200,body:null,headers:{},
  };
  return {
    state,
    res: {
      get statusCode() {return state.statusCode;},
      set statusCode(n:number) {state.statusCode=n;},
      setHeader(name:string,value:string){state.headers[name]=value;},
      end(body:string){state.body=JSON.parse(body) as unknown;},
    },
  };
}
async function run(input:unknown,token?:string,origin?:string) {
  const {state,res} = makeResponse();
  const req = {
    method:"POST",
    body:input,
    headers:{
      authorization:token ? "Bearer "+token : "",
      host:"qa.sigapro.example",
      ...(origin?{origin}:{}),
    },
  };
  await handler(req as never,res as never);
  return state;
}

describe("SIGAPRO QA — auth de anexos grandes falha fechado antes do R2", () => {
  beforeEach(() => vi.resetAllMocks());

  it("nega qualquer solicitação anônima sem consultar Neon ou R2", async()=>{
    expect(await run(payload)).toMatchObject({statusCode:401});
    expect(callDataApiRpc).not.toHaveBeenCalled();
    expect(resolveMunicipalDocumentTarget).not.toHaveBeenCalled();
  });

  it("nega site externo antes de usar o Bearer",async()=>{
    const result = await run(payload,"FAKE_QA","https://site-falso.example");
    expect(result.statusCode).toBe(403);
    expect(callDataApiRpc).not.toHaveBeenCalled();
  });

  it("recusa objetos de guias e de legislações antes de consultar usuário",async()=>{
    const wrong = {...payload,objectKey:
      "municipalities/"+municipality+"/dam-originals/"+owner+"/guia.pdf"};
    expect((await run(wrong,"FAKE_QA")).statusCode).toBe(400);
    expect(callDataApiRpc).not.toHaveBeenCalled();
  });

  it("nega chave de um perfil diferente do perfil canônico autenticado",async()=>{
    vi.mocked(callDataApiRpc)
      .mockResolvedValueOnce(valid(other))
      .mockResolvedValueOnce(valid(true))
      .mockResolvedValueOnce(valid(false))
      .mockResolvedValueOnce(valid(false));
    const result=await run(payload,"FAKE_QA");
    expect(result.statusCode).toBe(403);
    expect(resolveMunicipalDocumentTarget).not.toHaveBeenCalled();
    expect(vi.mocked(callDataApiRpc).mock.calls.map(x=>x[1])).toEqual([
      "current_profile_id","has_tenant_access","is_municipality_admin","is_master",
    ]);
  });

  it("nega usuário sem vínculo com o tenant mesmo quando é dono do nome do arquivo",async()=>{
    vi.mocked(callDataApiRpc)
      .mockResolvedValueOnce(valid(owner))
      .mockResolvedValueOnce(valid(false))
      .mockResolvedValueOnce(valid(false))
      .mockResolvedValueOnce(valid(false));
    expect((await run(payload,"FAKE_QA")).statusCode).toBe(403);
    expect(resolveMunicipalDocumentTarget).not.toHaveBeenCalled();
  });

  it("Admin da Prefeitura e Master podem consultar, mas nunca anexar documentos", async()=>{
    for (const forbiddenRole of ["is_municipality_admin","is_master"]) {
      vi.mocked(callDataApiRpc).mockReset();
      vi.mocked(callDataApiRpc)
        .mockResolvedValueOnce(valid(owner))
        .mockResolvedValueOnce(valid(true))
        .mockResolvedValueOnce(valid(forbiddenRole==="is_municipality_admin"))
        .mockResolvedValueOnce(valid(forbiddenRole==="is_master"));
      const response = await run(payload,"FAKE_QA");
      expect(response.statusCode).toBe(403);
      expect(resolveMunicipalDocumentTarget).not.toHaveBeenCalled();
    }
  });

  it("nega limites de plano expirado antes de qualquer escrita",async()=>{
    vi.mocked(callDataApiRpc)
      .mockResolvedValueOnce(valid(owner))
      .mockResolvedValueOnce(valid(true))
      .mockResolvedValueOnce(valid(false))
      .mockResolvedValueOnce(valid(false))
      .mockResolvedValueOnce({ok:false,status:409,payload:null,error:"quota"});
    expect((await run(payload,"FAKE_QA")).statusCode).toBe(409);
    expect(resolveMunicipalDocumentTarget).not.toHaveBeenCalled();
  });
});
