import { describe,expect,it,vi } from "vitest";
import { QA_DOCUMENT_ENDPOINT,QA_DOCUMENT_ORIGIN,QA_DOCUMENT_CONTEXT_RPC,validateQaDocumentE2eConfig,runQaDocumentE2e } from "../../scripts/qa-neon-positive-document-e2e.mjs";
const createJwt=(sub:string)=>"e30."+Buffer.from(JSON.stringify({sub})).toString("base64url")+".sig";
const tenant="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const qaProfile="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
describe("QA-only positive storage smoke requires opt-in and secrets external to source",()=>{
  it("hard-pins the isolated branch, never a production host",()=>{
    expect(QA_DOCUMENT_ENDPOINT).toContain("br-solitary-sound-b4xlbvs6-sigaproqa.");
    expect(QA_DOCUMENT_ORIGIN).toContain("-git-qa-sigapro-");
    expect(QA_DOCUMENT_ENDPOINT).not.toContain("sigapromunicipal.com.br");
  });
  it("cannot run without explicit consent or an actual JWT-shaped token",()=>{
    expect(()=>validateQaDocumentE2eConfig({SIGAPRO_QA_JWT:createJwt("qa-tester"),SIGAPRO_QA_TENANT_ID:tenant})).toThrow("opção explícita");
    expect(()=>validateQaDocumentE2eConfig({
      SIGAPRO_QA_DOCUMENT_E2E_OPT_IN:"QA_ONLY_WITH_CLEANUP",
      SIGAPRO_QA_JWT:"not-a-jwt",SIGAPRO_QA_TENANT_ID:tenant
    })).toThrow("JWT");
  });
  it("rejects a second token from the same QA account",()=>{
    expect(()=>validateQaDocumentE2eConfig({
      SIGAPRO_QA_DOCUMENT_E2E_OPT_IN:"QA_ONLY_WITH_CLEANUP",
      SIGAPRO_QA_JWT:createJwt("qa-tester"),SIGAPRO_QA_OTHER_JWT:createJwt("qa-tester"),
      SIGAPRO_QA_TENANT_ID:tenant
    })).toThrow("outro usuário");
  });
  it("attempts cleanup if transport fails after an ambiguous QA PUT",async()=>{
    const token=createJwt("qa-tester"),requests:string[]=[];
    const fake=vi.fn(async(url:string,opts:RequestInit)=>{
      const action=new URL(url).pathname.split("/").pop()||"";
      requests.push(action);
      if(action==="get_current_profile_context")return {status:200,json:async()=>({tenant_id:tenant,profile_id:qaProfile})} as Response;
      if(action==="upload")throw new Error("QA transport timeout after unknown PUT");
      // Vitest may use a browser-like environment without the native Response
      // constructor. Keep this fake transport independent of that global.
      if(action==="object")return {
        status:200,
        json:async()=>({ok:true,objectKey:new URL(url).searchParams.get("objectKey")}),
      } as Response;
      if(action==="read")return {status:404} as Response;
      throw new Error("Unexpected action "+action);
    });
    const env={
      SIGAPRO_QA_DOCUMENT_E2E_OPT_IN:"QA_ONLY_WITH_CLEANUP",
      SIGAPRO_QA_JWT:token,
      SIGAPRO_QA_TENANT_ID:tenant,
    };
    await expect(runQaDocumentE2e(env,fake as unknown as typeof fetch,vi.fn()))
      .rejects.toThrow("QA transport timeout");
    expect(requests).toEqual(["get_current_profile_context","upload","object","read"]);
  });
  it("pins the signed QA profile lookup to the QA Data API, not production",()=>{
    expect(QA_DOCUMENT_CONTEXT_RPC).toContain("/sigapro_migration_stage_20260923/rest/v1/rpc/get_current_profile_context");
    expect(QA_DOCUMENT_CONTEXT_RPC).not.toContain("sigapromunicipal.com.br");
  });
  it("stops before uploading when a signed primary QA account belongs to another municipality",async()=>{
    const calls:string[]=[];
    const fake=vi.fn(async(url:string)=>{
      calls.push(new URL(url).pathname.split("/").pop()||"");
      return {status:200,json:async()=>({tenant_id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",profile_id:qaProfile})} as Response;
    });
    await expect(runQaDocumentE2e({
      SIGAPRO_QA_DOCUMENT_E2E_OPT_IN:"QA_ONLY_WITH_CLEANUP",
      SIGAPRO_QA_JWT:createJwt("first-test-account"),SIGAPRO_QA_TENANT_ID:tenant,
    },fake as unknown as typeof fetch,vi.fn())).rejects.toThrow("does not belong");
    expect(calls).toEqual(["get_current_profile_context"]);
  });
  it("does not claim cross-municipality proof for two users of the same municipality",async()=>{
    const calls:string[]=[];
    const fake=vi.fn(async(url:string)=>{
      calls.push(new URL(url).pathname.split("/").pop()||"");
      return {status:200,json:async()=>({tenant_id:tenant,profile_id:qaProfile})} as Response;
    });
    await expect(runQaDocumentE2e({
      SIGAPRO_QA_DOCUMENT_E2E_OPT_IN:"QA_ONLY_WITH_CLEANUP",
      SIGAPRO_QA_JWT:createJwt("first-test-account"),
      SIGAPRO_QA_OTHER_JWT:createJwt("second-test-account"),
      SIGAPRO_QA_TENANT_ID:tenant,
    },fake as unknown as typeof fetch,vi.fn()))
      .rejects.toThrow("different verified municipality");
    expect(calls).toEqual(["get_current_profile_context","get_current_profile_context"]);
  });
  it("tests the profile-owned PDF and JPEG paths used by ProtocolarProjetoPage, not the auth subject",async()=>{
    const sub="different-better-auth-user-subject";
    const auth=createJwt(sub);
    const files=new Map<string,Buffer>();
    const accessed:string[]=[];
    const fake=vi.fn(async(url:string,opts:RequestInit)=>{
      const endpoint=new URL(url);
      const action=endpoint.pathname.split("/").pop()||"";
      accessed.push(action);
      if(action==="get_current_profile_context")return {
        status:200,
        json:async()=>({tenant_id:tenant,profile_id:qaProfile}),
      } as Response;
      const key=endpoint.searchParams.get("objectKey")||"";
      if(action==="upload"){
        expect(key).toMatch(new RegExp("^municipalities/"+tenant+"/protocols/"+qaProfile+"/qa-e2e-"));
        expect(key).not.toContain(sub);
        const data=Buffer.from(opts.body as Uint8Array);
        files.set(key,data);
        return {status:200,json:async()=>({ok:true,objectKey:key,storageProvider:"neon_qa_function"})} as Response;
      }
      if(action==="read"){
        const data=files.get(key);
        return data?{
          status:200,
          headers:{get:(name:string)=>name.toLowerCase()==="content-type"?(key.endsWith(".pdf")?"application/pdf":"image/jpeg"):null},
          arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),
        } as Response:{status:404} as Response;
      }
      if(action==="list-user-files")return {
        status:200,json:async()=>({
          storageProvider:"neon_qa_function",
          files:[...files].map(([objectKey,bytes])=>({objectKey,size:bytes.byteLength})),
        }),
      } as Response;
      if(action==="object"){
        files.delete(key);
        return {status:200,json:async()=>({ok:true,objectKey:key})} as Response;
      }
      throw new Error("Unexpected QA call "+action);
    });
    const reported:string[]=[];
    await runQaDocumentE2e({
      SIGAPRO_QA_DOCUMENT_E2E_OPT_IN:"QA_ONLY_WITH_CLEANUP",
      SIGAPRO_QA_JWT:auth,SIGAPRO_QA_TENANT_ID:tenant,
    },fake as unknown as typeof fetch,msg=>reported.push(msg));
    expect(accessed).toEqual([
      "get_current_profile_context","upload","read","upload","read",
      "list-user-files","object","read","object","read",
    ]);
    expect(reported.some(message=>message.includes("PDF upload"))).toBe(true);
    expect(reported.some(message=>message.includes("JPEG upload"))).toBe(true);
    expect(reported.some(message=>message.includes("cleanup verified"))).toBe(true);
    expect(files.size).toBe(0);
  });
  it("aborts when a signed QA session has no profile_id, before any upload",async()=>{
    const calls:string[]=[];
    const fake=vi.fn(async(url:string)=>{
      calls.push(new URL(url).pathname.split("/").pop()||"");
      return {status:200,json:async()=>({tenant_id:tenant})} as Response;
    });
    await expect(runQaDocumentE2e({
      SIGAPRO_QA_DOCUMENT_E2E_OPT_IN:"QA_ONLY_WITH_CLEANUP",
      SIGAPRO_QA_JWT:createJwt("qa-subject"),SIGAPRO_QA_TENANT_ID:tenant,
    },fake as unknown as typeof fetch,vi.fn())).rejects.toThrow("profile ID");
    expect(calls).toEqual(["get_current_profile_context"]);
  });
  it("does not issue any network requests if missing opt-in",async()=>{
    const request=vi.fn();
    await expect(runQaDocumentE2e({},request as unknown as typeof fetch,vi.fn()))
      .rejects.toThrow("opção explícita");
    expect(request).not.toHaveBeenCalled();
  });
});
