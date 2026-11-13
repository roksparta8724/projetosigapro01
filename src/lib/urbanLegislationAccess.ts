import type { UserRole } from "@/lib/platform";

/**
 * Prefeitura Admin maintains the legal archive only for its own municipality.
 * Master can consult, never write. Process workflow permissions stay read-only.
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
  // Only the municipal administrator maintains municipal legal documents.
  return role === "prefeitura_admin";
}
