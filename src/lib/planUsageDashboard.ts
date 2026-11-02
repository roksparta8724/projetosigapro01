export type PlanUsageSnapshot = {
  municipalityId: string;
  configured: boolean;
  contractActive: boolean;
  contractReason: string;
  planId: string | null;
  planName: string | null;
  contractStatus: string | null;
  limits: { users: number | null; processes: number | null; departments: number | null; storageGb: number | null };
  usage: { users: number; processes: number; departments: number; storageBytes: number };
};

export type PlanCapacityMetric = {
  key: "users" | "processes" | "departments" | "storage";
  label: string;
  used: number;
  limit: number | null;
  percentage: number | null;
  usedLabel: string;
  limitLabel: string;
  overLimit: boolean;
};

const safeNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};
const safeLimit = (value: unknown): number | null =>
  value === null || value === undefined || value === "" ? null : safeNumber(value);
const int = (value: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
const gb = (bytes: number) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(bytes / (1024 ** 3));

export function parsePlanUsageDashboard(data: unknown): PlanUsageSnapshot[] {
  if (!Array.isArray(data)) throw new Error("Resposta de consumo do plano inválida.");
  return data.filter((item) => item && typeof item === "object" &&
    typeof item.municipalityId === "string" && item.municipalityId.length > 0
  ).map((item) => ({
    municipalityId: item.municipalityId,
    configured: item.configured === true,
    contractActive: item.contractActive === true,
    contractReason: String(item.contractReason || ""),
    planId: typeof item.planId === "string" ? item.planId : null,
    planName: typeof item.planName === "string" ? item.planName : null,
    contractStatus: typeof item.contractStatus === "string" ? item.contractStatus : null,
    limits: {
      users: safeLimit(item.limits?.users),
      processes: safeLimit(item.limits?.processes),
      departments: safeLimit(item.limits?.departments),
      storageGb: safeLimit(item.limits?.storageGb),
    },
    usage: {
      users: safeNumber(item.usage?.users),
      processes: safeNumber(item.usage?.processes),
      departments: safeNumber(item.usage?.departments),
      storageBytes: safeNumber(item.usage?.storageBytes),
    },
  }));
}

/** 100% means a quota is full, not a minimum to be achieved. */
export function buildPlanCapacityMetrics(row: PlanUsageSnapshot): PlanCapacityMetric[] {
  const gbBytes = 1024 ** 3;
  const values: Array<[PlanCapacityMetric["key"], string, number, number | null, boolean]> = [
    ["users", "Cadastros internos", row.usage.users, row.limits.users, false],
    ["processes", "Processos não arquivados", row.usage.processes, row.limits.processes, false],
    ["departments", "Setores cadastrados", row.usage.departments, row.limits.departments, false],
    ["storage", "Documentos armazenados", row.usage.storageBytes, row.limits.storageGb === null ? null : row.limits.storageGb * gbBytes, true],
  ];
  return values.map(([key, label, count, rawLimit, isStorage]) => {
    const used = safeNumber(count);
    const limit = safeLimit(rawLimit);
    const percentage = limit === null ? null : limit === 0 ? (used > 0 ? 100 : 0) : Math.round((used / limit) * 1000) / 10;
    return {
      key, label, used, limit, percentage,
      overLimit: limit !== null && used > limit,
      usedLabel: isStorage ? `${gb(used)} GB` : int(used),
      limitLabel: limit === null ? "Sem limite contratado" : isStorage ? `${gb(limit)} GB` : int(limit),
    };
  });
}
