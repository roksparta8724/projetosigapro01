import { LockKeyhole } from "lucide-react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import { useAppBootstrap } from "@/hooks/useAppBootstrap";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { useTenant } from "@/hooks/useTenant";
import { can, canAccessMunicipalArea, getRoleLandingPath, isInternalRole, roleLabels } from "@/lib/platform";
import type { Permission, SessionUser, UserRole } from "@/lib/platform";
import { SecureRoutePending } from "@/components/platform/SecureRoutePending";

export function PermissionRoute({
  permission,
  children,
  allowedRoles,
}: {
  permission: Permission;
  children: React.ReactNode;
  allowedRoles?: readonly UserRole[];
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, signOut, authenticatedUserId, authenticatedProfileId } = useAuthGateway();
  const bootstrap = useAppBootstrap();
  const { sessionUsers, remoteSyncedForCurrentUser, storeIdentityConfirmed } = usePlatformData();
  const { session } = usePlatformSession();
  const tenant = useTenant();
  const verifiedScopeId =
    bootstrap.profile?.municipalityId ??
    session.municipalityId ??
    session.tenantId ??
    null;

  // A resolved identity is required before either granting or denying access.
  // Cache continuity may preserve visuals, but is not an authorization bypass.
  const businessUserId = authenticatedProfileId || bootstrap.profile?.userId || authenticatedUserId;
  const hasStableAuthenticatedView = Boolean(
    isAuthenticated && authenticatedUserId && businessUserId &&
    session.id === businessUserId && session.id !== "unknown" && session.role
  );
  const requiresMasterPermission =
    permission === "view_master_dashboard" || permission === "manage_commercial_plans";
  const hasStableAuthenticatedMasterView =
    hasStableAuthenticatedView &&
    (session.role === "master_admin" || session.role === "master_ops");
  const isInitialAccessResolution =
    bootstrap.stage === "bootstrap_error" ||
    (!hasStableAuthenticatedView &&
      (!bootstrap.isReady || !bootstrap.authResolved || bootstrap.loading || isAuthenticated)) ||
    (requiresMasterPermission && !hasStableAuthenticatedMasterView && !bootstrap.authResolved);

  // A confirmed anonymous identity must never render a stale permission error.
  if (!isAuthenticated && bootstrap.authResolved && bootstrap.isReady) {
    return <Navigate to="/acesso" replace />;
  }

  if (isInitialAccessResolution) {
    const documentRoute =
      /\/processos\/[^/]+\/documentos\/[^/]+\/(visualizar|analisar)$/.exec(location.pathname);

    if (documentRoute) {
      // Um PDF restrito também deve dar feedback sem expor dados antes da autenticação.
      return (
        <SecureRoutePending
          surface="document"
          title="Preparando o documento oficial"
          detail="Verificando se sua sessão tem autorização para abrir este documento."
        />
      );
    }

    // A identidade continua bloqueando conteúdo, mas nunca exibir uma tela vazia.
    return (
      <SecureRoutePending
        title={bootstrap.stage === "bootstrap_error" ? "Não foi possível validar o acesso" : "Validando o acesso municipal"}
        detail={bootstrap.stage === "bootstrap_error"
          ? "A autenticação não foi concluída. Use Recarregar ou volte ao acesso para tentar novamente."
          : "Estamos verificando a sessão e o vínculo com a Prefeitura. Nenhum processo fica visível antes da confirmação."}
      />
    );
  }


  const authenticatedUser = storeIdentityConfirmed ? sessionUsers.find((item) => item.id === businessUserId || item.id === authenticatedUserId) : undefined;
  const accountStatus = [bootstrap.profile?.accountStatus, authenticatedUser?.accountStatus].find(status => status === "blocked" || status === "inactive") ?? bootstrap.profile?.accountStatus ?? authenticatedUser?.accountStatus;
  const isActuallyBlocked = accountStatus === "blocked" || accountStatus === "inactive" || Boolean(authenticatedUser?.deletedAt);
  const permissionDataPending = !remoteSyncedForCurrentUser;
  const pendingAccess = () => <SecureRoutePending title="Verificando acesso municipal" detail="Aguardando confirmação dos vínculos e permissões desta conta." />;

  const isMaster = session.role === "master_admin" || session.role === "master_ops";
  const isExternalRole =
    session.role === "profissional_externo" ||
    session.role === "property_owner" ||
    session.role === "proprietario_consulta";
  const isExternalPortalPath =
    location.pathname.startsWith("/externo") ||
    location.pathname.startsWith("/proprietario");
  const isMunicipalPortalPath = location.pathname.startsWith("/prefeitura");

  if (!isActuallyBlocked && !isMaster && isExternalPortalPath && !isExternalRole) {
    if (permissionDataPending) return pendingAccess();
    return <Navigate to={getRoleLandingPath(session.role)} replace />;
  }

  if (!isActuallyBlocked && !isMaster && isMunicipalPortalPath && isExternalRole) {
    if (permissionDataPending) return pendingAccess();
    return <Navigate to={getRoleLandingPath(session.role)} replace />;
  }

  const isTenantMismatch =
    tenant.mode === "tenant" &&
    !tenant.loading &&
    Boolean(tenant.municipalityId) &&
    !isMaster &&
    verifiedScopeId !== tenant.municipalityId;

  if (tenant.mode === "tenant" && tenant.inactive) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-4">
        <Card className="max-w-xl rounded-[28px] border-slate-200">
          <CardContent className="p-8">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <LockKeyhole className="h-6 w-6" />
            </div>
            <h1 className="max-w-md break-words text-xl font-semibold leading-tight text-slate-900">
              Prefeitura temporariamente indisponivel
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              O acesso a esta Prefeitura esta suspenso ou em implantacao. Aguarde a liberacao oficial para continuar.
            </p>
            <div className="mt-6 flex gap-3">
              <Button asChild variant="outline">
                <Link to="/acesso">Voltar ao acesso</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isTenantMismatch) {
    if (!isActuallyBlocked && !verifiedScopeId && permissionDataPending) return pendingAccess();
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-4">
        <Card className="max-w-xl rounded-[28px] border-slate-200">
          <CardContent className="p-8">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <LockKeyhole className="h-6 w-6" />
            </div>
            <h1 className="max-w-md break-words text-xl font-semibold leading-tight text-slate-900">
              Acesso restrito a Prefeitura vinculada
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              {verifiedScopeId
                ? "Esta conta pertence a outra Prefeitura. Entre com uma conta autorizada para este subdomínio."
                : "O vínculo desta conta com a Prefeitura ainda não foi concluído. Confirme o e-mail de cadastro ou tente entrar novamente."}
            </p>
            <div className="mt-6 flex gap-3">
              <Button
                type="button"
                onClick={async () => {
                  await signOut();
                  navigate("/acesso", { replace: true });
                }}
              >
                Entrar com outra conta
              </Button>
              <Button asChild variant="outline">
                <Link to="/acesso">Voltar ao acesso</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isMunicipalEmployee =
    isInternalRole(session.role) && session.role !== "prefeitura_admin";

  const isAdminOnlyMunicipalPath =
    location.pathname === "/prefeitura" ||
    location.pathname.startsWith("/configuracoes");

  const requiredOperationalArea =
    location.pathname.startsWith("/prefeitura/protocolos")
      ? "protocolos"
      : location.pathname.startsWith("/prefeitura/analise")
        ? "analise"
        : location.pathname.startsWith("/prefeitura/financeiro")
          ? "financeiro"
          : null;

  const departmentRouteAllowed =
    !isMunicipalEmployee ||
    (!isAdminOnlyMunicipalPath &&
      (!requiredOperationalArea || canAccessMunicipalArea(session, requiredOperationalArea)));

  const roleAllowed = !allowedRoles || allowedRoles.includes(session.role);
  const permissionAllowed = can(session, permission) && departmentRouteAllowed && roleAllowed;
  // A previous account's store must never supply department-specific privileges.
  const needsDepartmentContext = isMunicipalEmployee && Boolean(requiredOperationalArea ||
    ["manage_protocols", "review_processes", "manage_financial", "manage_fiscal_financial", "dispatch_interdepartmental", "sign_documents"].includes(permission));
  if (!isActuallyBlocked && permissionAllowed && (!needsDepartmentContext || storeIdentityConfirmed)) {
    return <>{children}</>;
  }
  // A missing department/role during hydration is not a confirmed refusal.
  if (!isActuallyBlocked && permissionDataPending) return pendingAccess();

  const fallbackPath = resolveAllowedArea(session);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-4">
      <Card className="max-w-xl rounded-[28px] border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
        <CardContent className="p-8">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <h1 className="max-w-md break-words text-xl font-semibold leading-tight text-slate-900">
            {isActuallyBlocked ? "Conta bloqueada administrativamente" : "Area indisponivel para este perfil"}
          </h1>
          {isActuallyBlocked ? (
            <p className="mt-3 text-sm text-slate-600">
              Esta conta foi marcada como {accountStatus === "inactive" ? "inativa" : "bloqueada"}{" "}
              por um administrador.
              {authenticatedUser?.blockReason ? ` Motivo registrado: ${authenticatedUser.blockReason}.` : ""}
            </p>
          ) : (
            <>
              <p className="mt-3 text-sm text-slate-600">
                {requiresMasterPermission
                  ? "A área Master é reservada aos perfis Administrador Geral ou Operação Geral da plataforma."
                  : "Esta area exige um perfil diferente do seu acesso atual. Isso nao significa bloqueio da conta."}
              </p>
              <p className="mt-2 text-sm text-slate-700">
                Perfil atualmente reconhecido:{" "}
                <strong data-active-access-role="true" className="font-semibold text-slate-950">
                  {roleLabels[session.role] ?? "Não identificado"}
                </strong>
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {requiresMasterPermission
                  ? "Para entrar no Master, utilize uma conta da plataforma autorizada. Caso você já tenha esse perfil, faça uma nova autenticação para atualizar a sessão."
                  : "Se voce quiser entrar com outra conta, acesse novamente para trocar de usuario."}
              </p>
            </>
          )}
          <div className="mt-6 flex gap-3">
            <Button
              type="button"
              onClick={async () => {
                await signOut();
                navigate("/acesso", { replace: true });
              }}
            >
              Entrar com outra conta
            </Button>
            <Button asChild variant="outline">
              <Link to={fallbackPath}>{isActuallyBlocked ? "Voltar ao acesso" : "Ir para uma area permitida"}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function resolveAllowedArea(session: SessionUser) {
  switch (session.role) {
    case "master_admin":
    case "master_ops":
      return "/master";
    case "prefeitura_admin":
      return "/prefeitura";
    case "profissional_externo":
      return "/externo";
    case "proprietario_consulta":
    case "property_owner":
      return "/proprietario";
    default:
      if (isInternalRole(session.role)) {
        if (canAccessMunicipalArea(session, "protocolos")) return "/prefeitura/protocolos";
        if (canAccessMunicipalArea(session, "analise")) return "/prefeitura/analise";
        if (canAccessMunicipalArea(session, "financeiro")) return "/prefeitura/financeiro";
        return "/dashboard";
      }
      return "/perfil";
  }
}
