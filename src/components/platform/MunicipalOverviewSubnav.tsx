import { Link } from "react-router-dom";
import {
  MUNICIPAL_OVERVIEW_SUBPAGES,
  type MunicipalOverviewSubpage,
} from "@/lib/municipalOverviewSubpages";

type SubnavProps = {
  active: MunicipalOverviewSubpage;
  counts: { processos: number; pendencias: number; atividades: number };
};

export function MunicipalOverviewSubnav({ active, counts }: SubnavProps) {
  return (
    <nav aria-label="Subpáginas da Visão Geral" data-sigapro-overview-subpages="true"
      className="min-w-0 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_6px_18px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-900">
      <div className="flex w-max min-w-full items-stretch gap-1.5">
        {MUNICIPAL_OVERVIEW_SUBPAGES.map((item) => {
          const selected = active === item.key;
          const count = item.key === "resumo" ? null : counts[item.key];
          return (
            <Link key={item.key} to={item.path} aria-current={selected ? "page" : undefined}
              data-sigapro-overview-tab={selected ? "active" : "inactive"}
              className={"flex min-h-12 min-w-[130px] flex-1 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 " +
                (selected
                  ? "border-sky-700 bg-sky-900 text-white shadow-sm"
                  : "border-transparent bg-transparent text-slate-800 hover:border-sky-200 hover:bg-sky-50 dark:text-slate-100 dark:hover:bg-slate-800")}>
              <span className="min-w-0">
                <span data-sigapro-overview-tab-title="true" className="block truncate font-semibold">{item.title}</span>
                <span data-sigapro-overview-tab-helper="true" className={"mt-0.5 block truncate text-[11px] " +
                  (selected ? "text-sky-100" : "text-slate-500 dark:text-slate-300")}>{item.helper}</span>
              </span>
              {count !== null ? (
                <span data-sigapro-overview-tab-counter="true" className={"shrink-0 rounded-lg px-2 py-1 text-xs font-bold tabular-nums " +
                  (selected ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-100")}>
                  {count.toLocaleString("pt-BR")}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
