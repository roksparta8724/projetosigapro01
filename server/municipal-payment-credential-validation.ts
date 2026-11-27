/**
 * Protect bank credentials per municipality and per provider environment.
 * A blank field retains a secret ONLY for the same provider + same environment.
 * The database function enforces the same rule as a second line of defense.
 */
export type PublicMunicipalPaymentConnection = {
  provider?: string;
  environment?: string;
  credentials_configured?: boolean;
  webhook_configured?: boolean;
  status?: string;
  last_test_status?: string | null;
};
export type CredentialSelection = {
  provider: string;
  environment: string;
  accessToken: string;
  webhookSecret: string;
};
export function assertMunicipalCredentialSave(
  selection: CredentialSelection,
  existing: PublicMunicipalPaymentConnection | null | undefined,
): void {
  const { provider, environment, accessToken, webhookSecret } = selection;
  if (!["mercado_pago", "bank_direct", "manual"].includes(provider))
    throw new Error("Selecione um provedor de pagamento válido.");
  if (!["test", "production"].includes(environment))
    throw new Error("Selecione homologação ou produção.");
  if (accessToken.length > 4096 || webhookSecret.length > 2048)
    throw new Error("Credencial maior que o limite permitido.");
  if (provider !== "mercado_pago") {
    if (accessToken || webhookSecret)
      throw new Error("Credenciais do Mercado Pago não podem ser usadas em bancos ou sistemas municipais diferentes. Configure o conector específico.");
    return;
  }
  const same = existing?.provider === provider && existing?.environment === environment;
  if (!accessToken && !(same && existing?.credentials_configured))
    throw new Error("Informe o Access Token deste ambiente. A chave de teste nunca é reutilizada em produção.");
  if (environment === "production" && !webhookSecret && !(same && existing?.webhook_configured))
    throw new Error("Informe a chave secreta do Webhook de produção. Ela é necessária para a confirmação automática.");
}
export function assertMunicipalCredentialActivation(
  connection: PublicMunicipalPaymentConnection | null | undefined,
): void {
  if (!connection) throw new Error("Conexão bancária não encontrada. Salve a configuração.");
  if (connection.provider === "bank_direct")
    throw new Error("Banco ou convênio direto exige um conector bancário homologado antes da ativação automática.");
  if (connection.provider === "manual") return;
  if (connection.provider !== "mercado_pago")
    throw new Error("Provedor bancário não reconhecido.");
  if (!connection.credentials_configured || connection.last_test_status !== "ok")
    throw new Error("Salve e teste a credencial bancária antes de ativar.");
  if (connection.environment === "production" && !connection.webhook_configured)
    throw new Error("Configure o segredo do Webhook de produção antes de ativar.");
}
