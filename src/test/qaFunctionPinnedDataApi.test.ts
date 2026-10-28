import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const source=readFileSync("functions/sigaproqa/index.js","utf8");
const start=source.indexOf("async function rpc(token,name,args={})");
const end=source.indexOf("function validKey(",start);
const workerRpc=source.slice(start,end);
describe("QA storage worker pinned tenant-scoped Neon Data API",()=>{
 it("uses the confirmed isolated QA database, not an inherited env var",()=>{
   expect(workerRpc).toContain("https://ep-misty-breeze-b4ri8ig0.apirest.c-6.us-east-2.aws.neon.tech/sigapro_migration_stage_20260923/rest/v1");
   expect(workerRpc).toContain('fetch(qaDataApi+"/rpc/"+name');
   expect(workerRpc).not.toContain("process.env.NEON_DATA_API_URL");
   expect(workerRpc).not.toContain("ep-blue-cloud");
 });
 it("preserves caller JWT, tenant scope and denies unauthorized guide uploads",()=>{
   expect(workerRpc).toContain('Authorization:"Bearer "+token');
   expect(source).toContain('rpc(token,"has_tenant_access"');
   expect(source).toContain('rpc(token,"authorize_payment_guide_original_upload_v2"');
   expect(source).toContain('rpc(token,"authorize_payment_guide_original_read_v1"');
   expect(source).toContain('QA_TENANT_SCOPE_REJECTED');
   expect(source).toContain("QA_DAM_UPLOAD_POLICY_REJECTED");
 });
});