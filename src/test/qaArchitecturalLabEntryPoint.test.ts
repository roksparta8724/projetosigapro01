import { describe,expect,it } from "vitest";
import {readFileSync} from "node:fs";
describe("SIGAPRO QA: isolated PDF laboratory is reachable outside process analysis",()=>{
 it("shows the lab on analyst overview, without requiring a process in technical analysis",()=>{
  const view=readFileSync("src/pages/saas/AnalystDeskPage.tsx","utf8");
  expect(view).toContain('import { QaArchitecturalLab } from "@/components/platform/QaArchitecturalLab"');
  expect(view).toContain('section === "visao-geral"');
  expect(view).toContain('<QaArchitecturalLab municipalityId={effectiveScopeId} />');
  expect(view).toContain('session.role==="analista"||session.role==="prefeitura_supervisor"');
  expect(view).toContain('import.meta.env.VITE_SIGAPRO_NEON_ISOLATED==="true"');
  // The legitimate queue still uses the paid/triaged process guard independently.
  const registry=readFileSync("src/lib/analysisRegistry.ts","utf8");
  expect(registry).toContain(".filter(isProcessReleasedToUrbanAnalysis)");
 });
 it("uses no process identifier for test and preserves server-side auth",()=>{
  const lab=readFileSync("src/components/platform/QaArchitecturalLab.tsx","utf8");
  const handler=readFileSync("server/qa-architectural-benchmark.ts","utf8");
  expect(lab).toContain('body:"{}"');
  expect(lab).not.toContain("onApply(");
  expect(handler).toContain('get_current_profile_context');
  expect(handler).toContain('env.VERCEL_ENV');
  expect(handler).toContain('readBearer(req)');
  expect(handler).not.toContain("updateProcessStatus");
 });
});
