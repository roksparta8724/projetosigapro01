import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePrivateAiConfig } from "../../server/private-ai-provider";
const mock = vi.hoisted(() => ({ bearer:vi.fn(), rpc:vi.fn(), env:vi.fn() }));
vi.mock("../../server/municipal-storage.js",()=>({
  readBearer:mock.bearer, callDataApiRpc:mock.rpc, readEnv:mock.env,
}));
import handler from "../../api/ai-assistant";

async function request() {
  let payload:Record<string,unknown>={};
  const req={method:"POST",headers:{host:"sigapromunicipal.com.br"},
    body:{messages:[{role:"user",content:"Como emitir um alvará?"}]}};
  const res={statusCode:200,setHeader:vi.fn(),end:vi.fn((s:string)=>{payload=JSON.parse(s);})};
  await handler(req as never,res as never);
  return {status:res.statusCode,payload};
}
const token="a".repeat(48);
const config={gatewayUrl:"https://ia.sigapromunicipal.com.br",gatewayToken:token,model:"Qwen/Qwen3.5-9B"};
beforeEach(()=>{
  vi.resetAllMocks();
  mock.env.mockImplementation((name:string)=>({
    SIGAPRO_AI_PROVIDER:"private",SIGAPRO_AI_GATEWAY_URL:config.gatewayUrl,
    SIGAPRO_AI_GATEWAY_TOKEN:config.gatewayToken,SIGAPRO_AI_MODEL:config.model,
  } as Record<string,string>)[name]||"");
  mock.bearer.mockReturnValue("valid-session-jwt");
  mock.rpc.mockResolvedValue({ok:true,status:200,payload:{
    profile_id:"00000000-0000-4000-8000-000000000001",account_status:"active",deleted_at:null,
  }});
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
describe("SIGAPRO IA privada — ativação segura e compatibilidade",()=>{
  it("aceita somente gateway HTTPS com domínio e token de serviço",()=>{
    expect(resolvePrivateAiConfig(config)?.endpoint).toBe("https://ia.sigapromunicipal.com.br/v1/chat/completions");
    for(const bad of [
      "http://ia.sigapromunicipal.com.br","http://127.0.0.1:8000",
      "https://127.0.0.1","https://localhost","https://10.0.0.2",
      "https://ia.internal","https://ia.local","https://user:pass@ia.sigapromunicipal.com.br",
      "https://ia.sigapromunicipal.com.br/attacker",
      "https://ia.sigapromunicipal.com.br?token=leak",
      "https://ia.sigapromunicipal.com.br:8443",
    ]) expect(resolvePrivateAiConfig({...config,gatewayUrl:bad})).toBeNull();
    expect(resolvePrivateAiConfig({...config,gatewayToken:"inseguro"})).toBeNull();
    expect(resolvePrivateAiConfig({...config,model:"../ unsafe model"})).toBeNull();
  });
  it("usa apenas o gateway privado configurado no servidor e não exige OPENAI_API_KEY",async()=>{
    const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({
      choices:[{message:{content:"Conferir o checklist municipal."}}],model:config.model,
    })});
    vi.stubGlobal("fetch",fetchMock);
    const result=await request();
    expect(result.status).toBe(200);
    expect(result.payload.message).toBe("Conferir o checklist municipal.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint,options]=fetchMock.mock.calls[0];
    expect(endpoint).toBe("https://ia.sigapromunicipal.com.br/v1/chat/completions");
    expect(options.redirect).toBe("error");
    expect(options.headers.Authorization).toBe(`Bearer ${token}`);
    const body=JSON.parse(options.body);
    expect(body.model).toBe(config.model);
    expect(body.messages.at(-1)).toEqual({role:"user",content:"Como emitir um alvará?"});
    expect(mock.rpc).toHaveBeenCalledWith(expect.anything(),"get_current_profile_context",{});
  });
  it("bloqueia a IA privada sem configuração, sem acessar OpenAI nem gateway",async()=>{
    mock.env.mockImplementation((name:string)=>name==="SIGAPRO_AI_PROVIDER"?"private":"");
    const fetchMock=vi.fn(); vi.stubGlobal("fetch",fetchMock);
    const result=await request();
    expect(result.status).toBe(503);
    expect(result.payload.code).toBe("SIGAPRO_PRIVATE_AI_NOT_CONFIGURED");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("não faz fallback para OpenAI quando a IA privada estiver indisponível",async()=>{
    vi.stubGlobal("fetch",vi.fn().mockRejectedValue(new Error("gateway offline")));
    const result=await request();
    expect(result.status).toBe(504);
    expect(result.payload.error).not.toContain(token);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
  it("não envia prompts para nenhum provedor sem sessão válida",async()=>{
    mock.bearer.mockReturnValue("");
    const fetchMock=vi.fn(); vi.stubGlobal("fetch",fetchMock);
    const result=await request();
    expect(result.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("mantém modo antigo inalterado quando provedor não é configurado",async()=>{
    mock.env.mockReturnValue("");
    const result=await request();
    expect(result.status).toBe(503);
    expect(result.payload.code).toBe("SIGAPRO_AI_NOT_CONFIGURED");
  });
});
