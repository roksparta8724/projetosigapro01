import { type ReactNode } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
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

  if (entitlements.isResolving) {
    // Falha fechada: durante troca de contas nunca montar um módulo cujo
    // plano e Prefeitura ainda não foram confirmados para o usuário atual.
    return (
      <main
        className="flex min-h-[240px] w-full items-center justify-center bg-transparent px-4 py-8"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm font-medium text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          <ShieldCheck className="h-5 w-5 shrink-0 text-sky-600 dark:text-sky-300" aria-hidden="true" />
          Validando acesso da Prefeitura
        </div>
      </main>
    );
  }

  if (entitlements.isMaster || entitlements.canUseModule(module)) {
    return <>{children}</>;
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
