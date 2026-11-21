import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Building2 } from "lucide-react";
import { paginateMunicipalItems } from "@/lib/municipalListPagination";
import type { Institution } from "@/lib/platform";

type Props = {
  institutions: readonly Institution[];
  renderDetails: (institution: Institution) => ReactNode;
  pageSize?: number;
};

/** Portfolio overview stays shallow even with hundreds of cities. */
export function CompactPortfolioRegistry({ institutions, renderDetails, pageSize = 12 }: Props) {
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const paged = useMemo(
    () => paginateMunicipalItems(institutions, page, pageSize),
    [institutions, page, pageSize],
  );
  useEffect(() => {
    if (paged.page !== page) setPage(paged.page);
  }, [page, paged.page]);

  return (
    <section className="min-w-0 space-y-3" data-sigapro-portfolio-registry="compact" aria-label="Carteira institucional">
      <p className="text-sm text-slate-600">
        <span className="font-semibold text-slate-950">{paged.total.toLocaleString("pt-BR")}</span>
        {" "}prefeituras na carteira. Fichas completas apenas sob consulta.
      </p>
      {paged.total === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">Nenhuma Prefeitura cadastrada.</p>
      ) : (
        <div className="min-w-0 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full min-w-[740px] table-fixed text-left text-sm" aria-label="Prefeituras da carteira">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-[0.08em] text-slate-600">
              <tr>
                <th scope="col" className="w-[34%] px-4 py-3 font-semibold">Prefeitura</th>
                <th scope="col" className="w-[23%] px-4 py-3 font-semibold">Município</th>
                <th scope="col" className="w-[22%] px-4 py-3 font-semibold">Plano</th>
                <th scope="col" className="w-[11%] px-4 py-3 font-semibold">Status</th>
                <th scope="col" className="w-[10%] px-4 py-3 text-right font-semibold">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paged.items.map((institution) => {
                const expanded = openId === institution.id;
                const panelId = "sigapro-portfolio-" + institution.id.replace(/[^a-zA-Z0-9_-]/g, "");
                return (
                  <Fragment key={institution.id}>
                    <tr data-sigapro-portfolio-row="true" className="hover:bg-sky-50/60">
                      <td className="max-w-0 px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <Building2 aria-hidden="true" className="h-5 w-5 shrink-0 text-sky-700" />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-950" title={institution.name}>{institution.name}</p>
                            <p className="truncate text-xs text-slate-500" title={institution.subdomain}>{institution.subdomain || "Sem subdomínio"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="max-w-0 px-4 py-3"><p className="truncate text-slate-700" title={institution.city}>{institution.city || "Não informado"}{institution.state ? " / " + institution.state : ""}</p></td>
                      <td className="max-w-0 px-4 py-3"><p className="truncate text-slate-700" title={institution.plan}>{institution.plan || "A definir"}</p></td>
                      <td className="px-4 py-3">
                        <span className={"inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold " +
                          (institution.status === "ativo" ? "border-emerald-200 bg-emerald-50 text-emerald-800" :
                           institution.status === "suspenso" ? "border-rose-200 bg-rose-50 text-rose-800" :
                           "border-amber-200 bg-amber-50 text-amber-900")}>
                          {institution.status === "ativo" ? "Ativa" : institution.status === "suspenso" ? "Suspensa" : "Em implantação"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" aria-controls={panelId} aria-expanded={expanded}
                          onClick={() => setOpenId((id) => id === institution.id ? null : institution.id)}
                          className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 hover:border-sky-300 hover:bg-sky-50">
                          {expanded ? "Recolher" : "Detalhes"}
                          <ChevronDown aria-hidden="true" className={"h-4 w-4 transition-transform " + (expanded ? "rotate-180" : "")}/>
                        </button>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr><td colSpan={5} id={panelId} data-sigapro-portfolio-details="open" className="bg-slate-50/70 p-4">
                        {renderDetails(institution)}
                      </td></tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {paged.total > 0 ? (
        <nav aria-label="Paginação de prefeituras" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
          <span className="text-xs text-slate-600" aria-live="polite">
            Mostrando {paged.start+1}–{paged.end} de {paged.total} · Página {paged.page} de {paged.totalPages}
          </span>
          <div className="flex gap-2">
            <button type="button" disabled={paged.page===1} onClick={() => { setOpenId(null); setPage(paged.page-1); }}
              className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 disabled:opacity-40">
              <ChevronLeft aria-hidden="true" className="h-4 w-4"/>Anterior
            </button>
            <button type="button" disabled={paged.page>=paged.totalPages} onClick={() => { setOpenId(null); setPage(paged.page+1); }}
              className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 disabled:opacity-40">
              Próxima<ChevronRight aria-hidden="true" className="h-4 w-4"/>
            </button>
          </div>
        </nav>
      ) : null}
    </section>
  );
}
