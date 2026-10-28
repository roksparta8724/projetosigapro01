/** Bank selection is MUNICIPAL and immutable per issued guide.
 * A banking registration, manual PIX key or agreement code is not a live API.
 * Never silently route an unconfigured/other bank to Mercado Pago.
 */
export type BankConnection = {
  provider?: string | null;
  status?: string | null;
  environment?: string | null;
};
export type IssuedGuideRoute = {
  collection_mode_snapshot?: string | null;
  payment_provider?: string | null;
  provider_environment?: string | null;
  bank_reference?: string | null;
};
export type CollectionRoute = { mode?: string | null; status?: string | null } | null;

export function resolveMunicipalChargeRoute(
 guide: IssuedGuideRoute, connection: BankConnection | null,
 active: CollectionRoute,
): "mercado_pago" | "municipal_system" | "bank_direct" | "manual" | "unconfigured" | "provider_mismatch" {
  if (guide.collection_mode_snapshot === "municipal_system") return "municipal_system";
  // The guide's saved mode takes precedence over a later administrative switch.
  if (!guide.collection_mode_snapshot && !guide.payment_provider && !guide.bank_reference &&
      active?.status === "active" && active.mode === "municipal_system") return "municipal_system";
  const boundProvider=String(guide.payment_provider||"").trim();
  const currentProvider=String(connection?.provider||"").trim();
  if (boundProvider && boundProvider !== "mercado_pago") {
    return boundProvider==="manual"?"manual":"bank_direct";
  }
  if (guide.bank_reference && !boundProvider) return "provider_mismatch";
  if (currentProvider === "bank_direct") return "bank_direct";
  if (currentProvider === "manual") return "manual";
  if (currentProvider !== "mercado_pago" || connection?.status !== "active")
    return "unconfigured";
  if (guide.provider_environment && guide.provider_environment !== connection.environment)
    return "provider_mismatch";
  return "mercado_pago";
}

export function municipalChargeRouteMessage(route: ReturnType<typeof resolveMunicipalChargeRoute>) {
  switch (route) {
    case "municipal_system": return "Esta guia utiliza o sistema de arrecadação da Prefeitura. Abra ou importe o PDF oficial emitido pelo fornecedor municipal; não criar cobrança no Mercado Pago.";
    case "bank_direct": return "A Prefeitura usa banco ou convênio próprio. Nenhuma cobrança Mercado Pago será criada. Para emissão automática, homologue o adaptador/API com o banco; até lá utilize a guia oficial/importação controlada.";
    case "manual": return "Esta Prefeitura utiliza arrecadação manual/PIX próprio. A Tesouraria deve conferir o pagamento e anexar a guia oficial; o SIGAPRO não emitirá boleto Mercado Pago nem dará baixa automática.";
    case "provider_mismatch": return "A guia já tem vínculo bancário de outro provedor ou ambiente. Alterar o banco não autoriza reemitir ou consultar uma ordem no Mercado Pago.";
    case "unconfigured": return "Não existe provedor bancário automático ativo para esta Prefeitura. Configure a modalidade e o banco em Guias e Arrecadação; o Mercado Pago nunca é escolhido automaticamente.";
    default: return "";
  }
}

/** Printed providers are controlled values: never claim Mercado Pago for an
 * unknown historical bank or a manual collection configuration. */
export function displayGuidePaymentProvider(
  stored: string | null | undefined,
  current?: string | null,
): "mercado_pago" | "bank_direct" | "manual" {
  const chosen=String(stored||current||"").trim();
  if (chosen==="mercado_pago" || chosen==="bank_direct") return chosen;
  return "manual";
}
