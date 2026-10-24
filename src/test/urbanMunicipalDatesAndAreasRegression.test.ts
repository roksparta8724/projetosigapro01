import { describe, expect, it } from "vitest";
import { deriveUrbanAreaMeasurements, isValidUrbanReferenceDate, urbanMunicipalToday, mergeDerivedUrbanFields } from "@/lib/urbanPrecheckAssist";

const area = (value: number, evidence = "Prancha 01 — quadro de áreas") => ({ value, evidence });

describe("SIGAPRO — datas municipais e cálculo de áreas documentadas", () => {
  it("usa o dia civil de São Paulo, não o dia UTC", () => {
    expect(urbanMunicipalToday(new Date("2026-10-24T01:30:00.000Z"))).toBe("2026-10-23");
    expect(urbanMunicipalToday(new Date("2026-10-24T13:30:00.000Z"))).toBe("2026-10-24");
  });
  it.each(["2026-02-30", "2025-02-29", "2026-13-01", "2026-00-20", "2026-10-25", "1899-12-31", "2026-1-2"])("recusa a data inválida ou futura %s", value => {
    expect(isValidUrbanReferenceDate(value, "2026-10-24")).toBe(false);
  });
  it("aceita o dia 29 de fevereiro de ano bissexto", () => {
    expect(isValidUrbanReferenceDate("2024-02-29", "2026-10-24")).toBe(true);
  });
  it("calcula ocupação, permeabilidade e coeficiente sem arredondamento prematuro", () => {
    const result = deriveUrbanAreaMeasurements({ lot: area(300), footprint: area(120), permeable: area(90), totalFloor: area(420) });
    expect(result.warnings).toEqual([]);
    expect(result.measurements.occupancy_percent?.value).toBe(40);
    expect(result.measurements.permeability_percent?.value).toBe(30);
    expect(result.measurements.floor_area_ratio?.value).toBe(1.4);
    expect(result.measurements.occupancy_percent?.evidence).toContain("Prancha 01");
  });
  it("não calcula percentuais com terreno zero nem aceita projeção maior que o terreno", () => {
    const zero = deriveUrbanAreaMeasurements({ lot: area(0), footprint: area(100) });
    expect(Object.keys(zero.measurements)).toHaveLength(0);
    expect(zero.warnings.length).toBeGreaterThan(0);
    const oversized = deriveUrbanAreaMeasurements({ lot: area(100), footprint: area(120) });
    expect(oversized.measurements.occupancy_percent).toBeUndefined();
    expect(oversized.warnings.length).toBeGreaterThan(0);
  });
  it("preserva valores e evidências inseridos manualmente pelo analista", () => {
    const existing = { occupancy_percent: { value: "42", evidence: "Análise humana — prancha revisada" } };
    const merged = mergeDerivedUrbanFields(existing, [["occupancy_percent", { value: 40, evidence: "Cálculo automático documentado" }]]);
    expect(merged).toEqual(existing);
    expect(merged).not.toBe(existing);
  });
});
