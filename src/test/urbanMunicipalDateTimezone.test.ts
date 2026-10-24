import { describe, expect, it } from "vitest";
import { urbanMunicipalToday, isValidUrbanReferenceDate } from "@/lib/urbanPrecheckAssist";

describe("SIGAPRO — data civil da prefeitura", () => {
  it("não antecipa amanhã quando o UTC já passou da meia-noite", () => {
    const instant = new Date("2026-10-24T00:30:00.000Z");
    expect(instant.toISOString().slice(0,10)).toBe("2026-10-24");
    expect(urbanMunicipalToday(instant)).toBe("2026-10-23");
    expect(isValidUrbanReferenceDate("2026-10-24",urbanMunicipalToday(instant))).toBe(false);
  });
  it("avança a data somente à meia-noite local em São Paulo", () => {
    expect(urbanMunicipalToday(new Date("2026-10-24T02:59:59.000Z"))).toBe("2026-10-23");
    expect(urbanMunicipalToday(new Date("2026-10-24T03:00:00.000Z"))).toBe("2026-10-24");
  });
});
