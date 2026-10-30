import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
import { summarizeUrbanLegalReadiness } from "../../server/urban-legal-readiness";
const stub = vi.hoisted(() => ({ bearer:vi.fn(),rpc:vi.fn() }));
vi.mock("../../server/municipal-storage.js",()=>({
  readBearer:stub.bearer,callDataApiRpc:stub.rpc,
}));
import handler from "../../api/ai-legal-readiness";

const tenant = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const profile = "33333333-3333-4333-8333-333333333333";
const evidenceId = "44444444-4444-4444-8444-444444444444";
const rules = [{ municipality_id:tenant, status:"active", effective_from:"2025-01-01", zone_code:"Z1",
  use_code:"R", rules:[{metric:"front_setback_m",limit:5,reference:"Lei municipal 100/2025, artigo 11"}] }];
const evidence = [{ municipality_id:tenant,evidence_id:evidenceId,document_title:"Lei Municipal 100/2025",
  document_sha256:"a".repeat(64),page_number:3,metric:"front_setback_m",
  excerpt:"Recuo frontal mínimo de cinco metros.",zone_code:"Z1",use_code:"R",
  effective_from:"2025-01-01",effective_until:null,verification_method:"text_layer_verified" }];
async function run(options:{method?:string;origin?:string;authorization?:string}={}) {
  let result:Record<string,unknown>={};
  const req={method:options.method||"GET",
    headers:{host:"sigapromunicipal.com.br",...(options.origin?{origin:options.origin}:{})}};
  const res={statusCode:200,setHeader:vi.fn(),end:vi.fn((raw:string)=>{result=JSON.parse(raw)})};
  stub.bearer.mockReturnValue(options.authorization ?? "valid-jwt");
  await handler(req as never,res as never);
  return {status:res.statusCode,result,headers:res.setHeader};
}
beforeEach(()=>{
  vi.resetAllMocks();
  stub.bearer.mockReturnValue("valid-jwt");
  stub.rpc.mockImplementation(async (_req:unknown,fn:string,args:Record<string,unknown>)=>{
    if(fn==="get_current_profile_context")return {ok:true,status:200,payload:{
      profile_id:profile,account_status:"active",deleted_at:null,is_master:false,
      municipality_id:tenant,tenant_id:tenant,
    }};
    if(fn==="list_urban_regulation_versions_v1")return {ok:true,status:200,payload:rules};
    if(fn==="list_urban_legal_evidence_v2")return {ok:true,status:200,payload:evidence};
    return {ok:false,status:404,payload:null};
  });
});
afterEach(()=>vi.restoreAllMocks());
describe("SIGAPRO — municipal legal readiness is tenant-scoped and read-only",()=>{
  it("returns verified human-review evidence with legal references, never an automatic approval",async()=>{
    const r=await run();
    expect(r.status).toBe(200);
    expect(r.result.readiness).toBe("manual_review_available");
    expect(r.result.activeRegulations).toBe(1);
    expect(r.result.scopedVerifiedEvidence).toBe(1);
    expect(r.result.automatedCompliance).toBe(false);
    expect(r.result.cloudflareTransmission).toBe(false);
    expect(r.result.citedEvidence).toEqual([expect.objectContaining({title:"Lei Municipal 100/2025",page:3})]);
    expect(stub.rpc).toHaveBeenCalledWith(expect.anything(),"list_urban_legal_evidence_v2",
      {_municipality_id:tenant});
    expect(r.headers).toHaveBeenCalledWith("Cache-Control","private, no-store");
  });
  it("never accepts a browser-selected tenant or sends legal context to the LLM",async()=>{
    const r=await run();
    expect(r.status).toBe(200);
    expect(stub.rpc).toHaveBeenCalledWith(expect.anything(),"list_urban_regulation_versions_v1",
      {_municipality_id:tenant});
    expect(stub.rpc).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(r.result)).not.toContain(other);
  });
  it("blocks missing JWT and cross-origin requests before database calls",async()=>{
    expect((await run({authorization:""})).status).toBe(401);
    expect((await run({origin:"https://evil.example"})).status).toBe(403);
    expect(stub.rpc).not.toHaveBeenCalled();
  });
  it("rejects other HTTP methods",async()=>{
    expect((await run({method:"POST"})).status).toBe(405);
    expect(stub.rpc).not.toHaveBeenCalled();
  });
  it("blocks profiles with no official municipal scope, master or suspended status",async()=>{
    for(const changes of [
      {municipality_id:null},{tenant_id:other},{account_status:"suspended"},
      {is_master:true},{profile_id:"bad"},{deleted_at:"2026-01-01"},
    ]) {
      stub.rpc.mockResolvedValueOnce({ok:true,status:200,payload:{
        profile_id:profile,account_status:"active",deleted_at:null,is_master:false,
        municipality_id:tenant,tenant_id:tenant,...changes,
      }});
      expect((await run()).status).toBe(403);
    }
  });
  it("does not reveal draft laws or another city's evidence, even if backend mixes records",()=>{
    const answer=summarizeUrbanLegalReadiness([
      {...rules[0],status:"draft"}, {...rules[0],municipality_id:other},
    ],[evidence[0],{...evidence[0],municipality_id:other}],tenant,"2026-10-29");
    expect(answer.activeRegulations).toBe(0);
    expect(answer.scopedVerifiedEvidence).toBe(1);
    expect(answer.readiness).toBe("missing_regulations");
    expect(answer.citedEvidence).toHaveLength(1);
  });
  it("filters expired and unverified evidence and future legal effective dates",()=>{
    const answer=summarizeUrbanLegalReadiness(rules,[
      {...evidence[0],verification_method:"unconfirmed"},
      {...evidence[0],effective_until:"2025-01-01"},
      {...evidence[0],effective_from:"2027-01-01"},
    ],tenant,"2026-10-29");
    expect(answer.scopedVerifiedEvidence).toBe(0);
    expect(answer.readiness).toBe("missing_evidence");
  });
  it("reports empty official municipal catalogs without inventing legal compliance",()=>{
    const answer=summarizeUrbanLegalReadiness([],[],tenant,"2026-10-29");
    expect(answer.readiness).toBe("missing_regulations");
    expect(answer.citedEvidence).toEqual([]);
    expect(answer.activeRegulations).toBe(0);
  });
  it("fails closed if official RPCs reject external roles or return malformed data",async()=>{
    stub.rpc.mockImplementation(async (_req:unknown,fn:string)=>{
      if(fn==="get_current_profile_context")return {ok:true,status:200,payload:{
        profile_id:profile,account_status:"active",municipality_id:tenant,tenant_id:tenant,is_master:false,
      }};
      if(fn==="list_urban_regulation_versions_v1")return {ok:false,status:403,payload:null};
      return {ok:true,status:200,payload:[]};
    });
    expect((await run()).status).toBe(403);
    stub.rpc.mockImplementation(async (_req:unknown,fn:string)=>{
      if(fn==="get_current_profile_context")return {ok:true,status:200,payload:{
        profile_id:profile,account_status:"active",municipality_id:tenant,tenant_id:tenant,is_master:false,
      }};
      return {ok:true,status:200,payload:null};
    });
    expect((await run()).status).toBe(503);
  });
});
