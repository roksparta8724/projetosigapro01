/**
 * Formatação exclusiva da camada visual do Dashboard.
 * Identificadores de domínio são preservados nas contagens e no banco.
 */
const officialLabels: Record<string, string> = {
  aprovacao_projeto: "Aprovação de projeto",
  aprovacao_projeto_residencial: "Aprovação de projeto residencial",
  aprovacao_projeto_comercial: "Aprovação de projeto comercial",
  licenciamento: "Licenciamento",
  analise_tecnica: "Análise técnica",
  pendencia_documental: "Pendência documental",
  habite_se: "Habite-se",
};

export function displayDashboardCategoryLabel(value: string): string {
  const source = String(value || "").trim();
  if (!source) return "Não informado";
  const key = source.toLocaleLowerCase("pt-BR");
  if (officialLabels[key]) return officialLabels[key];
  if (!source.includes("_")) return source;
  const readable = source.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  return readable.charAt(0).toLocaleUpperCase("pt-BR") + readable.slice(1);
}
