export type ZoningRuleStatus = "ativa" | "inativa";

export type ZoningRuleType =
  | "residencial"
  | "comercial"
  | "industrial"
  | "misto"
  | "institucional";

export type ZoningUseType =
  | "residencial"
  | "comercial"
  | "industrial"
  | "institucional"
  | "misto";

export interface ZoningRule {
  id: string;
  municipalityId: string;
  nome: string;
  tipo: ZoningRuleType;
  descricao: string;
  coeficienteAproveitamento: number | null;
  taxaOcupacao: number | null;
  taxaPermeabilidade: number | null;
  alturaMaxima: number | null;
  recuoFrontal: number | null;
  recuoLateral: number | null;
  recuoFundo: number | null;
  usosPermitidos: ZoningUseType[];
  usosProibidos: string;
  observacoes: string;
  status: ZoningRuleStatus;
  createdAt: string;
}

export const ZONING_TYPE_OPTIONS: Array<{ value: ZoningRuleType; label: string }> = [
  { value: "residencial", label: "Residencial" },
  { value: "comercial", label: "Comercial" },
  { value: "industrial", label: "Industrial" },
  { value: "misto", label: "Misto" },
  { value: "institucional", label: "Institucional" },
];

export const ZONING_USE_OPTIONS: Array<{ value: ZoningUseType; label: string }> = [
  { value: "residencial", label: "Residencial" },
  { value: "comercial", label: "Comercial" },
  { value: "industrial", label: "Industrial" },
  { value: "institucional", label: "Institucional" },
  { value: "misto", label: "Misto" },
];

export function getZoningTypeLabel(value: ZoningRuleType) {
  return ZONING_TYPE_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

export function getZoningStatusLabel(value: ZoningRuleStatus) {
  return value === "ativa" ? "Ativa" : "Inativa";
}

export function countConfiguredZoningRules(rule: ZoningRule) {
  return [
    rule.coeficienteAproveitamento,
    rule.taxaOcupacao,
    rule.taxaPermeabilidade,
    rule.alturaMaxima,
    rule.recuoFrontal,
    rule.recuoLateral,
    rule.recuoFundo,
    rule.usosPermitidos.length > 0 ? 1 : null,
    rule.usosProibidos.trim() ? 1 : null,
  ].filter((value) => value !== null && value !== undefined).length;
}
