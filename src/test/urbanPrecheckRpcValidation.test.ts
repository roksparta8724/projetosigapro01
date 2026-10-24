import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("SIGAPRO — controle de qualidade antes de gravar pré-análise", () => {
  const source=readFileSync(resolve(process.cwd(),"src/integrations/backend/urbanPrecheckClient.ts"),"utf8");
  it("verifica métricas conhecidas, resultado numérico finito e documento de origem", () => {
    expect(source).toContain("validMetrics.has(metric)");
    expect(source).toContain("Number.isFinite(entry.value)");
    expect(source).toContain("entry.evidence.trim().length < 3");
    expect(source).toContain('metric === "floor_count" && !Number.isInteger(entry.value)');
  });
  it("rejeita revisões legais duplicadas ou inválidas antes de chamar RPC", () => {
    expect(source).toContain("new Set(legalReview.evidenceIds).size !== legalReview.evidenceIds.length");
    expect(source).toContain('typeof legalReview.documentScopeConfirmed !== "boolean"');
    expect(source.indexOf("const entries = Object.entries(measurements)")).toBeLessThan(source.indexOf('await invoke("save_urban_precheck_run_v4"'));
  });
});
