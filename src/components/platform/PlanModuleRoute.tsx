import { type ReactNode } from "react";
import { AlertTriangle, LockKeyhole, ShieldCheck } from "lucide-react";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { usePlanEntitlements } from "@/hooks/usePlanEntitlements";
import { usePlatformData } from "@/hooks/usePlatformData";
import type { PlanModuleName } from "@/lib/planEntitlements";
import { hasBackendEnv } from "@/integrations/backend/databaseClient";

function RouteGateShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <PortalFrame eyebrow="Acesso institucional" title={title}>
      <div className="flex min-h-[280px] w-full items-center justify-center px-4 py-8">
        {children}
      </div>
    </PortalFrame>
  );
}

export function PlanModuleRoute({
  module,
  children,
}: {
  module: PlanModuleName;
  children: ReactNode;
}) {
  const entitlements = usePlanEntitlements();
  const { refreshRemoteStore } = usePlatformData();

  if (!hasBackendEnv) {
    return (
      <RouteGateShell title="Ambiente local incompleto">
        <div className="w-full max-w-[680px] rounded-[26px] border border-amber-200 bg-amber-50/70 p-7 text-slate-950 shadow-[0_18px_44px_rgba(15,23,42,0.08)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-200 bg-white text-amber-700 shadow-sm">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">
            Ambiente local incompleto
          </p>
          <h1 className="mt-2 text-xl font-semibold tracking-[-0.025em] text-slate-950">
            Conexão oficial do SIGAPRO não configurada neste localhost
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            A interface continua montada, mas esta pasta ainda não recebeu as variáveis locais do Neon.
            Nenhuma autorização municipal será simulada.
          </p>
          <p className="mt-3 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs leading-5 text-amber-900">
            Use a mesma configuração local da instalação já funcional e reinicie o Vite.
          </p>
        </div>
      </RouteGateShell>
    );
  }

  if (entitlements.isResolving) {
    return (
      <RouteGateShell title={`Validando ${module}`}>
        <div
          className="flex items-center gap-3 rounded-[18px] border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-700 shadow-[0_10px_26px_rgba(15,23,42,0.07)] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <ShieldCheck className="h-5 w-5 shrink-0 text-sky-600 dark:text-sky-300" aria-hidden="true" />
          Confirmando o acesso sem desmontar topbar, menu, conteúdo-base e rodapé
        </div>
      </RouteGateShell>
    );
  }

  if (entitlements.isMaster || entitlements.canUseModule(module)) {
    return <>{children}</>;
  }

  if (entitlements.resolutionFailed && !entitlements.isConfigured) {
    return (
      <RouteGateShell title="Reconexão necessária">
        <div className="w-full max-w-[680px] rounded-[26px] border border-amber-200 bg-amber-50/70 p-7 text-slate-950 shadow-[0_18px_44px_rgba(15,23,42,0.08)]">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-200 bg-white text-amber-700 shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">
            Validação concluída com falha de conexão
          </p>
          <h1 className="mt-2 text-xl font-semibold tracking-[-0.025em] text-slate-950">
            Não foi possível confirmar o plano da Prefeitura
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            A página não ficará mais presa em validação; ela permanece dentro do shell institucional. Reconecte os dados oficiais para confirmar o módulo antes de continuar.
          </p>
          {entitlements.dataError ? (
            <p className="mt-3 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs leading-5 text-amber-900">
              {entitlements.dataError}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void refreshRemoteStore().catch(() => undefined)}
            className="mt-5 inline-flex h-10 items-center justify-center rounded-full bg-slate-950 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            Tentar novamente
          </button>
        </div>
      </RouteGateShell>
    );
  }

  const planName = entitlements.plan?.name ?? "não configurado";
  const reason = entitlements.contractActive
    ? `O módulo ${module} não faz parte do plano ${planName}.`
    : entitlements.contractReason || "O contrato precisa ser regularizado.";

  return (
    <RouteGateShell title="Módulo indisponível">
      <div className="w-full max-w-[760px] rounded-[30px] border border-slate-200 bg-white p-7 text-slate-950 shadow-[0_22px_60px_rgba(15,23,42,0.10)] sm:p-9">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
          <LockKeyhole className="h-5 w-5" />
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          Controle contratual SIGAPRO
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
          Módulo indisponível para esta Prefeitura
        </h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">{reason}</p>
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <p className="text-sm leading-6 text-slate-600">
            O bloqueio é aplicado pelo contrato da Prefeitura. O administrador Master pode alterar o plano ou a situação contratual sem misturar dados entre clientes.
          </p>
        </div>
      </div>
    </RouteGateShell>
  );
}
