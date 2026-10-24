import { describe, expect, it } from "vitest";
import { isValidUrbanReferenceDate } from "@/lib/urbanPrecheckAssist";

describe("SIGAPRO — vigência da legislação urbanística", () => {
  const today = "2026-10-23";
  it("aceita datas reais de referência anteriores ou iguais à data atual", () => {
    expect(isValidUrbanReferenceDate("2024-02-29", today)).toBe(true);
    expect(isValidUrbanReferenceDate(today, today)).toBe(true);
  });
  it("rejeita dias inexistentes, datas futuras e formatos inválidos", () => {
    for (const date of ["2026-02-29", "2026-02-31", "2026-13-01", "2026-00-01",
      "2026-10-24", "2026-1-2", "1899-12-31", ""]) {
      expect(isValidUrbanReferenceDate(date, today), date).toBe(false);
    }
  });
});
