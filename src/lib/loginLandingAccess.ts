import type { PlanModuleName } from "@/lib/planEntitlements";
import { getRoleLandingPath } from "@/lib/platform";

/**
 * Login landing permission is checked against the current authenticated Neon
 * session, never against an old browser plan cache or the large operational store.
 *
 * This only chooses the landing route. Every page, object and mutation keeps
 * its own backend authorization and contract checks.
 */
export type LoginAccessRpc = (
  method: "has_tenant_access" | "assert_municipality_entitlement_v1",
  args: Record<string, string | number>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

export type LoginLandingDecision =
  | { ok: true; path: string }
  | { ok: false; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function landingModuleForRole(role: string | null): PlanModuleName | null {
  switch (role) {
    case "prefeitura_admin": return "Configurações";
    case "prefeitura_supervisor":
    case "analista":
    case "fiscal": return "Analise tecnica";
    case "financeiro": return "Financeiro";
    case "setor_intersetorial": return "Protocolo digital";
    case "profissional_externo":
    case "proprietario_consulta":
    case "property_owner": return "Acesso externo";
    default: return null;
  }
}

export async function verifyLoginLandingAccess(
  role: string | null,
  municipalityId: string | null,
  rpc: LoginAccessRpc,
): Promise<LoginLandingDecision> {
  const path = getRoleLandingPath(role);
  if (role === "master_admin" || role === "master_ops") return { ok: true, path };

  const module = landingModuleForRole(role);
  if (!module || !municipalityId || !UUID.test(municipalityId))
    return { ok: false, message: "O vínculo municipal deste perfil não foi confirmado no banco." };

  try {
    // SECURITY: check actual authenticated membership before the SECURITY
    // DEFINER contract RPC. Never accept a client-supplied municipality alone.
    const membership = await rpc("has_tenant_access", { target_tenant: municipalityId });
    if (membership.error || membership.data !== true)
      return { ok: false, message: "Esta conta não possui vínculo ativo com a Prefeitura." };

    const contract = await rpc("assert_municipality_entitlement_v1", {
      _municipality_id: municipalityId,
      _capability: "module:" + module,
      _increment: 0,
    });
    if (contract.error)
      return {
        ok: false,
        message: "O contrato ou módulo desta Prefeitura ainda não está liberado. Confira o plano com o administrador.",
      };
    return { ok: true, path };
  } catch {
    return {
      ok: false,
      message: "Não foi possível validar o acesso institucional. A sessão permanece protegida; tente novamente.",
    };
  }
}

/**
 * Prefetch only the route for this authenticated role while the access check
 * runs. No other internal dashboards/PDFs are loaded on the public login page.
 * Suspense will therefore normally find the landing chunk already downloaded.
 */
export async function preloadLoginLanding(path: string): Promise<void> {
  switch (path) {
    case "/master": await import("@/pages/saas/MasterAdminPage"); return;
    case "/prefeitura": await import("@/pages/saas/TenantAdminPage"); return;
    case "/prefeitura/analise": await import("@/pages/saas/AnalystDeskPage"); return;
    case "/prefeitura/financeiro": await import("@/pages/saas/FinanceDeskPage"); return;
    case "/prefeitura/protocolos": await import("@/pages/saas/ProtocolDeskPage"); return;
    case "/proprietario": await import("@/pages/saas/OwnerPortalPage"); return;
    case "/dashboard": await import("@/pages/saas/DashboardHomePage"); return;
    default: return;
  }
}
