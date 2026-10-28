import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const w=readFileSync("functions/sigaproqa/index.js","utf8");
describe("QA document worker authorization diagnosis",()=>{
 it("keeps scoped exact tenant and DAM upload policy",()=>{
  for(const part of ['authorize_payment_guide_original_upload_v2','authorize_payment_guide_original_read_v1',
   'scope.type==="dam-original"','if(membership!==true)','scope.originalSha','if-none-match'])
   expect(w).toContain(part);
 });
 it("logs fixed denial stages only",()=>{
  for(const part of ["QA_AUTH_RPC_REJECTED",
   "QA_TENANT_SCOPE_REJECTED","QA_DAM_UPLOAD_POLICY_REJECTED"])
   expect(w).toContain(part);
  expect(w).not.toContain("console.warn(token");
  expect(w).not.toContain("console.warn(args");
  expect(w).not.toContain("console.warn(scope.tenant");
 });
});