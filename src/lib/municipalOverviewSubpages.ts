/**
 * Explicit, bookmarkable administrative overview subpages.
 * /prefeitura retains its historic URL and existing permission boundary.
 */
export type MunicipalOverviewSubpage = "resumo" | "processos" | "pendencias" | "atividades";

export const MUNICIPAL_OVERVIEW_SUBPAGES: ReadonlyArray<{
  key: MunicipalOverviewSubpage;
  title: string;
  helper: string;
  path: string;
}> = [
  { key: "processos", title: "Processos", helper: "Consulta paginada", path: "/prefeitura/visao-geral/processos" },
  { key: "pendencias", title: "Pendências", helper: "Prazos e atenção", path: "/prefeitura/visao-geral/pendencias" },
  { key: "atividades", title: "Atividades", helper: "Últimas movimentações", path: "/prefeitura/visao-geral/atividades" },
  { key: "resumo", title: "Resumo", helper: "Indicadores essenciais", path: "/prefeitura/visao-geral/resumo" },
];

export function municipalOverviewSubpageFromPath(pathname: string): MunicipalOverviewSubpage {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const item = MUNICIPAL_OVERVIEW_SUBPAGES.find((page) => page.path === normalized);
  return item?.key ?? "resumo";
}

export function isMunicipalOverviewSubpagePath(pathname: string): boolean {
  // Every dedicated overview URL, including the final Resumo subpage,
  // belongs to the municipal overview. /prefeitura itself remains the
  // operational entry, so it must NOT be mistaken for an open summary.
  return MUNICIPAL_OVERVIEW_SUBPAGES.some((page) =>
    page.path !== "/prefeitura" && page.path === (pathname.replace(/\/+$/, "") || "/"),
  );
}
