export const externalTabs = [
  { value: "visao", label: "Resumo", helper: "Situação dos seus processos", route: "/externo" },
  { value: "protocolar", label: "Protocolar", helper: "Novo protocolo", route: "/externo/protocolar" },
  { value: "controle", label: "Controle de processos", helper: "Acompanhamento", route: "/externo/controle" },
  { value: "pagamentos", label: "Pagamentos", helper: "Guias e pendências", route: "/externo/pagamentos" },
  { value: "historico", label: "Histórico", helper: "Movimentações", route: "/externo/historico" },
  { value: "mensagens", label: "Mensagens", helper: "Proprietários vinculados", route: "/externo/mensagens" },
];

export function getExternalTabByPath(pathname: string) {
  return (
    [...externalTabs]
      .sort((a, b) => b.route.length - a.route.length)
      .find((tab) => pathname === tab.route || pathname.startsWith(`${tab.route}/`)) ??
    externalTabs[0]
  );
}
