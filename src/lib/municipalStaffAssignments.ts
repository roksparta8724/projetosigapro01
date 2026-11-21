import type { UserRole } from "@/lib/platform";

export const SWITCHABLE_MUNICIPAL_ROLES = [
  "analista", "financeiro", "fiscal", "setor_intersetorial",
] as const;
export type MunicipalStaffRole = (typeof SWITCHABLE_MUNICIPAL_ROLES)[number];

export interface MunicipalStaffAssignment {
  id: string;
  municipalityId: string;
  profileId: string;
  departmentId: string;
  departmentName: string;
  departmentCode: string;
  role: MunicipalStaffRole;
  isCurrent: boolean;
  isActive: boolean;
}

export function isSwitchableMunicipalStaffRole(value: string | UserRole): value is MunicipalStaffRole {
  return (SWITCHABLE_MUNICIPAL_ROLES as readonly string[]).includes(value);
}

export function parseMunicipalStaffAssignments(value: unknown): MunicipalStaffAssignment[] {
  if (!Array.isArray(value)) throw new Error("O banco retornou uma lista inválida de lotações.");
  const found = new Set<string>();
  return value.map((item: unknown) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : null;
    if (!record) throw new Error("Vínculo municipal inválido.");
    const id = String(record.id ?? "");
    const municipalityId = String(record.municipalityId ?? "");
    const profileId = String(record.profileId ?? "");
    const departmentId = String(record.departmentId ?? "");
    const departmentName = String(record.departmentName ?? "");
    const role = String(record.role ?? "");
    if (!id || !municipalityId || !profileId || !departmentId || !departmentName ||
        !isSwitchableMunicipalStaffRole(role) || record.isActive !== true ||
        found.has(id)) throw new Error("Vínculo municipal não autorizado ou duplicado.");
    found.add(id);
    return {
      id, municipalityId, profileId, departmentId, departmentName,
      departmentCode: String(record.departmentCode ?? ""),
      role, isCurrent: record.isCurrent === true, isActive: true,
    };
  });
}

export function getMunicipalAssignmentForAccount(
  assignments: MunicipalStaffAssignment[], profileId: string, municipalityId: string,
) {
  return assignments.filter((item) =>
    item.profileId === profileId && item.municipalityId === municipalityId && item.isActive
  );
}
