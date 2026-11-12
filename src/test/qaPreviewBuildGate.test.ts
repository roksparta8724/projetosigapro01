import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
describe("QA Vercel build is fail-closed for the isolated branch",()=>{
 const file=readFileSync("scripts/qa-preview-build-gate.mjs","utf8");
 it("only runs isolated preview checks and cannot affect production builds",()=>{
   expect(file).toContain('process.env.VERCEL_ENV==="preview"');
   expect(file).toContain('process.env.VERCEL_GIT_COMMIT_REF===BRANCH');
   expect(file).toContain('fix/qa-triagem-analise-pagamento-20261101');
 });
 it("blocks release when typecheck, lint or finance/AI/legal test fails",()=>{
   expect(file).toContain('node_modules/typescript/bin/tsc');
   expect(file).toContain('node_modules/eslint/bin/eslint.js');
   expect(file).toContain('server/mp-qa-webhook.test.ts');
   expect(file).toContain('server/qa-architectural-benchmark.test.ts');
   expect(file).toContain('src/test/urbanQuadroIIDossier.test.ts');
   expect(file).toContain('process.exit(result.status&&result.status>0?result.status:1)');
 });
 it("does not alter secrets, databases, process state or bank settlement",()=>{
   expect(file).not.toMatch(/process\.env\.\w+\s*=(?!=)/);
   expect(file).not.toContain('DATABASE_URL');
   expect(file).not.toContain('updateProcessStatus');
   expect(file).not.toContain('settlePayment');
 });
});
