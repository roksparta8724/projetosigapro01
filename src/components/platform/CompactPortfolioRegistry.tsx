import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Building2, Search } from "lucide-react";
import { paginateMunicipalItems } from "@/lib/municipalListPagination";
import type { Institution } from "@/lib/platform";
import "@/styles/compact-portfolio-directory-20261124.css";

type Props = {
  institutions: readonly Institution[];
  renderDetails: (institution: Institution) => ReactNode;
  pageSize?: number;
};

/** Only municipality clients belong in the municipal portfolio, not SIGAPRO's technical tenant. */
export function filterInstitutionPortfolio(
  institutions: readonly Institution[], query = "", status = "todos", plan = "todos",
): Institution[] {
  const q = query.trim().toLocaleLowerCase("pt-BR");
  return institutions.filter((item) => {
    if (item.subdomain?.toLowerCase() === "sigapro-plataforma" || item.name.trim().toLowerCase() === "sigapro plataforma") return false;
    return (status === "todos" || item.status === status) && (plan === "todos" || item.plan === plan)
      && (!q || [item.name,item.city,item.state,item.subdomain,item.id]
        .some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(q)));
  });
}

/** Client-side page rendering stays shallow; no full municipality detail cards are mounted. */
export function CompactPortfolioRegistry({ institutions, renderDetails, pageSize = 12 }: Props) {
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("todos");
  const [plan, setPlan] = useState("todos");
  const planOptions = useMemo(() => [...new Set(
    institutions.filter((item) => item.subdomain !== "sigapro-plataforma")
      .map((item) => item.plan).filter(Boolean),
  )].sort((a,b) => a.localeCompare(b,"pt-BR")), [institutions]);
  const filtered = useMemo(
    () => filterInstitutionPortfolio(institutions,query,status,plan),
    [institutions,query,status,plan],
  );
  const paged = useMemo(
    () => paginateMunicipalItems(filtered, page, pageSize),
    [filtered, page, pageSize],
  );
  useEffect(() => {
    if (paged.page !== page) setPage(paged.page);
  }, [page, paged.page]);

  return (
    <section className="min-w-0 space-y-4" data-sigapro-portfolio-registry="compact" aria-label="Carteira institucional">
      <div data-sigapro-portfolio-filters="true" className="sig-portfolio-toolbar min-w-0 rounded-2xl border p-3 sm:p-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <p className="sig-portfolio-count text-sm leading-5">
            <span className="font-bold tabular-nums">{paged.total.toLocaleString("pt-BR")}</span>
            {" "}prefeituras encontradas de {filterInstitutionPortfolio(institutions).length.toLocaleString("pt-BR")} cadastradas
          </p>
          <span className="sig-portfolio-context rounded-full border px-3 py-1 text-[11px] font-semibold">
            Prefeituras · contratos municipais
          </span>
        </div>
        <div className="mt-3 grid min-w-0 gap-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(125px,0.24fr)_minmax(125px,0.24fr)]">
          <label className="relative block min-w-0">
            <Search aria-hidden="true" className="sig-portfolio-search-icon absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <span className="sr-only">Pesquisar prefeitura, cidade, UF ou subdomínio</span>
            <input aria-label="Pesquisar prefeitura, cidade, UF ou subdomínio" value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(1); setOpenId(null); }}
              placeholder="Pesquisar prefeitura, cidade ou subdomínio..."
              className="sig-portfolio-control h-11 w-full min-w-0 rounded-xl border py-2 pl-10 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-400" />
          </label>
          <select aria-label="Filtrar prefeitura por situação" value={status}
            onChange={(event) => { setStatus(event.target.value); setPage(1); setOpenId(null); }}
            className="sig-portfolio-control h-11 min-w-0 w-full rounded-xl border px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
            <option value="todos">Todos os status</option>
            <option value="ativo">Ativas</option>
            <option value="implantacao">Implantação</option>
            <option value="suspenso">Suspensas</option>
          </select>
          <select aria-label="Filtrar prefeitura por plano" value={plan}
            onChange={(event) => { setPlan(event.target.value); setPage(1); setOpenId(null); }}
            className="sig-portfolio-control h-11 min-w-0 w-full rounded-xl border px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-sky-400">
            <option value="todos">Todos os planos</option>
            {planOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      </div>
      {paged.total === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">Nenhuma Prefeitura cadastrada.</p>
      ) : (
        <div data-mobile-portfolio-scroll="true" className="min-w-0 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table data-sigapro-portfolio-table="true" className="w-full min-w-[740px] table-fixed text-left text-sm" aria-label="Prefeituras da carteira">
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
                      <td data-mobile-label="Prefeitura" className="max-w-0 px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <Building2 aria-hidden="true" className="h-5 w-5 shrink-0 text-sky-700" />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-950" title={institution.name}>{institution.name}</p>
                            <p className="truncate text-xs text-slate-500" title={institution.subdomain}>{institution.subdomain || "Sem subdomínio"}</p>
                          </div>
                        </div>
                      </td>
                      <td data-mobile-label="Município" className="max-w-0 px-4 py-3"><p className="truncate text-slate-700" title={institution.city}>{institution.city || "Não informado"}{institution.state ? " / " + institution.state : ""}</p></td>
                      <td data-mobile-label="Plano" className="max-w-0 px-4 py-3"><p className="truncate text-slate-700" title={institution.plan}>{institution.plan || "A definir"}</p></td>
                      <td data-mobile-label="Situação" className="px-4 py-3">
                        <span className={"inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold " +
                          (institution.status === "ativo" ? "border-emerald-200 bg-emerald-50 text-emerald-800" :
                           institution.status === "suspenso" ? "border-rose-200 bg-rose-50 text-rose-800" :
                           "border-amber-200 bg-amber-50 text-amber-900")}>
                          {institution.status === "ativo" ? "Ativa" : institution.status === "suspenso" ? "Suspensa" : "Em implantação"}
                        </span>
                      </td>
                      <td data-mobile-label="Ações" className="px-4 py-3 text-right">
                        <button type="button" aria-controls={panelId} aria-expanded={expanded}
                          onClick={() => setOpenId((id) => id === institution.id ? null : institution.id)}
                          className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-900 hover:border-sky-300 hover:bg-sky-50">
                          {expanded ? "Recolher" : "Detalhes"}
                          <ChevronDown aria-hidden="true" className={"h-4 w-4 transition-transform " + (expanded ? "rotate-180" : "")}/>
                        </button>
                      </td>
                    </tr>
                    {expanded ? (
                      <tr data-sigapro-portfolio-details-row="true"><td colSpan={5} id={panelId} data-sigapro-portfolio-details="open" className="bg-slate-50/70 p-4">
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
