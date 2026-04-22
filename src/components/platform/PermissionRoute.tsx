import { LockKeyhole } from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuthGateway } from "@/hooks/useAuthGateway";
import { useAppBootstrap } from "@/hooks/useAppBootstrap";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { useTenant } from "@/hooks/useTenant";
import { can } from "@/lib/platform";
import type { Permission } from "@/lib/platform";

export function PermissionRoute({
  permission,
  children,
}: {
  permission: Permission;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const { isAuthenticated, signOut, authenticatedUserId } = useAuthGateway();
  const bootstrap = useAppBootstrap();
  const { sessionUsers } = usePlatformData();
  const { session } = usePlatformSession();
  const tenant = useTenant();
  const isPlatformScope = bootstrap.scopeType === "platform";

  console.log("[PermissionRoute] Render", {
    loading: tenant.loading,
    bootstrapLoading: bootstrap.loading,
    isReady: bootstrap.isReady,
    isAuthenticated,
    role: session.role,
    municipalityId: tenant.municipalityId,
    scopeType: bootstrap.scopeType,
  });

  const shouldBlockForLoad =
    !bootstrap.isReady ||
    (!isPlatformScope &&
      tenant.mode === "tenant" &&
      tenant.loading &&
      !tenant.municipalityId);

  if (shouldBlockForLoad) {
    return null;
  }

  if (!isAuthenticated && bootstrap.isReady) {
    return <Navigate to="/acesso" replace />;
  }

  const authenticatedUser = sessionUsers.find((item) => item.id === authenticatedUserId);
  const isActuallyBlocked =
    authenticatedUser?.accountStatus === "blocked" || authenticatedUser?.accountStatus === "inactive";

  const isMaster = session.role === "master_admin" || session.role === "master_ops";
  const sessionScopeId = session.municipalityId ?? session.tenantId ?? null;
  const isTenantMismatch =
    tenant.mode === "tenant" &&
    !tenant.loading &&
    Boolean(tenant.municipalityId) &&
    !isMaster &&
    Boolean(sessionScopeId) &&
    sessionScopeId !== tenant.municipalityId;

  if (tenant.mode === "tenant" && tenant.inactive) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
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
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
        <Card className="max-w-xl rounded-[28px] border-slate-200">
          <CardContent className="p-8">
            <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <LockKeyhole className="h-6 w-6" />
            </div>
            <h1 className="max-w-md break-words text-xl font-semibold leading-tight text-slate-900">
              Acesso restrito a Prefeitura vinculada
            </h1>
            <p className="mt-3 text-sm text-slate-600">
              Esta conta nao esta vinculada a Prefeitura deste subdominio. Entre com uma conta autorizada ou volte para
              o acesso principal.
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

  if (!isActuallyBlocked && can(session, permission)) {
    return <>{children}</>;
  }

  const fallbackPath = resolveAllowedArea(session);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
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
              Esta conta foi marcada como {authenticatedUser?.accountStatus === "inactive" ? "inativa" : "bloqueada"}{" "}
              por um administrador.
              {authenticatedUser?.blockReason ? ` Motivo registrado: ${authenticatedUser.blockReason}.` : ""}
            </p>
          ) : (
            <>
              <p className="mt-3 text-sm text-slate-600">
                Esta area exige um perfil diferente do seu acesso atual. Isso nao significa bloqueio da conta.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Se voce quiser entrar com outra conta, acesse novamente para trocar de usuario.
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

function resolveAllowedArea(session: { role: string }) {
  switch (session.role) {
    case "master_admin":
    case "master_ops":
      return "/master";
    case "prefeitura_admin":
      return "/prefeitura";
    case "prefeitura_supervisor":
    case "analista":
    case "fiscal":
    case "setor_intersetorial":
      return "/prefeitura/analise";
    case "financeiro":
      return "/prefeitura/financeiro";
    case "profissional_externo":
    case "proprietario_consulta":
      return "/externo";
    case "property_owner":
      return "/proprietario";
    default:
      return "/perfil";
  }
}
