import { describe, expect, it } from "vitest";
import { evaluateUrbanPrecheck, selectUrbanRegulation, type UrbanRegulationVersion } from "@/lib/urbanPrecheck";

const rule = (limit: number) => [{ metric: "front_setback_m" as const, limit, reference: "Lei Municipal 123/2020, art. 10" }];
const versions: UrbanRegulationVersion[] = [
  { id: "a-old", municipality_id: "A", zone_code: "ZR1", use_code: "RES", effective_from: "2020-01-01", version: 1, status: "superseded", rules: rule(4), created_at: "2020-01-01T00:00:00Z" },
  { id: "a-new", municipality_id: "A", zone_code: "ZR1", use_code: "RES", effective_from: "2026-01-01", version: 2, status: "active", rules: rule(5), created_at: "2026-01-01T00:00:00Z" },
  { id: "a-draft", municipality_id: "A", zone_code: "ZR1", use_code: "RES", effective_from: "2025-01-01", version: 3, status: "draft", rules: rule(3), created_at: "2025-01-01T00:00:00Z" },
  { id: "b-rule", municipality_id: "B", zone_code: "ZR1", use_code: "RES", effective_from: "2020-01-01", version: 1, status: "active", rules: rule(8), created_at: "2020-01-01T00:00:00Z" },
];

describe("SIGAPRO — legislação aplicável por prefeitura e data", () => {
  it("seleciona versão histórica substituída para data anterior à nova vigência", () => {
    expect(selectUrbanRegulation(versions, "A", "zr1", "res", "2025-06-20")?.id).toBe("a-old");
  });
  it("seleciona a versão vigente na data mais recente", () => {
    expect(selectUrbanRegulation(versions, "A", "ZR1", "RES", "2026-10-24")?.id).toBe("a-new");
  });
  it("não mistura regras de prefeituras com mesmo zoneamento", () => {
    expect(selectUrbanRegulation(versions, "B", "ZR1", "RES", "2026-10-24")?.id).toBe("b-rule");
    expect(selectUrbanRegulation(versions, "C", "ZR1", "RES", "2026-10-24")).toBeNull();
  });
  it("não considera versões em rascunho nem futuras", () => {
    expect(selectUrbanRegulation(versions, "A", "ZR1", "RES", "2019-12-31")).toBeNull();
    expect(selectUrbanRegulation(versions.filter(v => v.status === "draft"), "A", "ZR1", "RES", "2026-10-24")).toBeNull();
  });
  it("não confunde número com prova documental de conformidade", () => {
    const results = evaluateUrbanPrecheck(rule(5), { front_setback_m: { value: 6, evidence: " " } });
    expect(results[0].status).toBe("missing_evidence");
  });
  it("identifica desconformidade numérica sem autorizar aprovação", () => {
    const results = evaluateUrbanPrecheck(rule(5), { front_setback_m: { value: 4, evidence: "Prancha 2 — cota frontal" } });
    expect(results[0].status).toBe("attention");
  });
});
