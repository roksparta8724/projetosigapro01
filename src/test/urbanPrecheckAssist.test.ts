import { describe, expect, it } from "vitest";
import { buildUrbanReviewDraft, deriveUrbanAreaMeasurements } from "@/lib/urbanPrecheckAssist";
import { evaluateUrbanPrecheck, selectUrbanRegulation, type UrbanRegulationVersion } from "@/lib/urbanPrecheck";

describe("SIGAPRO urbanismo — cálculos auditáveis", () => {
  it("calcula índices de área com evidência, mantendo precisão antes de comparar", () => {
    const result = deriveUrbanAreaMeasurements({
      lot: { value: 250, evidence: "Matrícula e implantação" },
      footprint: { value: 150.001, evidence: "Prancha A1" },
      permeable: { value: 75, evidence: "Quadro de áreas A1" },
      totalFloor: { value: 375, evidence: "Quadro de áreas A2" },
    });
    expect(result.warnings).toHaveLength(0);
    expect(result.measurements.occupancy_percent?.value).toBeCloseTo(60.0004, 8);
    expect(result.measurements.permeability_percent?.value).toBe(30);
    expect(result.measurements.floor_area_ratio?.value).toBe(1.5);
    expect(result.measurements.occupancy_percent?.evidence).toContain("Prancha A1");
    const check = evaluateUrbanPrecheck([
      { metric: "occupancy_percent", limit: 60, reference: "Lei hipotética art. 12" },
    ], result.measurements);
    expect(check[0].status).toBe("attention");
  });
  it("rejeita área do terreno sem prova, números irreais e valores ausentes", () => {
    expect(deriveUrbanAreaMeasurements({
      lot: { value: 250, evidence: "" },
      footprint: { value: 150, evidence: "Prancha 01" },
    }).measurements).toEqual({});
    const invalid = deriveUrbanAreaMeasurements({
      lot: { value: 200, evidence: "Prancha A1" },
      footprint: { value: 300, evidence: "Prancha A1" },
      permeable: { value: NaN, evidence: "Prancha A2" },
    });
    expect(invalid.measurements).toEqual({});
    expect(invalid.warnings).toHaveLength(2);
  });
  it("produz minuta apenas para alertas, nunca parecer ou Comunique-se oficial", () => {
    const results = evaluateUrbanPrecheck([
      { metric: "front_setback_m", limit: 5, reference: "Lei hipotética art. 11" },
      { metric: "rear_setback_m", limit: 3, reference: "Lei hipotética art. 12" },
    ], {
      front_setback_m: { value: 4.5, evidence: "Prancha de implantação" },
      rear_setback_m: { value: 3.2, evidence: "Prancha de implantação" },
    });
    const draft = buildUrbanReviewDraft("QA-001", "ZR1", "RESIDENCIAL", 2, results);
    expect(draft).toContain("MINUTA INTERNA");
    expect(draft).toContain("Recuo frontal");
    expect(draft).toContain("Lei hipotética art. 11");
    expect(draft).not.toContain("Recuo de fundos");
    expect(draft).toContain("não constitui notificação");
    expect(buildUrbanReviewDraft("QA-001", "ZR1", "RESIDENCIAL", 2, results.filter(x => x.status !== "attention"))).toBe("");
  });
  it("preserva norma histórica após substituição e bloqueia rascunhos", () => {
    const rule = [{ metric: "front_setback_m" as const, limit: 5, reference: "Lei hipotética art. 11" }];
    const a: UrbanRegulationVersion = {
      id: "antiga", municipality_id: "tenant-QA", zone_code: "ZR1", use_code: "RESIDENCIAL",
      effective_from: "2025-01-01", version: 1, status: "superseded", rules: rule,
      created_at: "2025-01-01T00:00:00Z",
    };
    const b: UrbanRegulationVersion = {
      ...a, id: "nova", status: "active", effective_from: "2026-01-01", version: 2,
    };
    const c: UrbanRegulationVersion = { ...b, id: "draft", status: "draft", version: 3 };
    expect(selectUrbanRegulation([a,b,c], "tenant-QA", "ZR1", "RESIDENCIAL", "2025-10-23")?.id).toBe("antiga");
    expect(selectUrbanRegulation([a,b,c], "tenant-QA", "ZR1", "RESIDENCIAL", "2026-10-23")?.id).toBe("nova");
    expect(selectUrbanRegulation([a,b,c], "outro-tenant", "ZR1", "RESIDENCIAL", "2025-10-23")).toBeNull();
    expect(selectUrbanRegulation([a,b,c], "tenant-QA", "ZR2", "RESIDENCIAL", "2025-10-23")).toBeNull();
  });
});
