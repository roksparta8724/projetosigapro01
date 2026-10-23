import { describe, expect, it } from "vitest";
import {
  evaluateUrbanPrecheck, normalizeUrbanCode, selectUrbanRegulation, validateUrbanRules,
  type UrbanRegulationVersion,
} from "@/lib/urbanPrecheck";

const rules = [
  { metric: "front_setback_m" as const, limit: 5, reference: "Lei hipotética 01, art. 12" },
  { metric: "occupancy_percent" as const, limit: 60, reference: "Lei hipotética 01, art. 13" },
];
const regulation: UrbanRegulationVersion = {
  id: "v1", municipality_id: "municipio-A", zone_code: "ZR1", use_code: "RESIDENCIAL",
  version: 1, status: "active", effective_from: "2026-01-01",
  rules, created_at: "2026-01-01T00:00:00Z",
};
describe("SIGAPRO urbanismo: pré-conferência informativa, sem aprovação automática", () => {
  it("aplica limites mínimos e máximos, com evidência", () => {
    const result = evaluateUrbanPrecheck(rules, {
      front_setback_m: { value: 4.5, evidence: "Prancha 01, cota 04" },
      occupancy_percent: { value: 59.5, evidence: "Quadro de áreas, prancha 02" },
    });
    expect(result.map((x) => x.status)).toEqual(["attention", "within_limit"]);
  });
  it("não marca conformidade sem documento/cota citados", () => {
    expect(evaluateUrbanPrecheck(rules, { front_setback_m: { value: 6, evidence: "" } })[0].status)
      .toBe("missing_evidence");
    expect(evaluateUrbanPrecheck(rules, {})[1].status).toBe("missing_evidence");
  });
  it("não importa legislação de outra prefeitura, outra zona ou outra vigência", () => {
    expect(selectUrbanRegulation([regulation], "municipio-B", "ZR1", "RESIDENCIAL", "2026-10-23")).toBeNull();
    expect(selectUrbanRegulation([regulation], "municipio-A", "ZC", "RESIDENCIAL", "2026-10-23")).toBeNull();
    expect(selectUrbanRegulation([regulation], "municipio-A", "ZR1", "RESIDENCIAL", "2025-01-01")).toBeNull();
    expect(selectUrbanRegulation([regulation], "municipio-A", " zr1 ", "residencial", "2026-10-23")?.id).toBe("v1");
    expect(normalizeUrbanCode(" zr1 ")).toBe("ZR1");
  });
  it("rejeita regra sem artigo, métrica duplicada ou percentual inválido", () => {
    expect(validateUrbanRules([{ metric: "front_setback_m", limit: 5, reference: "" }])).toBe(false);
    expect(validateUrbanRules([...rules, rules[0]])).toBe(false);
    expect(validateUrbanRules([{ metric: "occupancy_percent", limit: 120, reference: "Lei hipotética 01" }])).toBe(false);
  });
  it("não aceita rascunho como norma vigente", () => {
    expect(selectUrbanRegulation([{ ...regulation, status: "draft" }], "municipio-A", "ZR1", "RESIDENCIAL", "2026-10-23")).toBeNull();
  });
});
