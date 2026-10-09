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
  const verifiedScopeId =
    bootstrap.profile?.municipalityId ??
    session.municipalityId ??
    session.tenantId ??
    null;

  // Depois que a identidade autenticada já foi resolvida, sincronizações de fundo
  // NUNCA podem desmontar a tela. Isso mantém brasão, dados e layout fixos sem loop visual.
  const hasStableAuthenticatedView =
    session.id !== "unknown" &&
    Boolean(session.role) &&
    (
      Boolean(bootstrap.authUserId) ||
      Boolean(bootstrap.profile?.userId) ||
      Boolean(session.email)
    );

  const isInitialAccessResolution =
    !hasStableAuthenticatedView &&
    (!bootstrap.isReady || !bootstrap.authResolved || bootstrap.loading || tenant.loading);

  if (isInitialAccessResolution) {
    return (
      <div className="min-h-screen bg-[#eef1f4]" aria-busy="true" aria-label="Validando acesso">
        <header className="h-[76px] border-b border-[#2f5575] bg-[linear-gradient(90deg,#173f61_0%,#29577f_100%)] shadow-[0_10px_28px_rgba(15,23,42,0.16)]">
          <div className="flex h-full items-center justify-between px-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-[16px] border border-white/20 bg-white/95 shadow-sm" />
              <div>
                <div className="h-3.5 w-24 rounded-full bg-white/90" />
                <div className="mt-2 h-2.5 w-52 rounded-full bg-white/30" />
              </div>
            </div>
            <div className="hidden items-center gap-3 md:flex">
              <div className="h-10 w-24 rounded-[14px] border border-white/10 bg-white/10" />
              <div className="h-10 w-64 rounded-[14px] border border-white/10 bg-white/10" />
              <div className="h-10 w-10 rounded-[14px] border border-white/10 bg-white/10" />
              <div className="h-10 w-10 rounded-[14px] border border-white/10 bg-white/10" />
            </div>
          </div>
        </header>

        <div className="grid min-h-[calc(100vh-76px)] lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="hidden border-r border-[#244b6c] bg-[#123f62] px-4 py-5 lg:block">
            <div className="space-y-3">
              {[0, 1, 2, 3, 4, 5].map((item) => (
                <div key={item} className="flex h-[58px] items-center gap-3 rounded-[18px] border border-white/10 bg-white/[0.035] px-4">
                  <div className="h-9 w-9 rounded-[12px] border border-white/15 bg-white/[0.07]" />
                  <div className="h-3 w-28 rounded-full bg-white/20" />
                </div>
              ))}
            </div>
          </aside>

          <main className="min-w-0 px-4 py-5 sm:px-6 lg:px-7">
            <div className="mx-auto max-w-[1760px] space-y-5">
              <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_14px_30px_rgba(15,23,42,0.08)]">
                <div className="h-[86px] bg-[linear-gradient(90deg,#173f61_0%,#204f76_100%)] px-6 py-5">
                  <div className="h-3 w-24 rounded-full bg-white/35" />
                  <div className="mt-3 h-5 w-80 max-w-[65%] rounded-full bg-white/80" />
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
                  {[0, 1, 2, 3].map((item) => (
                    <div key={item} className="h-28 rounded-[20px] border border-slate-200 bg-[#f7f8fa]" />
                  ))}
                </div>
              </section>

              <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_26px_rgba(15,23,42,0.06)]">
                <div className="flex flex-wrap gap-3">
                  {[0, 1, 2, 3, 4].map((item) => (
                    <div key={item} className="h-14 min-w-[150px] flex-1 rounded-[18px] border border-slate-200 bg-[#f7f8fa]" />
                  ))}
                </div>
              </section>

              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.7fr)]">
                <div className="h-[310px] rounded-[24px] border border-slate-200 bg-white shadow-[0_12px_26px_rgba(15,23,42,0.05)]" />
                <div className="h-[310px] rounded-[24px] border border-slate-200 bg-white shadow-[0_12px_26px_rgba(15,23,42,0.05)]" />
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && bootstrap.isReady && bootstrap.authResolved) {
    return <Navigate to="/acesso" replace />;
  }

  const authenticatedUser = sessionUsers.find((item) => item.id === authenticatedUserId);
  const accountStatus = bootstrap.profile?.accountStatus ?? authenticatedUser?.accountStatus;
  const isActuallyBlocked = accountStatus === "blocked" || accountStatus === "inactive";

  const isMaster = session.role === "master_admin" || session.role === "master_ops";
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

  if (!isActuallyBlocked && can(session, permission)) {
    return <>{children}</>;
  }

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
      return "/externo";
    case "proprietario_consulta":
    case "property_owner":
      return "/proprietario";
    default:
      return "/perfil";
  }
}
