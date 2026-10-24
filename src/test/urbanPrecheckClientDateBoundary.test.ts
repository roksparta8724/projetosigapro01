import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isValidUrbanReferenceDate } from "@/lib/urbanPrecheckAssist";

describe("SIGAPRO — datas na fronteira do banco municipal", () => {
  it("rejeita data inválida ou futura em registro de pré-análise", () => {
    const source = readFileSync(resolve(process.cwd(), "src/integrations/backend/urbanPrecheckClient.ts"), "utf8");
    expect(source).toContain('isValidUrbanReferenceDate(referenceDate, urbanMunicipalToday())');
    expect(isValidUrbanReferenceDate("2026-02-30", "2026-10-23")).toBe(false);
    expect(isValidUrbanReferenceDate("2026-10-24", "2026-10-23")).toBe(false);
  });
  it("permite cadastrar minuta de norma com vigência futura válida", () => {
    const source = readFileSync(resolve(process.cwd(), "src/integrations/backend/urbanPrecheckClient.ts"), "utf8");
    expect(source).toContain('isValidUrbanReferenceDate(effectiveFrom, "9999-12-31")');
    expect(isValidUrbanReferenceDate("2027-02-28", "9999-12-31")).toBe(true);
    expect(isValidUrbanReferenceDate("2027-02-29", "9999-12-31")).toBe(false);
  });
});
