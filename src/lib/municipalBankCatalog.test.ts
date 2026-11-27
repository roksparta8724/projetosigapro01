import { describe, expect, it } from "vitest";
import { describeMunicipalBankChannel, findMunicipalBank, MUNICIPAL_BANK_DIRECTORY, selectMunicipalBank } from "./municipalBankCatalog";

describe("municipal banks are tenant-configurable, never fake adapters", () => {
  it("includes commonly used institutions and keeps leading zeroes", () => {
    expect(findMunicipalBank("001")?.name).toBe("Banco do Brasil");
    expect(findMunicipalBank("033")?.name).toBe("Santander");
    expect(findMunicipalBank("104")?.name).toMatch(/Caixa/);
    expect(findMunicipalBank("748")?.name).toBe("Sicredi");
    expect(findMunicipalBank("756")?.name).toBe("Sicoob");
    expect(new Set(MUNICIPAL_BANK_DIRECTORY.map(({ code }) => code)).size).toBe(MUNICIPAL_BANK_DIRECTORY.length);
  });

  it("does not replace the previous bank when choosing a custom institution", () => {
    const prev = { bankCode: "999", bankName: "Banco municipal contratado" };
    expect(selectMunicipalBank(prev, "other")).toBe(prev);
    expect(selectMunicipalBank(prev, "999")).toBe(prev);
    expect(selectMunicipalBank(prev, "001")).toEqual({ bankCode: "001", bankName: "Banco do Brasil" });
  });

  it.each(["manual", "agreement", "api"] as const)(
    "never claims %s is automatically integrated without an adapter", (mode) => {
      const channel = describeMunicipalBankChannel(mode);
      expect(channel.automaticIssue).toBe(false);
      expect(channel.automaticSettlement).toBe(false);
      expect(channel.explanation).toMatch(/oficial|homolog|não existe|não emite/i);
    },
  );
});
