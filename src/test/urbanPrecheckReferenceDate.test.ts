import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isValidUrbanReferenceDate } from "@/lib/urbanPrecheckAssist";

describe("SIGAPRO — vigência da legislação urbanística", () => {
  const today = "2026-10-23";
  it("aceita datas reais de referência anteriores ou iguais à data atual", () => {
    expect(isValidUrbanReferenceDate("2024-02-29", today)).toBe(true);
    expect(isValidUrbanReferenceDate(today, today)).toBe(true);
  });
  it("bloqueia a seleção da norma quando a data da análise não é válida", () => {
    const panel = readFileSync(resolve(process.cwd(), "src/components/platform/UrbanPrecheckPanel.tsx"), "utf8");
    expect(panel).toContain("isValidUrbanReferenceDate(asOf, urbanMunicipalToday())");
  });
  it("rejeita dias inexistentes, datas futuras e formatos inválidos", () => {
    for (const date of ["2026-02-29", "2026-02-31", "2026-13-01", "2026-00-01",
      "2026-10-24", "2026-1-2", "1899-12-31", ""]) {
      expect(isValidUrbanReferenceDate(date, today), date).toBe(false);
    }
  });
});
