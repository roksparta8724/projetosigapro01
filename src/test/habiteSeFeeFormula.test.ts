import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateHabiteSeGuideBreakdown,
  type TenantSettings,
} from "@/lib/platform";

describe("taxa do Habite-se por area e acabamento", () => {
  const settings = {
    taxaProtocolo: 35.24,
    taxaIssPorMetroQuadrado: 0,
    taxaAprovacaoFinal: 0,
    approvalAliquotPercent: 5,
    approvalRateProfiles: [
      {
        id: "residencial-luxo",
        label: "Residencial • Luxo",
        usage: "Residencial",
        standard: "luxo",
        rate: 547.2,
      },
      {
        id: "residencial-primeira",
        label: "Residencial • Primeira",
        usage: "Residencial",
        standard: "primeira",
        rate: 444.6,
      },
      {
        id: "residencial-medio",
        label: "Residencial • Médio",
        usage: "Residencial",
        standard: "medio",
        rate: 342,
      },
      {
        id: "residencial-economico",
        label: "Residencial • Econômico",
        usage: "Residencial",
        standard: "economico",
        rate: 239.4,
      },
    ],
    registroProfissionalObrigatorio: true,
  } as TenantSettings;

  it("calcula area x referencia do acabamento x 5%, sem taxa fixa de Alvara", () => {
    const result = calculateHabiteSeGuideBreakdown(
      250,
      "Residencial",
      "medio",
      settings,
    );

    expect(result.profile?.id).toBe("residencial-medio");
    expect(result.areaM2).toBe(250);
    expect(result.baseValueM2).toBe(342);
    expect(result.aliquotPercent).toBe(5);
    expect(result.unitFee).toBe(17.1);
    expect(result.totalAmount).toBe(4275);
  });

  it("respeita os quatro acabamentos oficiais residenciais", () => {
    expect(calculateHabiteSeGuideBreakdown(100, "Residencial", "luxo", settings).totalAmount).toBe(2736);
    expect(calculateHabiteSeGuideBreakdown(100, "Residencial", "primeira", settings).totalAmount).toBe(2223);
    expect(calculateHabiteSeGuideBreakdown(100, "Residencial", "medio", settings).totalAmount).toBe(1710);
    expect(calculateHabiteSeGuideBreakdown(100, "Residencial", "economico", settings).totalAmount).toBe(1197);
  });

  it("nao inventa valor quando o acabamento nao existe na tabela", () => {
    const result = calculateHabiteSeGuideBreakdown(
      250,
      "Residencial",
      "inexistente",
      settings,
    );

    expect(result.profile).toBeNull();
    expect(result.baseValueM2).toBe(0);
    expect(result.totalAmount).toBe(0);
  });

  it("a tela usa area automatica, exige apenas o acabamento e remove digitacao manual do valor", () => {
    const processDetail = readFileSync(
      resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"),
      "utf8",
    );

    expect(processDetail).toContain("calculateHabiteSeGuideBreakdown");
    expect(processDetail).toContain("Área do imóvel");
    expect(processDetail).toContain("Automática do cadastro do protocolo");
    expect(processDetail).toContain("Tipo de acabamento");
    expect(processDetail).toContain("Memória de cálculo");
    expect(processDetail).toContain("valor final é recalculado no banco");
    expect(processDetail).not.toContain("habiteSeFeeAmountInput");
    expect(processDetail).not.toContain("Valor oficial da taxa de Habite-se");
  });

  it("o frontend envia somente acabamento e o banco recalcula o valor oficial", () => {
    const platformImpl = readFileSync(
      resolve(process.cwd(), "src/integrations/backend/platformImpl.ts"),
      "utf8",
    );
    const dataHook = readFileSync(
      resolve(process.cwd(), "src/hooks/usePlatformData.tsx"),
      "utf8",
    );
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "neon/migrations/20261018_habite_se_fee_formula.sql",
      ),
      "utf8",
    );

    expect(platformImpl).toContain('callProcessRpc("issue_habite_se_payment_guide_v2"');
    expect(platformImpl).toContain("_construction_standard: input.constructionStandard.trim()");
    expect(dataHook).toContain("constructionStandard: normalizedStandard");
    expect(migration).toContain("_official_amount := round(_area_m2 * _rate * (_aliquot / 100.0),2)");
    expect(migration).toContain("area_m2_snapshot,usage_snapshot,construction_standard_snapshot");
    expect(migration).toContain("set construction_standard=_normalized_standard");
    expect(migration).not.toContain("_amount numeric");
  });
});
