/**
 * Livro financeiro municipal: a numeração oficial pertence à pasta/processo.
 * Uma pasta pode ter várias guias; agrupar por ID evita duplicar a sequência
 * e impedir a divisão de uma pasta entre páginas.
 *
 * Não agrupar pelo número oficial: números iguais em IDs distintos
 * constituem possível conflito, não autorização para mesclar registros.
 */
export function groupFinancialGuidesByProcess<P extends { id: string }, G>(
  entries: readonly { process: P; guide: G }[],
): Array<{ process: P; guides: G[] }> {
  const groups = new Map<string, { process: P; guides: G[] }>();
  for (const entry of entries) {
    const existing = groups.get(entry.process.id);
    if (existing) existing.guides.push(entry.guide);
    else groups.set(entry.process.id, { process: entry.process, guides: [entry.guide] });
  }
  return [...groups.values()];
}

/** Read-only integrity signal. Does not renumber, mutate or merge processes. */
export function findOfficialProcessSequenceConflicts<P extends { id: string }, G>(
  entries: readonly { process: P; guide: G }[],
  sequenceKey: (process: P) => string | null,
): string[] {
  const ownerBySequence = new Map<string, string>();
  const conflicts = new Set<string>();
  for (const { process } of entries) {
    const key = sequenceKey(process);
    if (!key) continue;
    const owner = ownerBySequence.get(key);
    if (owner === undefined) ownerBySequence.set(key, process.id);
    else if (owner !== process.id) conflicts.add(key);
  }
  return [...conflicts];
}
