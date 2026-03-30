export const externalTabs = [
  { value: "visao", label: "Visão geral", helper: "Resumo executivo", route: "/externo" },
  { value: "protocolar", label: "Protocolar", helper: "Novo protocolo", route: "/externo/protocolar" },
  { value: "controle", label: "Controle de processos", helper: "Acompanhamento", route: "/externo/controle" },
  { value: "pagamentos", label: "Pagamentos", helper: "Guias e pendências", route: "/externo/pagamentos" },
  { value: "historico", label: "Histórico", helper: "Movimentações", route: "/externo/historico" },
  { value: "mensagens", label: "Mensagens", helper: "Proprietários vinculados", route: "/externo/mensagens" },
];

export function getExternalTabByPath(pathname: string) {
  return externalTabs.find((tab) => tab.route === pathname) ?? externalTabs[0];
}
