import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { evaluateUrbanPrecheck,selectUrbanRegulation,validateUrbanRules } from "@/lib/urbanPrecheck";
describe("SIGAPRO IA: official database precheck contract and human-only decision",()=>{
  it("requires authenticated legal evidence and the secure Neon v6 writer, never legacy RPCs",()=>{
    const client=readFileSync("src/integrations/backend/urbanPrecheckClient.ts","utf8");
    const panel=readFileSync("src/components/platform/UrbanPrecheckPanel.tsx","utf8");
    expect(client).toContain('"save_urban_precheck_run_v6"');
    expect(client).not.toContain('invoke("save_urban_precheck_run_v5"');
    expect(client).not.toContain('invoke("save_urban_precheck_run_v4"');
    expect(client).not.toContain('invoke("save_urban_precheck_run_v1"');
    expect(client).toContain("_request_id: requestId");
    expect(client).toContain("_reference_date: referenceDate");
    expect(client).toContain("document_scope_confirmed: true");
    expect(panel).toContain('data-urban-precheck-legal-review="true"');
    expect(panel).toContain("legalScopesReady && legalReviewConfirmed");
    expect(panel).toContain("evidenceCoversUrbanRule");
    expect(panel).toContain("Registro legado sem comprovação jurídica completa");
    expect(panel).toContain("crypto.randomUUID()");
    expect(panel).toContain("idempotencyRef.current?.snapshot===snapshot");
    expect(panel).toContain("idempotencyRef.current={snapshot,id:requestId}");
    expect(panel).toContain("Nunca aprova automaticamente");
  });
  it("uses the actual assigned-analyst panel and active municipal legal rules",()=>{
    const detail=readFileSync("src/pages/saas/ProcessDetailPage.tsx","utf8");
    const settings=readFileSync("src/pages/saas/ConfiguracoesPage.tsx","utf8");
    expect(detail).toContain("<UrbanPrecheckPanel");
    expect(detail).toContain("readOnly={!canEditAnalysisChecklist}");
    expect(settings).toContain("<MunicipalUrbanRulesSettings");
  });
  it("cannot claim compliance without an activated regulation and referenced measurement",()=>{
    const rule=[{metric:"front_setback_m" as const,limit:5,reference:"Lei 2026/10 art. 4"}];
    expect(validateUrbanRules(rule)).toBe(true);
    expect(evaluateUrbanPrecheck(rule,{front_setback_m:{value:7,evidence:""}})[0].status).toBe("missing_evidence");
    expect(selectUrbanRegulation([],"municipality","ZR1","RESIDENCIAL","2026-10-29")).toBeNull();
  });
});
