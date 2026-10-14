import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getProcessRegistrationIssues, validateBrazilianTaxId } from "@/lib/processIdentityValidation";
import type { ProcessRecord } from "@/lib/platform";

describe("municipal process identity and data quality", () => {
  it("does not mistake masked CPF/CNPJ for a complete official record", () => {
    expect(validateBrazilianTaxId("***6659")).toBe("incompleto");
    expect(validateBrazilianTaxId("***.401.218-**")).toBe("incompleto");
    expect(validateBrazilianTaxId("")).toBe("ausente");
    expect(validateBrazilianTaxId("123.456.789-00")).toBe("formato_invalido");
  });

  it("validates CPF and CNPJ check digits without asserting government registration", () => {
    expect(validateBrazilianTaxId("529.982.247-25")).toBe("formato_valido");
    expect(validateBrazilianTaxId("04.252.011/0001-10")).toBe("formato_valido");
    expect(validateBrazilianTaxId("11.111.111/1111-11")).toBe("formato_invalido");
  });

  it("calls out missing cadastral fields instead of silently leaving blank cards", () => {
    const mock = {
      ownerName: "Proprietário de teste",
      ownerDocument: "***6659",
      technicalLead: "Profissional de teste",
      address: "",
      property: { iptu: "", registration: "", usage: "", area: 0 },
    } as ProcessRecord;
    const issues = getProcessRegistrationIssues(mock, false);
    expect(issues).toEqual(expect.arrayContaining([
      expect.stringContaining("CPF/CNPJ"),
      expect.stringContaining("Registro do conselho"),
      expect.stringContaining("IPTU"),
      expect.stringContaining("Uso da edificação"),
      expect.stringContaining("Área do imóvel"),
    ]));
  });

  it("renders the role-scoped identity panel without exposing masked document labels", () => {
    const page = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
    const identity = readFileSync(resolve(process.cwd(), "src/components/platform/ProcessIdentityPanel.tsx"), "utf8");
    expect(page).toContain("canViewFullIdentity={canViewCompleteCadastro}");
    expect(page).toContain("officialMunicipalityLabel");
    expect(page).not.toContain("Documento mascarado:");
    expect(identity).toContain("getProcessRegistrationIssues");
    expect(identity).toContain("Acesso restrito à equipe autorizada");
  });
});
