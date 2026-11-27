import {describe,it,expect} from "vitest";
import {currentQaPreview,CURRENT_QA_BRANCH} from "./qa-runtime-scope";
import {qaBenchmarkEnabled} from "./qa-architectural-benchmark";
import {isQaMpWebhookEnvironment,qaMpWebhookDatabaseUrl} from "./mp-qa-webhook";
import {isIsolatedQaBankRuntime} from "./qa-hosted-bank-guard";
const valid={VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:CURRENT_QA_BRANCH,VITE_SIGAPRO_NEON_ISOLATED:"true",
 VITE_NEON_DATA_API_URL:"https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1",
 SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL:"postgresql://sigapro_qa_webhook_worker:dummy@ep-misty-breeze-b4ri8ig0.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923?sslmode=require"};
describe("current SIGAPRO QA branch isolation",()=>{
 it("restores QA benchmark, webhook and sandbox route only on the exact current branch and endpoint",()=>{
  expect(currentQaPreview(valid)).toBe(true);
  expect(qaBenchmarkEnabled(valid)).toBe(true);
  expect(isQaMpWebhookEnvironment(valid)).toBe(true);
  expect(isIsolatedQaBankRuntime(valid)).toBe(true);
  expect(new URL(qaMpWebhookDatabaseUrl(valid)).searchParams.get("sslmode")).toBe("verify-full");
 });
 it("does not accept other QA projects, production, spoofed hosts or missing isolation",()=>{
  for(const v of [
   {...valid,VERCEL_ENV:"production"},{...valid,VERCEL_GIT_COMMIT_REF:"main"},
   {...valid,VITE_SIGAPRO_NEON_ISOLATED:"false"},
   {...valid,VITE_NEON_DATA_API_URL:valid.VITE_NEON_DATA_API_URL.replace("misty-breeze-b4ri8ig0","blue-cloud-b4hhgb4t")},
   {...valid,VITE_NEON_DATA_API_URL:valid.VITE_NEON_DATA_API_URL.replace(".neon.tech",".neon.tech.evil.example")},
   {...valid,VITE_NEON_DATA_API_URL:valid.VITE_NEON_DATA_API_URL.replace("/sigapro_migration_stage_20260923/","/other/")},
  ]){
   expect(currentQaPreview(v)).toBe(false);expect(qaBenchmarkEnabled(v)).toBe(false);
   expect(isQaMpWebhookEnvironment(v)).toBe(false);expect(isIsolatedQaBankRuntime(v)).toBe(false);
  }
 });
 it("requires a restricted worker even on a valid preview",()=>{
  const v={...valid,SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL:""};
  expect(qaBenchmarkEnabled(v)).toBe(true);
  expect(isIsolatedQaBankRuntime(v)).toBe(false);
  expect(()=>qaMpWebhookDatabaseUrl(v)).toThrow("QA_WORKER_DATABASE_NOT_CONFIGURED");
  expect(isIsolatedQaBankRuntime({...valid,SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL:valid.SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL+"&options=-c%20role%3Dneondb_owner"})).toBe(false);
 });
});
