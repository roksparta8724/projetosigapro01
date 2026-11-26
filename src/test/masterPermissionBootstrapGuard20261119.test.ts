import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const guard = readFileSync("src/components/platform/PermissionRoute.tsx", "utf8");
const app = readFileSync("src/App.tsx", "utf8");
const platform = readFileSync("src/lib/platform.ts", "utf8");
const bootstrap = readFileSync("src/hooks/useAppBootstrap.tsx", "utf8");

describe("SIGAPRO Master — sessão, rota e bloqueio legítimo", () => {
  it("mantém /master restrito à permissão verificada do Master", () => {
    expect(app).toContain('path="/master"');
    expect(app).toContain('<PermissionRoute permission="view_master_dashboard">');
    expect(platform).toContain('master_admin: ["view_master_dashboard"');
    expect(platform).toContain('master_ops: ["view_master_dashboard"');
    expect(guard).toContain('const permissionAllowed = can(session, permission) && departmentRouteAllowed && roleAllowed');
    expect(guard).toContain('!isActuallyBlocked && permissionAllowed && (!needsDepartmentContext || storeIdentityConfirmed)');
    expect(guard).toContain('const hasStableAuthenticatedMasterView =');
    expect(guard).toContain('!hasStableAuthenticatedMasterView &&');
  });

  it("não mostra acesso negado antes da confirmação da identidade Master", () => {
    expect(guard).toContain('permission === "view_master_dashboard" || permission === "manage_commercial_plans"');
    expect(guard).toContain('!bootstrap.isReady || !bootstrap.authResolved || bootstrap.loading');
    expect(guard).toContain('(!hasStableAuthenticatedView &&');
    expect(guard).toContain('session.id === businessUserId');
    expect(guard.indexOf('if (isInitialAccessResolution)')).toBeLessThan(
      guard.indexOf('const isMaster = session.role === "master_admin"'),
    );
    expect(guard).not.toContain('hasValidRefreshContinuity()');
    expect(guard).toContain('if (!isActuallyBlocked && permissionDataPending) return pendingAccess()');
  });

  it("mostra o perfil ativo sem expor email ou forçar permissão", () => {
    expect(guard).toContain('data-active-access-role="true"');
    expect(guard).toContain('roleLabels[session.role] ?? "Não identificado"');
    expect(guard).toContain('A área Master é reservada aos perfis Administrador Geral ou Operação Geral');
    expect(guard).toContain('faça uma nova autenticação para atualizar a sessão');
    expect(guard).not.toContain("localStorage.clear()");
  });

  it("preserva logout confiável e retorno à área realmente permitida", () => {
    expect(guard).toContain('await signOut();');
    expect(guard).toContain('navigate("/acesso", { replace: true });');
    expect(guard).toContain('const fallbackPath = resolveAllowedArea(session);');
    expect(guard).toContain('<Link to={fallbackPath}>');
  });

  it("reconhece admin_master legado apenas pelo perfil validado", () => {
    expect(bootstrap).toContain('admin_master: "master_admin"');
    expect(platform).toContain('case "master_admin":');
    expect(platform).toContain('case "master_ops":');
  });
});
