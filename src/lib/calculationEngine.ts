import { type CalculationContext, type CalculationResult, type MunicipalFeeRule } from "@/lib/govtech";

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

export function evaluateMunicipalFeeRules(rules: MunicipalFeeRule[], context: CalculationContext): CalculationResult {
  const lines = rules.flatMap((rule) => {
    if (rule.processType && rule.processType !== context.processType) {
      return [];
    }

    if (rule.professionalCategory && rule.professionalCategory !== context.professionalCategory) {
      return [];
    }

    if (rule.constructionStandard && rule.constructionStandard !== context.constructionStandard) {
      return [];
    }

    switch (rule.kind) {
      case "fixed":
        return [
          {
            id: rule.id,
            code: rule.code,
            label: rule.label,
            amount: roundCurrency(rule.amount ?? 0),
            explanation: "Valor fixo aplicado pela prefeitura.",
          },
        ];
      case "per_square_meter":
        return [
          {
            id: rule.id,
            code: rule.code,
            label: rule.label,
            amount: roundCurrency((rule.rate ?? 0) * context.builtArea),
            explanation: `Calculo por metragem: ${context.builtArea} m2 x ${rule.rate ?? 0}.`,
          },
        ];
      case "percentage":
        return [
          {
            id: rule.id,
            code: rule.code,
            label: rule.label,
            amount: roundCurrency((context.baseValue ?? 0) * (rule.rate ?? 0)),
            explanation: `Aplicacao percentual sobre base de calculo ${context.baseValue ?? 0}.`,
          },
        ];
      case "tiered_square_meter": {
        const tier = (rule.tiers ?? []).find((item) => {
          const min = item.minArea ?? 0;
          const max = item.maxArea ?? Number.POSITIVE_INFINITY;
          return context.builtArea >= min && context.builtArea <= max;
        });

        if (!tier) return [];

        if (tier.fixedAmount !== undefined) {
          return [
            {
              id: `${rule.id}-tier-fixed`,
              code: rule.code,
              label: rule.label,
              amount: roundCurrency(tier.fixedAmount),
              explanation: `Faixa de metragem aplicada de ${tier.minArea ?? 0} ate ${tier.maxArea ?? "livre"} m2.`,
            },
          ];
        }

        return [
          {
            id: `${rule.id}-tier-meter`,
            code: rule.code,
            label: rule.label,
            amount: roundCurrency((tier.ratePerSquareMeter ?? 0) * context.builtArea),
            explanation: `Faixa progressiva aplicada sobre ${context.builtArea} m2.`,
          },
        ];
      }
      case "professional_category":
        return [
          {
            id: rule.id,
            code: rule.code,
            label: rule.label,
            amount: roundCurrency(rule.amount ?? 0),
            explanation: `Regra aplicada para categoria profissional ${rule.professionalCategory}.`,
          },
        ];
      case "construction_standard":
        return [
          {
            id: rule.id,
            code: rule.code,
            label: rule.label,
            amount: roundCurrency(rule.amount ?? 0),
            explanation: `Regra aplicada para padrao construtivo ${rule.constructionStandard}.`,
          },
        ];
      default:
        return [];
    }
  });

  return {
    total: roundCurrency(lines.reduce((total, line) => total + line.amount, 0)),
    lines,
  };
}

export function buildGuideCalculationSummary(result: CalculationResult) {
  return {
    total: result.total,
    lineCount: result.lines.length,
    hasAnyCharge: result.total > 0,
  };
}
