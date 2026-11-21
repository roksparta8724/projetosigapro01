import {test} from "node:test";
import assert from "node:assert/strict";
import {inspectVisualProviderEnvironment} from "./qa-visual-provider-config.mjs";
const qa={
 VERCEL_ENV:"preview",
 VERCEL_GIT_COMMIT_REF:"fix/qa-triagem-analise-pagamento-20261101",
 SIGAPRO_QA_MP_WEBHOOK_DATABASE_URL:"postgres://dummy:dummy@ep-misty-breeze-b4ri8ig0.c-6.us-east-2.aws.neon.tech/qa",
 VITE_NEON_DATA_API_URL:"https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/rest/v1",
 SIGAPRO_AI_PDF_PROVIDER:"claude",SIGAPRO_AI_PDF_ENABLED:"true",
};
test("visual inference never reported proved without an actual provider request",()=>{
 const unconfigured=inspectVisualProviderEnvironment(qa);
 assert.equal(unconfigured.status,"EXTERNAL_VISUAL_NOT_CONFIGURED");
 assert.equal(unconfigured.localPdfTextAvailable,true);
 assert.equal(unconfigured.visualInferenceProved,false);
 const configured=inspectVisualProviderEnvironment({...qa,
    ANTHROPIC_API_KEY:"test-only-key-not-a-real-secret"});
 assert.equal(configured.status,"CONFIGURED_NOT_PROVEN");
 assert.equal(configured.externalVisualConfigured,true);
 assert.equal(configured.visualInferenceProved,false);
});
test("does not mistake text-only Cloudflare for visual PDF approval",()=>{
 const r=inspectVisualProviderEnvironment({...qa,SIGAPRO_AI_PDF_PROVIDER:"cloudflare",
   SIGAPRO_CF_API_TOKEN:"test-only-token-not-a-real-secret",
   SIGAPRO_CF_ACCOUNT_ID:"a".repeat(32)});
 assert.equal(r.cloudflareTextConfigured,true);
 assert.equal(r.externalVisualConfigured,false);
 assert.equal(r.visualInferenceProved,false);
});
test("reject production, unrelated branch or mismatched Neon API",()=>{
 for(const change of [{VERCEL_ENV:"production"},{VERCEL_GIT_COMMIT_REF:"main"},
   {VITE_NEON_DATA_API_URL:"https://ep-other.apirest.c-6.us-east-2.aws.neon.tech/rest/v1"}]){
   assert.deepEqual(inspectVisualProviderEnvironment({...qa,...change}),{
     status:"NOT_VERIFIED_QA_SCOPE"});
 }
});
