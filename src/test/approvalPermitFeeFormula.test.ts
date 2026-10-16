import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateApprovalGuideBreakdown,
  calculateApprovalGuideAmount,
  type TenantSettings,
} from "@/lib/platform";

describe("guia de aprovação e Alvará", () => {
  const settings = {
    taxaAprovacaoFinal: 0,
    approvalAliquotPercent: 5,
    approvalRateProfiles: [
      {
        id: "residencial-medio",
        label: "Residencial • Médio",
        usage: "Residencial",
        standard: "medio",
        rate: 114.6,
        permitFee: 160.84,
      },
    ],
  } as TenantSettings;

  it("reproduz o exemplo oficial: m² × referência × 5% + taxa fixa do Alvará", () => {
    const result = calculateApprovalGuideBreakdown(
      257.3,
      "Residencial",
      "medio",
      settings,
    );

    expect(result.baseValueM2).toBe(114.6);
    expect(result.aliquotPercent).toBe(5);
    expect(result.licenseUnitValue).toBe(5.73);
    expect(result.licenseAmount).toBe(1474.33);
    expect(result.permitFee).toBe(160.84);
    expect(result.totalAmount).toBe(1635.17);
    expect(calculateApprovalGuideAmount(257.3, "Residencial", "medio", settings)).toBe(
      1635.17,
    );
  });

  it("mantém Habite-se fora do workflow financeiro do Alvará", () => {
    const financeDesk = readFileSync(
      resolve(process.cwd(), "src/pages/saas/FinanceDeskPage.tsx"),
      "utf8",
    );
    const financeProtocols = readFileSync(
      resolve(process.cwd(), "src/pages/saas/FinanceProtocolsPage.tsx"),
      "utf8",
    );

    expect(financeDesk).toContain("Guia de aprovação / Alvará");
    expect(financeDesk).toContain("Habite-se não participa deste fluxo");
    expect(financeDesk).not.toContain("label: `Habite-se ${profile.label}`");
    expect(financeProtocols).toContain('return "Aprovação / Alvará"');
  });

  it("mantém a mesma fórmula no cálculo oficial do banco", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "neon/migrations/20261016_approval_alvara_fee_formula.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("approval_aliquot_percent");
    expect(migration).toContain("_permit_fee + (_area * _rate * (_aliquot / 100.0))");
    expect(migration).toContain("O Habite-se NÃO é calculado nem emitido por esta função");
  });
});
