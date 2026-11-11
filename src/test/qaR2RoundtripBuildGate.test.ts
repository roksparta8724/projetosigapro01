import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";
const script=readFileSync("scripts/qa-r2-roundtrip.mjs","utf8");
describe("R2 QA live-byte roundtrip release gate",()=>{
 it("restricts live writes to isolated Vercel preview branch",()=>{
   expect(script).toContain('env.VERCEL_ENV==="preview"');
   expect(script).toContain('git==="fix/qa-triagem-analise-pagamento-20261101"');
   expect(script).toContain('env.VITE_SIGAPRO_NEON_ISOLATED==="true"');
   expect(script).toContain('!String(env.VITE_NEON_DATA_API_URL||"").includes("blue-cloud")');
   expect(script).toContain('"NOT_VERIFIED_CONFIG"');
 });
 it("proves real R2 PDF bytes, metadata, SHA and deletion",()=>{
   for(const s of ["PutObjectCommand","HeadObjectCommand","GetObjectCommand",
     "DeleteObjectCommand","hashR2Stream","R2_HEAD_MISMATCH","R2_BYTES_MISMATCH",
     "R2_QA_OBJECT_NOT_DELETED","IfNoneMatch:\"*\"","sigapro-qa-e2e-disposable/"])
     expect(script).toContain(s);
   expect(script).toContain("finally");
   expect(script).toContain("SIGAPRO_QA_R2_ROUNDTRIP ");
 });
 it("does not accept missing credentials or storage failure as a pass",()=>{
   expect(script).toContain('if(readiness!=="READY")return readiness');
   expect(script).toContain('if(status.startsWith("FAIL"))process.exitCode=2');
   expect(script).toContain("FAIL_CLEANUP");
 });
});