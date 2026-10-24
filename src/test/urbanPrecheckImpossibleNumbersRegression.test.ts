import { describe, expect, it } from "vitest";
import { evaluateUrbanPrecheck, type UrbanMetric, type UrbanRule } from "@/lib/urbanPrecheck";

const rule = (metric: UrbanMetric, limit: number): UrbanRule[] => [
  { metric, limit, reference: "Lei Municipal de teste 123/2026 art. 12" },
];
const checked = (metric: UrbanMetric, limit: number, value: number) =>
  evaluateUrbanPrecheck(rule(metric, limit), { [metric]: { value, evidence: "Prancha 2 — medição conferida" } })[0];

describe("SIGAPRO — valores fisicamente inválidos na pré-conferência consultiva", () => {
  it.each([
    ["permeability_percent", 20, 120],
    ["occupancy_percent", 70, 101],
    ["front_setback_m", 5, 100001],
    ["floor_count", 4, 2.5],
  ] as const)("não classifica %s=%s como conforme quando a medida é inválida", (metric, limit, value) => {
    const result = checked(metric, limit, value);
    expect(result.status).toBe("missing_evidence");
    expect(result.observed).toBeNull();
  });

  it("mantém a avaliação consultiva normal para número válido com prova", () => {
    expect(checked("permeability_percent", 20, 35).status).toBe("within_limit");
    expect(checked("front_setback_m", 5, 4).status).toBe("attention");
  });
});
