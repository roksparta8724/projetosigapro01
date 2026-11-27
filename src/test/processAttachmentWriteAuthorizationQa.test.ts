import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { authorizeProcessAttachmentWrite, parseProcessAttachmentWriteKey } from "../../server/process-attachment-write-authorization";
import { callDataApiRpc } from "../../server/municipal-storage";

vi.mock("../../server/municipal-storage.js",()=>({callDataApiRpc:vi.fn()}));
const tenant="49dac0b6-6352-4744-9aab-9ff91c59d970";
const owner="2244ccaa-1111-4111-8111-123456abcdef";
const key="municipalities/"+tenant+"/protocols/"+owner+
  "/3234ccaa-1111-4111-8111-123456abcdef-planta.pdf";
const req={headers:{authorization:"Bearer QA_TEST_TOKEN"}};
const pass=(payload:unknown)=>({ok:true,status:200,payload,error:""});
const fail=(status=503)=>({ok:false,status,payload:null,error:"unavailable"});

function mockPerms(profile:string, member:boolean, admin:boolean, master:boolean){
  vi.mocked(callDataApiRpc)
    .mockResolvedValueOnce(pass(profile))
    .mockResolvedValueOnce(pass(member))
    .mockResolvedValueOnce(pass(admin))
    .mockResolvedValueOnce(pass(master));
}
describe("SIGAPRO QA — restrição de gravação dos documentos do processo",()=>{
  beforeEach(()=>vi.resetAllMocks());

  it("permite ao titular com vínculo ativo e perfil operacional, sem elevar poderes",async()=>{
    mockPerms(owner,true,false,false);
    expect(await authorizeProcessAttachmentWrite(req as never,key)).toEqual({ok:true});
    expect(vi.mocked(callDataApiRpc).mock.calls.map(c=>c[1])).toEqual([
      "current_profile_id","has_tenant_access","is_municipality_admin","is_master",
    ]);
  });

  it("Admin Prefeitura e Master permanecem estritamente de consulta",async()=>{
    for(const forbidden of ["admin","master"]){
      vi.mocked(callDataApiRpc).mockReset();
      mockPerms(owner,true,forbidden==="admin",forbidden==="master");
      expect(await authorizeProcessAttachmentWrite(req as never,key))
        .toMatchObject({ok:false,status:403});
    }
  });

  it("nega outros perfis, ausência de vínculo ou falha ao consultar permissão",async()=>{
    mockPerms("1244ccaa-1111-4111-8111-123456abcdef",true,false,false);
    expect(await authorizeProcessAttachmentWrite(req as never,key))
      .toMatchObject({ok:false,status:403});
    vi.mocked(callDataApiRpc).mockReset();
    mockPerms(owner,false,false,false);
    expect(await authorizeProcessAttachmentWrite(req as never,key))
      .toMatchObject({ok:false,status:403});
    vi.mocked(callDataApiRpc).mockReset();
    vi.mocked(callDataApiRpc)
      .mockResolvedValueOnce(pass(owner))
      .mockResolvedValueOnce(pass(true))
      .mockResolvedValueOnce(fail())
      .mockResolvedValueOnce(pass(false));
    expect(await authorizeProcessAttachmentWrite(req as never,key))
      .toMatchObject({ok:false,status:503});
  });

  it("nega paths bancários/legais, traversal, nomes malformados",()=>{
    expect(parseProcessAttachmentWriteKey(key)).toMatchObject({municipalityId:tenant,ownerProfileId:owner});
    for(const wrong of [
      "municipalities/"+tenant+"/dam-originals/"+owner+"/item.pdf",
      "municipalities/"+tenant+"/legislation-registry/"+owner+"/item.pdf",
      "municipalities/"+tenant+"/protocols/"+owner+"/../admin.pdf",
      "municipalities/"+tenant+"/protocols/any-user/3234ccaa-1111-4111-8111-123456abcdef-doc.pdf",
    ])expect(parseProcessAttachmentWriteKey(wrong)).toBeNull();
  });

  it("a mesma política é chamada por upload base64 e upload em partes",()=>{
    const regular=readFileSync("server/api/r2-upload.ts","utf8");
    const chunked=readFileSync("server/api/r2-process-proxy-upload.ts","utf8");
    expect(regular).toContain("authorizeProcessAttachmentWrite(req, objectKey)");
    expect(chunked).toContain("authorizeProcessAttachmentWrite(req, v.objectKey)");
    expect(regular).toContain('"/dam-originals/"');
    expect(regular).toContain('"can_manage_urban_legislation_registry_v1"');
  });
});
