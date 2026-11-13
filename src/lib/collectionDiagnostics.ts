/** Human-readable errors for the municipal collection console.
 * Do not infer "migration pending" from generic "not found": a JWT/JWK
 * signing-key mismatch must never be hidden behind a database warning.
 */
export function isCollectionAuthError(message: string) {
  return /jwk\s+not\s+found|jwt|jwks|invalid\s+token|invalid\s+signature|authentication\s+failed|token\s+expired|authorization\s+failed|unauthorized|autentica[cç][aã]o necess[aá]ria/i.test(message);
}

export function isCollectionSchemaMissing(message: string) {
  return /PGRST202|PGRST205|schema\s+cache|function\s+.*does\s+not\s+exist|relation\s+.*does\s+not\s+exist|could not find the function/i.test(message);
}

export function municipalCollectionError(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error || "");
  if (isCollectionAuthError(value)) {
    return "Sessão de acesso incompatível ou expirada (assinatura JWT/JWK). Saia do SIGAPRO e entre novamente no ambiente correto. Nenhum dado foi salvo. Se persistir, confira a configuração de autenticação do Neon.";
  }
  if (isCollectionSchemaMissing(value)) {
    return "A estrutura de arrecadação ainda não está disponível no banco conectado a ESTE endereço. A homologação e a produção possuem migrações independentes; nenhuma configuração foi salva.";
  }
  return value || "Não foi possível acessar a configuração municipal.";
}

/** A failure saying "indisponível" or "não salva" must NEVER be rendered green. */
export function isCollectionSuccessMessage(message: string): boolean {
  const value = message.trim().toLocaleLowerCase("pt-BR");
  if (!value || /(?:não|nao|erro|falha|indispon[ií]vel|pendente|incompat[ií]vel|n[aã]o foi|sem acesso|n[aã]o configurad|n[aã]o confirmou|bloquead|expirad|inv[aá]lid)/i.test(value)) {
    return false;
  }
  return /(?:conex[aã]o salva|configura[cç][aã]o salva|ativad[ao] com sucesso|conex[aã]o validada|dados banc[aá]rios e pix salvos|fornecedor validado|teste conclu[ií]do com sucesso)/i.test(value);
}
