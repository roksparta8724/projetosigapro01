import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nextUrbanReadinessAction } from "@/lib/urbanReadinessNextStep";
import type { UrbanReadinessCheck, UrbanReadinessSummary } from "@/lib/urbanAiReadiness";

function check(code: string, passed = false): UrbanReadinessCheck {
  return { code, title: code, detail: "Conferência", quadro: code === "quadro-i" ? "I" : code === "quadro-ii" ? "II" : null, passed };
}
const documented = {
  reading: { total: 23, verified: 22, needsCorrection: 1, untreated: 0 },
  checks: [
    check("pdf", true), check("registry", true), check("quadro-i"),
    check("quadro-ii"), check("imports"), check("evidence"), check("active"),
  ],
} satisfies Pick<UrbanReadinessSummary, "reading" | "checks">;

describe("SIGAPRO QA — depois de cadastrar LC 379/2009, avançar sem repetir Quadro I", () => {
  it("recomenda o Quadro II se os 23 registros já foram tratados com ressalva", () => {
    const next = nextUrbanReadinessAction(documented);
    expect(next?.code).toBe("quadro-ii");
    expect(documented.checks.find(item => item.code === "quadro-i")?.passed).toBe(false);
  });

  it("prioriza cadastrar lei enquanto ainda não está no acervo", () => {
    const before = {
      ...documented, checks: documented.checks.map(item =>
        item.code === "registry" ? { ...item, passed: false } : item),
    };
    expect(nextUrbanReadinessAction(before)?.code).toBe("registry");
  });

  it("mantém a conferência no Quadro I se houver linhas realmente sem revisão", () => {
    const untreated = {
      ...documented,
      reading: { total: 23, verified: 21, needsCorrection: 1, untreated: 1 },
    };
    expect(nextUrbanReadinessAction(untreated)?.code).toBe("quadro-i");
  });

  it("não direciona novamente para a mesma ressalva quando só há validação legal pendente", () => {
    const onlyCaveat = {
      ...documented, checks: documented.checks.map(item =>
        item.code === "quadro-i" ? item : { ...item, passed: true }),
    };
    expect(nextUrbanReadinessAction(onlyCaveat)).toBeNull();
  });

  it("preserva detalhes e impede uma lista vertical interminável", () => {
    const panel = readFileSync("src/components/platform/UrbanAiReadinessPanel.tsx", "utf8");
    const matrix = readFileSync("src/components/platform/UrbanLegalMatrixReviewPanel.tsx", "utf8");
    expect(panel).toContain("nextUrbanReadinessAction(report)");
    expect(panel).toContain('data-urban-readiness-all-checks="true"');
    expect(panel).toContain("openNextStep(NEXT_ACTIONS[recommended.code].target)");
    expect(matrix).toContain('data-urban-matrix-rows-viewport="true"');
    expect(matrix).toContain("max-h-[65vh]");
    expect(matrix).toContain("overscroll-contain");
    expect(matrix).toContain("role dentro desta lista");
    expect(matrix).toContain("CA mínimo provisório");
  });
});
