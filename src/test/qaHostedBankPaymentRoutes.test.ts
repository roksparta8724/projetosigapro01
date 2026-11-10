import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
import {isIsolatedQaBankRuntime} from "../../server/qa-hosted-bank-guard";
const read=(p:string)=>readFileSync(p,"utf8");

const valid={
  VERCEL_ENV:"preview",
  VERCEL_GIT_COMMIT_REF:"fix/qa-triagem-analise-pagamento-20261101",
  VITE_SIGAPRO_NEON_ISOLATED:"true",
  SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL:
    "postgresql://sigapro_qa_webhook_worker:x@ep-misty-breeze-b4ri8ig0.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923?sslmode=require",
  VITE_NEON_DATA_API_URL:
    "https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/rest/v1",
};
describe("SIGAPRO QA real provider TEST without production leakage",()=>{
  it("allows the exact hosted Preview with an independently matching QA Neon endpoint",()=>{
    expect(isIsolatedQaBankRuntime(valid)).toBe(true);
    expect(isIsolatedQaBankRuntime({
      SIGAPRO_LOCAL_QA_LAUNCH:"true",SIGAPRO_LOCAL_QA_BLOCK_EXTERNAL_WRITES:"true",
      VITE_SIGAPRO_NEON_ISOLATED:"true",
    })).toBe(true);
  });
  it("rejects main, production, wrong Neon endpoint, non-isolated and unknown preview",()=>{
    for(const variant of [
      {VERCEL_ENV:"production"},
      {VERCEL_GIT_COMMIT_REF:"main"},
      {VITE_SIGAPRO_NEON_ISOLATED:"false"},
      {SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL:"postgresql://qa@ep-blue-cloud.c-6.us-east-2.aws.neon.tech/other"},
      {VITE_NEON_DATA_API_URL:"https://ep-blue-cloud.apirest.c-6.us-east-2.aws.neon.tech/rest/v1"},
    ])expect(isIsolatedQaBankRuntime({...valid,...variant})).toBe(false);
  });
  it("publishes BOTH sandbox routes without adding any new Vercel function",()=>{
    const config=JSON.parse(read("vercel.json")) as {rewrites:Array<{source:string,destination:string}>};
    expect(config.rewrites).toContainEqual({
      source:"/api/qa/mercadopago/guide-boleto",
      destination:"/api/mercadopago?action=qa-boleto",
    });
    expect(config.rewrites).toContainEqual({
      source:"/api/qa/mercadopago/guide-pix",
      destination:"/api/mercadopago?action=qa-pix",
    });
    const api=read("api/mercadopago.ts");
    expect(api).toContain('action === "qa-boleto"');
    expect(api).toContain('action === "qa-pix"');
    expect(api).toContain('assertIsolatedQaBankRuntime()');
    expect(api).toContain("sandboxOnly:true");
  });
  it("PIX on Vercel uses durable QA Neon order receipts, not ephemeral home files",()=>{
    const code=read("server/qa-mercadopago-pix.ts");
    expect(code).toContain("qaMpWebhookDatabaseUrl()");
    expect(code).toContain("assertQaWorkerLeastPrivilege(db)");
    expect(code).toContain("public.qa_pix_sandbox_order_v1");
    expect(code).toContain('const hosted=process.env.VERCEL_ENV==="preview"');
    expect(code).toContain('hosted?"":pathFor');
    expect(code).toContain('"reserve"');
    expect(code).toContain('"record"');
    expect(code).toContain("qaPixIdempotencyKey(");
  });
  it("QA SQL workers cannot directly query financial records or replace bank order",()=>{
    const sql=read("neon/migrations/20261110_qa_hosted_pix_orders_durable_v1.sql");
    expect(sql).toContain("session_user NOT IN ('sigapro_qa_webhook_worker','neondb_owner')");
    expect(sql).toContain("REVOKE ALL ON TABLE public.qa_pix_sandbox_orders_v1 FROM authenticated");
    expect(sql).toContain("ON CONFLICT(guide_id) DO NOTHING");
    expect(sql).toContain("rec.bank_order_id IS NOT NULL AND rec.bank_order_id IS DISTINCT FROM _order_id");
    expect(sql).toContain("g.provider_environment IS DISTINCT FROM 'test'");
    expect(sql).toContain("g.collection_mode_snapshot IS DISTINCT FROM 'sigapro'");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.qa_pix_sandbox_order_v1");
  });
  it("live server still requires explicit production activation and payer data",()=>{
    const code=read("server/mercadopago.ts");
    expect(code).toContain("assertIsolatedQaBankRuntime()");
    expect(code).toContain("assertProductionBankIssueAllowed(stored || undefined)");
    expect(code).toContain("buildProductionBoletoPayer(stored!,input.payer)");
  });
});
