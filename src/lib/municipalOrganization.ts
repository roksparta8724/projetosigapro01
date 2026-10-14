import type { MunicipalDepartmentRecord } from "@/integrations/backend/platform";

const STOP_WORDS = new Set(["de", "da", "do", "das", "dos", "e", "para", "por", "em", "na", "no"]);

export function normalizeMunicipalUnit(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

export function getMunicipalDepartmentAcronym(
  department: Pick<MunicipalDepartmentRecord, "code" | "name">,
) {
  const explicit = department.code?.trim().toUpperCase();
  if (explicit) return explicit.slice(0, 12);

  const words = department.name
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-zÀ-ÿ0-9]/g, ""))
    .filter(Boolean)
    .filter((word) => !STOP_WORDS.has(word.toLocaleLowerCase("pt-BR")));

  const initials = words.map((word) => word[0]).join("").toUpperCase();
  return initials.slice(0, 8) || "UN";
}

export function findMunicipalDepartment(
  departments: MunicipalDepartmentRecord[],
  reference: string | null | undefined,
) {
  const normalizedReference = normalizeMunicipalUnit(reference);
  if (!normalizedReference) return undefined;

  const exact = departments.find((department) => {
    const normalizedName = normalizeMunicipalUnit(department.name);
    const normalizedCode = normalizeMunicipalUnit(department.code);
    return normalizedName === normalizedReference || normalizedCode === normalizedReference;
  });
  if (exact) return exact;

  const tokens = normalizedReference.split(/\s+/).filter((token) => token.length > 2);
  const candidates = departments
    .map((department) => {
      const normalizedName = normalizeMunicipalUnit(department.name);
      const normalizedCode = normalizeMunicipalUnit(department.code);
      let score = 0;

      if (normalizedCode && normalizedReference.includes(normalizedCode)) score += 8;
      if (normalizedName && normalizedReference.includes(normalizedName)) score += 7;
      if (normalizedName && normalizedName.includes(normalizedReference)) score += 6;

      for (const token of tokens) {
        if (normalizedName.split(/\s+/).includes(token)) score += 2;
      }

      return { department, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.department.sortOrder - right.department.sortOrder);

  return candidates[0]?.department;
}

export function getMunicipalDepartmentChain(
  departments: MunicipalDepartmentRecord[],
  department: MunicipalDepartmentRecord,
) {
  const byId = new Map(departments.map((item) => [item.id, item]));
  const chain: MunicipalDepartmentRecord[] = [];
  const visited = new Set<string>();
  let current: MunicipalDepartmentRecord | undefined = department;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.unshift(current);
    current = current.parentDepartmentId
      ? byId.get(current.parentDepartmentId)
      : undefined;
  }

  return chain;
}

export type MunicipalUnitIdentity = {
  matched: boolean;
  departmentId: string | null;
  code: string;
  name: string;
  codePath: string;
  breadcrumb: string;
  detailedPath: string;
};

export function resolveMunicipalUnitIdentity(
  departments: MunicipalDepartmentRecord[],
  reference: string | null | undefined,
): MunicipalUnitIdentity {
  const fallbackName = String(reference ?? "").trim() || "Unidade não informada";
  const matched = findMunicipalDepartment(departments, reference);

  if (!matched) {
    return {
      matched: false,
      departmentId: null,
      code: "",
      name: fallbackName,
      codePath: "",
      breadcrumb: fallbackName,
      detailedPath: fallbackName,
    };
  }

  const chain = getMunicipalDepartmentChain(departments, matched);
  const code = getMunicipalDepartmentAcronym(matched);
  const codePath = chain.map(getMunicipalDepartmentAcronym).filter(Boolean).join(" / ");
  const breadcrumb = chain.map((item) => item.name).join(" › ");
  const detailedPath = chain
    .map((item) => {
      const acronym = getMunicipalDepartmentAcronym(item);
      return acronym ? `${acronym} — ${item.name}` : item.name;
    })
    .join(" › ");

  return {
    matched: true,
    departmentId: matched.id,
    code,
    name: matched.name,
    codePath,
    breadcrumb,
    detailedPath,
  };
}
