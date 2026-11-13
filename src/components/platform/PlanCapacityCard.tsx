import { buildPlanCapacityMetrics, type PlanUsageSnapshot } from "@/lib/planUsageDashboard";

export function PlanCapacityCard({
  row,
  municipalityName,
}: {
  row: PlanUsageSnapshot;
  municipalityName?: string;
}) {
  const metrics = buildPlanCapacityMetrics(row);
  return (
    <section data-plan-capacity={row.municipalityId}
      className="min-w-0 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {municipalityName ? (
            <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-300">{municipalityName}</p>
          ) : null}
          <h3 className="text-base font-bold text-slate-950 dark:text-white">
            {row.configured ? row.planName || "Plano não identificado" : "Plano não vinculado"}
          </h3>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
            {row.contractActive ? "Contrato ativo · consumo dos limites contratados"
              : row.contractReason || "Contrato pendente de validação"}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${row.contractActive
          ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
          : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"}`}>
          {row.contractActive ? "Plano vigente" : "Verificar contrato"}
        </span>
      </header>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const filled = Math.min(100, Math.max(0, metric.percentage ?? 0));
          const warning = metric.overLimit || (metric.percentage ?? 0) >= 90;
          return (
            <div key={metric.key} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">{metric.label}</p>
              <p className="mt-2 text-lg font-bold tabular-nums text-slate-950 dark:text-white">
                {metric.usedLabel}
                <span className="ml-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                  / {metric.limitLabel}
                </span>
              </p>
              {row.configured && metric.percentage !== null ? (
                <>
                  <div role="progressbar" aria-label={metric.label} aria-valuemin={0}
                    aria-valuemax={100} aria-valuenow={filled}
                    className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600">
                    <div className={`h-full rounded-full transition-all duration-500 ${warning
                      ? "bg-amber-500" : "bg-sky-600"}`} style={{ width: `${filled}%` }} />
                  </div>
                  <p className={`mt-2 text-xs font-semibold ${warning
                    ? "text-amber-800 dark:text-amber-300" : "text-slate-700 dark:text-slate-200"}`}>
                    {metric.percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                    {metric.overLimit ? " · acima do limite" : metric.percentage >= 100 ? " · limite atingido" : " utilizado"}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold">
                    <p className="text-slate-700 dark:text-slate-200" data-plan-remaining={metric.key}>
                      {metric.remainingLabel}
                    </p>
                    <p className="text-emerald-700 dark:text-emerald-300" data-plan-remaining-percent={metric.key}>
                      {Math.max(0, 100 - metric.percentage).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% disponível
                    </p>
                  </div>
                </>
              ) : <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                {row.configured ? "Uso sem limite percentual" : "Aguardando contratação"}
              </p>}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-600 dark:text-slate-300">
        Cadastros = contas internas ativas vinculadas à Prefeitura. Processos = registros não arquivados.
        Os indicadores seguem a contagem do Neon utilizada para controlar as cotas; não incluem contas externas na quota de usuários.
      </p>
    </section>
  );
}
