import { useEffect, useState, type ReactNode } from "react";
import { LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { usePlanEntitlements } from "@/hooks/usePlanEntitlements";
import type { PlanModuleName } from "@/lib/planEntitlements";

export function PlanModuleRoute({
  module,
  children,
}: {
  module: PlanModuleName;
  children: ReactNode;
}) {
  const entitlements = usePlanEntitlements();
  const [showResolvingState, setShowResolvingState] = useState(false);

  useEffect(() => {
    if (!entitlements.isResolving) {
      setShowResolvingState(false);
      return;
    }

    const timeout = window.setTimeout(() => setShowResolvingState(true), 450);
    return () => window.clearTimeout(timeout);
  }, [entitlements.isResolving]);

  if (entitlements.isMaster || entitlements.canUseModule(module)) {
    return <>{children}</>;
  }

  if (entitlements.isResolving) {
    if (!showResolvingState) {
      return (
        <main
          aria-busy="true"
          className="min-h-screen bg-slate-50"
          data-plan-entitlement-resolving="true"
        />
      );
    }

    return (
      <main
        aria-busy="true"
        className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950"
        data-plan-entitlement-resolving="true"
      >
        <div className="mx-auto flex max-w-[560px] items-center gap-4 rounded-[22px] border border-slate-200 bg-white px-5 py-4 shadow-[0_14px_40px_rgba(15,23,42,0.08)]">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
            <LoaderCircle className="h-4 w-4 animate-spin" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-950">
              Validando acesso da Prefeitura
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Sincronizando o plano e as permissões da conta atual.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const planName = entitlements.plan?.name ?? "não configurado";
  const reason = entitlements.contractActive
    ? `O módulo ${module} não faz parte do plano ${planName}.`
    : entitlements.contractReason || "O contrato precisa ser regularizado.";

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-950">
      <div className="mx-auto max-w-[760px] rounded-[30px] border border-slate-200 bg-white p-7 shadow-[0_22px_60px_rgba(15,23,42,0.10)] sm:p-9">
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
    </main>
  );
}
