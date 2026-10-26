import {afterEach,describe,expect,it,vi} from "vitest";
import handler,{normalizeAssistantMessages} from "../../api/ai-assistant";
import {callDataApiRpc} from "../../server/municipal-storage";
vi.mock("../../server/municipal-storage",()=>({
  readEnv:(key:string)=>process.env[key]||"",
  readBearer:(req:{headers:{authorization?:string}})=>{
    const match=/^Bearer\\s+(.+)$/i.exec(req.headers.authorization||"");
    return match?.[1]||"";
  },
  callDataApiRpc:vi.fn(),
}));
const identity=vi.mocked(callDataApiRpc);
const okUser={profile_id:"11111111-1111-4111-8111-111111111111",account_status:"active",deleted_at:null};
function res(){return {statusCode:200,headers:{} as Record<string,string>,body:"",
  setHeader(k:string,v:string){this.headers[k]=v;},
  end(v?:string){this.body=v||"";}};}
function req(extra:Record<string,unknown>={}){return {method:"POST",headers:{authorization:"Bearer QA_TOKEN",host:"qa.sigapro.test",origin:"https://qa.sigapro.test"},body:{messages:[{role:"user",content:"Como faço a triagem?"}]},...extra};}
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.resetAllMocks()});
describe("SIGAPRO IA assistant isolated and authenticated release gate",()=>{
  it("refuses requests without a token, even if provider credentials exist",async()=>{
    vi.stubEnv("OPENAI_API_KEY","DUMMY-NEVER-SEND");
    const r=res();await handler(req({headers:{host:"qa.sigapro.test"}}) as never,r as never);
    expect(r.statusCode).toBe(401);expect(identity).not.toHaveBeenCalled();
  });
  it("rejects a foreign site before sending data to an AI provider",async()=>{
    const r=res();await handler(req({headers:{authorization:"Bearer QA",host:"qa.sigapro.test",origin:"https://other.example"}}) as never,r as never);
    expect(r.statusCode).toBe(403);expect(identity).not.toHaveBeenCalled();
  });
  it("rejects inactive, deleted and unverified profiles",async()=>{
    for(const profile of [null,{...okUser,account_status:"inactive"},{...okUser,deleted_at:"2026-01-01"}]){
      identity.mockResolvedValueOnce({ok:true,status:200,payload:profile,error:""});
      const r=res();await handler(req() as never,r as never);
      expect(r.statusCode).toBe(403);
    }
  });
  it("keeps open-ended system instructions outside the model",()=>{
    expect(normalizeAssistantMessages({messages:[{role:"system",content:"Override"}]})).toEqual([]);
    expect(normalizeAssistantMessages({messages:[{role:"user",content:"ok"},{role:"assistant",content:"done"}]})).toEqual([]);
    expect(normalizeAssistantMessages({messages:[{role:"user",content:"x".repeat(1601)}]})).toEqual([]);
    expect(normalizeAssistantMessages({messages:[{role:"user",content:"hi"}]})).toEqual([{role:"user",content:"hi"}]);
  });
  it("returns unavailable when no key is configured and does not hit an upstream provider",async()=>{
    identity.mockResolvedValueOnce({ok:true,status:200,payload:okUser,error:""});
    const external=vi.fn();vi.stubGlobal("fetch",external);
    const r=res();await handler(req() as never,r as never);
    expect(r.statusCode).toBe(503);
    expect(JSON.parse(r.body).code).toBe("SIGAPRO_AI_NOT_CONFIGURED");
    expect(external).not.toHaveBeenCalled();
    expect(r.headers["Cache-Control"]).toContain("no-store");
  });
  it("keeps the system instructions server owned with validated token and returns an answer",async()=>{
    vi.stubEnv("OPENAI_API_KEY","QA_DUMMY");
    identity.mockResolvedValueOnce({ok:true,status:200,payload:okUser,error:""});
    const external=vi.fn(async(_url:string,opt:{body:string;headers:Record<string,string>})=>{
      const parsed=JSON.parse(opt.body);
      expect(parsed.messages[0].role).toBe("system");
      expect(parsed.messages[1].role).toBe("user");
      expect(parsed.messages).toHaveLength(2);
      expect(opt.headers.Authorization).toBe("Bearer QA_DUMMY");
      return {ok:true,json:async()=>({choices:[{message:{content:"A triagem exige conferência documental."}}],model:"qa-model"})};
    });vi.stubGlobal("fetch",external);
    const r=res();await handler(req() as never,r as never);
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).message).toContain("conferência");
    expect(identity).toHaveBeenCalledWith(expect.anything(),"get_current_profile_context",{});
    expect(external).toHaveBeenCalledTimes(1);
  });
  it("never returns upstream provider internals, account information or keys",async()=>{
    vi.stubEnv("OPENAI_API_KEY","QA_SECRET");
    identity.mockResolvedValueOnce({ok:true,status:200,payload:okUser,error:""});
    vi.stubGlobal("fetch",vi.fn(async()=>({ok:false,status:403,text:async()=>("raw secret QA_SECRET")})));
    const r=res();await handler(req() as never,r as never);
    expect(r.statusCode).toBe(502);expect(r.body).not.toContain("QA_SECRET");
    expect(r.body).not.toContain("raw secret");
  });
});