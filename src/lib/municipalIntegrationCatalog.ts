/**
 * Municipal collection onboarding catalogue.
 * This is NOT an operational adapter registry. The backend registry is the
 * sole authority for automatic issue/settlement capabilities.
 * A listed provider is a selectable municipal supplier, NOT an integration.
 */
export type MunicipalIntegrationProfile = {
  code: string;
  name: string;
  kind: "municipal_erp" | "bank";
  requirements: readonly string[];
  recommendation: string;
};
export const MUNICIPAL_INTEGRATION_PROFILES: readonly MunicipalIntegrationProfile[] = [
  {
    code: "govbr_ar",
    name: "GOVBR — Administração de Receitas (AR)",
    kind: "municipal_erp",
    requirements: ["API de arrecadação oficialmente disponibilizada ao município", "credenciais, homologação e contratos do fornecedor", "rotinas de emissão, PDF, consulta e baixa documentadas"],
    recommendation: "A importação do PDF da guia oficial já é prevista. Emissão e baixa automáticas dependem da API e do adaptador GOVBR/AR."
  },
  {
    code: "santander_033",
    name: "Santander (033)",
    kind: "bank",
    requirements: ["convênio de cobrança/PIX da Prefeitura", "credenciais da API contratada e certificado quando exigido", "homologação bancária para boleto/PIX e retorno"],
    recommendation: "Convênio e banco podem ser cadastrados. Emissão e baixa automáticas dependem do adaptador Santander."
  },
  {
    code: "itau_341",
    name: "Itaú (341)",
    kind: "bank",
    requirements: ["convênio de cobrança/PIX da Prefeitura", "client ID, credenciais e certificado exigidos pelo Itaú", "homologação do fluxo mTLS, boleto/PIX e retorno"],
    recommendation: "Convênio e banco podem ser cadastrados. Emissão e baixa automáticas dependem do adaptador Itaú."
  },
  {
    code: "banco_brasil_001",
    name: "Banco do Brasil (001)",
    kind: "bank",
    requirements: ["convênio de arrecadação", "contrato e manual técnico da API ou arquivos de remessa/retorno", "homologação do banco"],
    recommendation: "Não há conector automático homologado neste SIGAPRO."
  },
  {
    code: "caixa_104",
    name: "Caixa Econômica Federal (104)",
    kind: "bank",
    requirements: ["convênio de arrecadação", "integração oficial disponibilizada ao município", "homologação bancária"],
    recommendation: "Não há conector automático homologado neste SIGAPRO."
  },
  {
    code: "bradesco_237",
    name: "Bradesco (237)",
    kind: "bank",
    requirements: ["convênio de arrecadação", "documentação de cobrança/PIX", "homologação bancária"],
    recommendation: "Não há conector automático homologado neste SIGAPRO."
  },
  {
    code: "sicredi_748",
    name: "Sicredi (748)",
    kind: "bank",
    requirements: ["contrato de cobrança da Prefeitura", "documentação de API/retorno", "homologação bancária"],
    recommendation: "Não há conector automático homologado neste SIGAPRO."
  },
  {
    code: "sicoob_756",
    name: "Sicoob (756)",
    kind: "bank",
    requirements: ["contrato de cobrança da Prefeitura", "documentação de API/retorno", "homologação bancária"],
    recommendation: "Não há conector automático homologado neste SIGAPRO."
  }
] as const;

export function getMunicipalIntegrationProfile(code: string | null | undefined) {
  return MUNICIPAL_INTEGRATION_PROFILES.find(x => x.code === String(code || "").trim().toLowerCase()) ?? null;
}
