import {describe,expect,it,vi,afterEach} from "vitest";
import type {IncomingMessage,ServerResponse} from "node:http";
import {readFileSync} from "node:fs";
import handleQaMpWebhook,{
  isQaMpWebhookEnvironment,qaMpWebhookDatabaseUrl,shouldAttemptQaSettlement,
} from "./mp-qa-webhook";
import {
  assertQaWorkerLeastPrivilege,qaWorkerHasLeastPrivilege,
  MP_QA_WORKER_ROLE,MP_WORKER_PRIVILEGE_AUDIT_SQL,
  type MpWorkerPrivilegeEvidence,
} from "./mp-webhook-worker-privilege";

const QA="fix/qa-triagem-analise-pagamento-20261101";
const env={
  VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:QA,
  SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL:
    "postgresql://sigapro_qa_webhook_worker:TEST_PLACEHOLDER_NOT_REAL@"+
    "ep-misty-breeze-b4ri8ig0.c-6.us-east-2.aws.neon.tech/"+
    "sigapro_migration_stage_20260923?sslmode=require",
};
const safe:MpWorkerPrivilegeEvidence={
  role_name:MP_QA_WORKER_ROLE,bypass_rls:false,superuser:false,
  admin_membership:false,profiles_update:false,document_delete:false,
  sensitive_table_access:false,sensitive_column_access:false,direct_financial_write:false,
};
afterEach(()=>vi.unstubAllEnvs());

describe("SIGAPRO — callback Mercado Pago no sandbox, nunca no banco PROD",()=>{
  it("exige Vercel Preview da branch exata, sem fallback em producao",()=>{
    expect(isQaMpWebhookEnvironment(env)).toBe(true);
    expect(isQaMpWebhookEnvironment({...env,VERCEL_ENV:"production"})).toBe(false);
    expect(isQaMpWebhookEnvironment({...env,VERCEL_GIT_COMMIT_REF:"main"})).toBe(false);
    expect(isQaMpWebhookEnvironment({...env,VERCEL_GIT_COMMIT_REF:"other"})).toBe(false);
    expect(()=>qaMpWebhookDatabaseUrl({...env,VERCEL_ENV:"production"}))
      .toThrow("QA_PREVIEW_BRANCH_REQUIRED");
    expect(()=>qaMpWebhookDatabaseUrl({...env,VERCEL_GIT_COMMIT_REF:"main"}))
      .toThrow("QA_PREVIEW_BRANCH_REQUIRED");
  });
  it("pina host, usuario, banco e SSL verificado ao Neon QA correto",()=>{
    const url=new URL(qaMpWebhookDatabaseUrl(env));
    expect(url.hostname).toBe("ep-misty-breeze-b4ri8ig0.c-6.us-east-2.aws.neon.tech");
    expect(url.username).toBe("sigapro_qa_webhook_worker");
    expect(url.pathname).toBe("/sigapro_migration_stage_20260923");
    expect(url.searchParams.get("sslmode")).toBe("verify-full");
    expect(()=>qaMpWebhookDatabaseUrl({...env,SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL:""}))
      .toThrow("QA_WORKER_DATABASE_NOT_CONFIGURED");
    for(const wrong of [
      env.SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL.replace(
        "sigapro_qa_webhook_worker","sigapro_prod_webhook_worker"),
      env.SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL.replace(
        "ep-misty-breeze-b4ri8ig0","ep-blue-cloud-b4hhgb4t"),
      env.SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL.replace(
        "sigapro_migration_stage_20260923","neondb"),
      env.SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL.replace("sslmode=require","sslmode=disable"),
      env.SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL+"&options=-c%20role%3Dneondb_owner",
    ])expect(()=>qaMpWebhookDatabaseUrl({...env,SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL:wrong}))
      .toThrow("QA_WORKER_DATABASE_BRANCH_OR_ROLE_MISMATCH");
  });
  it("comprova auditoria de minimo privilegio NA conexao do worker especifico",async()=>{
    expect(qaWorkerHasLeastPrivilege(safe)).toBe(true);
    expect(qaWorkerHasLeastPrivilege({...safe,role_name:"sigapro_prod_webhook_worker"})).toBe(false);
    expect(qaWorkerHasLeastPrivilege({...safe,bypass_rls:true})).toBe(false);
    expect(qaWorkerHasLeastPrivilege({...safe,admin_membership:true})).toBe(false);
    expect(qaWorkerHasLeastPrivilege({...safe,direct_financial_write:true})).toBe(false);
    expect(qaWorkerHasLeastPrivilege({...safe,sensitive_column_access:undefined})).toBe(false);
    expect(qaWorkerHasLeastPrivilege(null)).toBe(false);
    const db={query:vi.fn().mockResolvedValue({rows:[safe]})};
    await expect(assertQaWorkerLeastPrivilege(db)).resolves.toBeUndefined();
    expect(db.query).toHaveBeenCalledWith(MP_WORKER_PRIVILEGE_AUDIT_SQL,[]);
    db.query.mockResolvedValue({rows:[{...safe,bypass_rls:true}]});
    await expect(assertQaWorkerLeastPrivilege(db)).rejects
      .toThrow("QA_WORKER_EXCESSIVE_PRIVILEGES");
  });
  it("sem prova de recibo ou credito nao chama a RPC que marca como pago",()=>{
    const ok={
      status:"verified_manual_review",accredited:true,
      paymentId:"PAYMENT_12345",receiptId:"10000000-0000-4000-8000-000000000001",
    };
    expect(shouldAttemptQaSettlement(ok)).toBe(true);
    expect(shouldAttemptQaSettlement({...ok,accredited:false})).toBe(false);
    expect(shouldAttemptQaSettlement({...ok,receiptId:"invalid"})).toBe(false);
    expect(shouldAttemptQaSettlement({...ok,paymentId:""})).toBe(false);
    expect(shouldAttemptQaSettlement({...ok,status:"bank_fetch_failed"})).toBe(false);
    expect(shouldAttemptQaSettlement({...ok,status:"unmatched_manual_review"})).toBe(false);
  });
  it("o codigo verifica HMAC, credencial municipal, provedor GET e ORIGINAL antes da baixa",()=>{
    const handler=readFileSync("server/mp-qa-webhook.ts","utf8");
    const route=readFileSync("api/mercadopago.ts","utf8");
    const vercel=JSON.parse(readFileSync("vercel.json","utf8")) as {
      rewrites: Array<{source:string;destination:string}>;
    };
    expect(route).toContain('if (action === "qa-webhook")');
    expect(route).toContain("return handleQaMpWebhook(req, res);");
    expect(vercel.rewrites).toContainEqual({
      source:"/api/mp-qa-webhook",
      destination:"/api/mercadopago?action=qa-webhook",
    });
    expect(handler).toContain("notice.live_mode!==false");
    expect(handler).toContain("verifyMercadoPagoOrderWebhook");
    expect(handler).toContain("fetchMunicipalMpOrder(signed.orderId,auth.token)");
    expect(handler).toContain("mp_qa_webhook_ingest_v1");
    expect(handler).toContain("mp_qa_webhook_settle_v1");
    expect(handler.indexOf("await assertQaWorkerLeastPrivilege(db);"))
      .toBeLessThan(handler.indexOf("return await task(db);"));
    expect(handler).not.toContain("SIGAPRO_PROD_MP_WEBHOOK_DATABASE_URL");
    expect(handler).not.toContain("neondb_owner");
    expect(handler).toContain('outcome.status==="awaiting_original_pdf"?503:200');
    const sql=readFileSync("server/mp-qa-webhook.ts","utf8");
    expect(sql).toContain("observation.paidAmount??null");
    expect(sql).toContain("observation.transactionPaidAmount??null");
  });
});

function mockResponse(){
  const headers:Record<string,string>={};
  let payload="";
  const res={
    statusCode:200,
    setHeader(key:string,value:string){headers[key]=value;},
    end(text:string){payload=text;},
  } as unknown as ServerResponse;
  return {res,headers,body:()=>JSON.parse(payload) as Record<string,unknown>};
}
describe("SIGAPRO — roteamento publico fail-closed",()=>{
  it("bloqueia callback em production antes de qualquer uso de credencial",async()=>{
    vi.stubEnv("VERCEL_ENV","production");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF","main");
    const {res,body}=mockResponse();
    await handleQaMpWebhook({method:"POST",headers:{}} as IncomingMessage,res);
    expect(res.statusCode).toBe(503);
    expect(body().code).toBe("QA_PREVIEW_ONLY");
  });
  it("na QA oferece saude sem expor acesso e bloqueia POST sem assinatura",async()=>{
    vi.stubEnv("VERCEL_ENV","preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF",QA);
    vi.stubEnv("SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL","");
    const health=mockResponse();
    await handleQaMpWebhook({method:"GET",headers:{}} as IncomingMessage,health.res);
    expect(health.res.statusCode).toBe(200);
    expect(health.body().configured).toBe(false);
    const reject=mockResponse();
    await handleQaMpWebhook({
      method:"POST",headers:{},
      url:"/api/mp-qa-webhook?municipality_id=00000000-0000-4000-8000-000000000001",
    } as IncomingMessage,reject.res);
    expect(reject.res.statusCode).toBe(401);
    expect(reject.body().code).toBe("INVALID_WEBHOOK_HEADER");
  });
});
