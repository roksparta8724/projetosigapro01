/**
 * Ephemeral, same-tab invalidation for the municipality's read-only AI audit.
 * This event carries only the tenant id; no legal approval or data mutation.
 */
type AuditChangeListener = (municipalityId: string) => void;
const listeners = new Set<AuditChangeListener>();

export function subscribeUrbanLegalAuditInvalidations(listener: AuditChangeListener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function notifyUrbanLegalAuditInvalidation(municipalityId: string): void {
  if (!municipalityId) return;
  for (const listener of listeners) listener(municipalityId);
}
