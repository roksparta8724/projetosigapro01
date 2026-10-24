import { describe, expect, it } from "vitest";
import { selectUrbanRegulation, type UrbanRegulationVersion } from "@/lib/urbanPrecheck";

const version: UrbanRegulationVersion = {
  id: "rule-a", municipality_id: "A", zone_code: "ZR", use_code: "RES",
  effective_from: "2020-01-01", version: 1, status: "active",
  rules: [{ metric: "front_setback_m", limit: 5, reference: "Lei municipal fictícia nº 123/2020" }],
  created_at: "2020-01-01T00:00:00Z",
};
const select = (date: string) => selectUrbanRegulation([version], "A", "ZR", "RES", date);

describe("SIGAPRO — validação de data civil na seleção legal", () => {
  it.each(["2026-02-30", "2025-02-29", "2026-13-01", "2026-00-01", "2026-04-31", "2026-1-01", "1899-12-31"])("ignora data civil inválida %s", date => {
    expect(select(date)).toBeNull();
  });
  it("admite 29 de fevereiro de ano bissexto", () => {
    expect(select("2024-02-29")?.id).toBe("rule-a");
  });
  it("mantém consulta de vigência para data normal", () => {
    expect(select("2026-10-24")?.id).toBe("rule-a");
  });
});
