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
  if (entitlements.isMaster || entitlements.canUseModule(module)) {
    return <>{children}</>;
  }

  if (entitlements.isResolving) {
    // Mantém a página já autorizada visualmente montada durante a revalidação.
    // A autorização contratual definitiva continua sendo aplicada assim que
    // o contexto do plano termina de sincronizar.
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
