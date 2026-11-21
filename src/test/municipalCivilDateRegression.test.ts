import { describe, expect, it } from "vitest";
import { municipalCivilDate, municipalCivilDateFromValue } from "@/lib/municipalCivilDate";

describe("SIGAPRO — municipal legal reference date does not use UTC cutoff", () => {
  it("retains October 29 until local midnight in Campo Limpo Paulista", () => {
    expect(municipalCivilDate(new Date("2026-10-30T02:06:00.000Z")))
      .toBe("2026-10-29");
    expect(municipalCivilDate(new Date("2026-10-30T03:00:00.000Z")))
      .toBe("2026-10-30");
  });
  it("handles Brazilian cities with other verified IANA time zones", () => {
    const now = new Date("2026-10-30T03:30:00.000Z");
    expect(municipalCivilDate(now, "America/Sao_Paulo")).toBe("2026-10-30");
    expect(municipalCivilDate(now, "America/Manaus")).toBe("2026-10-29");
  });
  it("converts timestamped protocol officialization to municipal civil day", () => {
    expect(municipalCivilDateFromValue("2026-10-30T02:30:00Z"))
      .toBe("2026-10-29");
    expect(municipalCivilDateFromValue("2026-10-29"))
      .toBe("2026-10-29");
  });
  it("rejects invalid date objects instead of inventing a legal reference", () => {
    expect(() => municipalCivilDate(new Date("invalid"))).toThrow(/Data de referência inválida/);
  });
});
