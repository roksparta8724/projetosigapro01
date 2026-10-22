/**
 * Bank lookup is an administrative convenience, NOT proof of a collection
 * agreement, PIX ownership, an active API or bank settlement.
 * Other institutions can always be entered manually using their official code.
 */
export const MUNICIPAL_BANK_DIRECTORY = [
  { code: "001", name: "Banco do Brasil" },
  { code: "033", name: "Santander" },
  { code: "041", name: "Banrisul" },
  { code: "070", name: "BRB — Banco de Brasília" },
  { code: "077", name: "Banco Inter" },
  { code: "104", name: "Caixa Econômica Federal" },
  { code: "237", name: "Bradesco" },
  { code: "260", name: "Nu Pagamentos" },
  { code: "341", name: "Itaú Unibanco" },
  { code: "422", name: "Banco Safra" },
  { code: "748", name: "Sicredi" },
  { code: "756", name: "Sicoob" },
] as const;

export type MunicipalBankMode = "manual" | "agreement" | "api";

export function findMunicipalBank(code: string | null | undefined) {
  return MUNICIPAL_BANK_DIRECTORY.find((bank) => bank.code === String(code || "").trim()) ?? null;
}

export function selectMunicipalBank(
  previous: { bankCode: string; bankName: string },
  selectedCode: string,
) {
  // Manual choices never destroy a previously persisted bank (including
  // institutions not in the featured directory).
  const found = findMunicipalBank(selectedCode);
  return found ? { bankCode: found.code, bankName: found.name } : previous;
}

export type BankChannelStatus = {
  route: "manual" | "agreement" | "api";
  automaticIssue: false;
  automaticSettlement: false;
  explanation: string;
};

/**
 * These modes describe the municipality's contract, NOT an installed adapter.
 * Do not represent a bank or CNAB layout as integrated until certified.
 */
export function describeMunicipalBankChannel(mode: MunicipalBankMode): BankChannelStatus {
  if (mode === "agreement") {
    return {
      route: "agreement", automaticIssue: false, automaticSettlement: false,
      explanation: "Convênio cadastrado para identificação. Emissão registrada, remessa CNAB e conciliação exigem o layout e a homologação do banco. Use apenas documentos oficiais até lá.",
    };
  }
  if (mode === "api") {
    return {
      route: "api", automaticIssue: false, automaticSettlement: false,
      explanation: "API bancária ainda não vinculada a um adaptador homologado. O SIGAPRO não emite nem confirma pagamentos por esta seleção.",
    };
  }
  return {
    route: "manual", automaticIssue: false, automaticSettlement: false,
    explanation: "PIX/baixa municipal: exige titularidade oficial e conferência pela Tesouraria. Não existe confirmação automática de pagamento.",
  };
}
