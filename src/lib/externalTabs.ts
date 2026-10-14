export const externalTabs = [
  { value: "controle", label: "Processos", helper: "Seus processos protocolados", route: "/externo/controle" },
  { value: "protocolar", label: "Protocolar", helper: "Novo protocolo", route: "/externo/protocolar" },
  { value: "pagamentos", label: "Pagamentos", helper: "Guias e pendências", route: "/externo/pagamentos" },
  { value: "historico", label: "Histórico", helper: "Movimentações", route: "/externo/historico" },
  { value: "mensagens", label: "Mensagens", helper: "Proprietários vinculados", route: "/externo/mensagens" },
  { value: "visao", label: "Resumo", helper: "Visão geral da conta", route: "/externo" },
];

export function getExternalTabByPath(pathname: string) {
  return (
    [...externalTabs]
      .sort((a, b) => b.route.length - a.route.length)
      .find((tab) => pathname === tab.route || pathname.startsWith(`${tab.route}/`)) ??
    externalTabs[0]
  );
}
