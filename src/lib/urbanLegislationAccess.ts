import type { UserRole } from "@/lib/platform";

/**
 * Administrative legal workspace: available exclusively to platform Master
 * and the municipality's read-only administrative account. Other employees,
 * including the director/supervisor, may use their operational screens but
 * must not receive the legislation management menu or route.
 */
export const URBAN_LEGISLATION_VIEW_ROLES: readonly UserRole[] = [
  "master_admin",
  "master_ops",
  "prefeitura_admin",
];

export function canViewUrbanLegislationManagement(role: UserRole | null | undefined): boolean {
  return role === "master_admin" || role === "master_ops" || role === "prefeitura_admin";
}

export function canEditUrbanLegislationManagement(role: UserRole | null | undefined): boolean {
  // Admin Prefeitura has observation privileges only.
  return role === "master_admin" || role === "master_ops";
}
