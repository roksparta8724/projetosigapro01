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
