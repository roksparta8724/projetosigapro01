import type { ClientPlanAssignment, PlanItem } from "@/lib/platform";

export type PlanModuleName =
  | "Protocolo digital"
  | "Analise tecnica"
  | "Financeiro"
  | "Assinatura"
  | "Configurações"
  | "Acesso externo";

export type PlanEntitlementState = {
  municipalityId: string;
  assignment: ClientPlanAssignment | null;
  plan: PlanItem | null;
  contractActive: boolean;
  contractReason: string;
  modules: PlanModuleName[];
  maxUsers: number | null;
  maxProcesses: number | null;
  maxDepartments: number | null;
  maxStorageGb: number | null;
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

const canonicalModules: PlanModuleName[] = [
  "Protocolo digital",
  "Analise tecnica",
  "Financeiro",
  "Assinatura",
  "Configurações",
  "Acesso externo",
];

export function canonicalPlanModule(value: string): PlanModuleName | null {
  const normalized = normalizeText(value);
  return (
    canonicalModules.find((item) => normalizeText(item) === normalized) ??
    (normalized === "analise" ? "Analise tecnica" : null) ??
    (normalized === "protocolo" ? "Protocolo digital" : null) ??
    (normalized === "configuracoes" ? "Configurações" : null)
  );
}

function isDateWithinContract(assignment: ClientPlanAssignment, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  if (assignment.startsAt && assignment.startsAt > day) return false;
  if (assignment.endsAt && assignment.endsAt < day) return false;
  return true;
}

export function resolvePlanEntitlements(input: {
  municipalityId?: string | null;
  plans: PlanItem[];
  assignments: ClientPlanAssignment[];
  now?: Date;
}): PlanEntitlementState {
  const municipalityId = input.municipalityId?.trim() ?? "";
  const assignment =
    input.assignments.find((item) => item.municipalityId === municipalityId) ?? null;
  const plan = assignment
    ? input.plans.find((item) => item.id === assignment.planId) ?? null
    : null;

  const statusAllowed = Boolean(
    assignment &&
      ["ativo", "trial", "upgrade", "downgrade"].includes(assignment.contractStatus),
  );
  const dateAllowed = Boolean(assignment && isDateWithinContract(assignment, input.now));
  const contractActive = Boolean(plan?.isActive && statusAllowed && dateAllowed);

  let contractReason = "";
  if (!assignment) contractReason = "Nenhum plano comercial foi vinculado a esta Prefeitura.";
  else if (!plan) contractReason = "O plano vinculado não foi encontrado.";
  else if (!plan.isActive) contractReason = "O plano vinculado está inativo.";
  else if (!statusAllowed) contractReason = "O contrato desta Prefeitura não está ativo.";
  else if (!dateAllowed) contractReason = "O contrato desta Prefeitura está fora do período de vigência.";

  const modules = (plan?.modulesIncluded ?? [])
    .map(canonicalPlanModule)
    .filter((value): value is PlanModuleName => Boolean(value));

  return {
    municipalityId,
    assignment,
    plan,
    contractActive,
    contractReason,
    modules: Array.from(new Set(modules)),
    maxUsers: plan?.maxUsers ?? null,
    maxProcesses: plan?.maxProcesses ?? null,
    maxDepartments: plan?.maxDepartments ?? null,
    maxStorageGb: plan?.maxStorageGb ?? null,
  };
}

export function planHasModule(state: PlanEntitlementState, module: PlanModuleName) {
  return state.contractActive && state.modules.includes(module);
}

export function formatPlanLimit(value: number | null, suffix = "") {
  return value == null ? "Ilimitado" : `${value}${suffix}`;
}
