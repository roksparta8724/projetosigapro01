import type { UserRole } from "@/lib/platform";

/**
 * The global "Processos" shortcut always opens a PROCESS FOLDER.
 * Municipal operators share one official municipal registry regardless of
 * their source department; the master uses cross-tenant analytics and external
 * accounts use their permission-scoped personal process list.
 *
 * No operational permission is granted by this helper: route guards remain
 * authoritative for access and write operations.
 */
export function resolveTopbarProcessDestination(role: UserRole | string | null | undefined): string {
  const normalized = String(role ?? "").trim().toLowerCase();
  switch (normalized) {
    case "master_admin":
    case "master_ops":
    case "admin_master":
      return "/dashboard/processos";
    case "profissional_externo":
    case "professional_external":
    case "professional":
    case "profissional":
      return "/externo/controle";
    case "proprietario_consulta":
    case "property_owner":
      return "/proprietario";
    case "prefeitura_admin":
    case "prefeitura_supervisor":
    case "analista":
    case "financeiro":
    case "setor_intersetorial":
    case "fiscal":
      return "/prefeitura/processos";
    default:
      return "/dashboard";
  }
}
