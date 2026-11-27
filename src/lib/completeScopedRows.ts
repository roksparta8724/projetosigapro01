/** Fetch the complete authorized result without bypassing RLS or trusting a
 * truncated page. A partial continuation must never be reported as complete. */
export type ScopedRowResult<T> = { data: T[] | null; error: unknown };
export async function collectCompleteScopedRows<T extends { id?: unknown }>(
  readPage: (offset: number, pageSize: number) => PromiseLike<ScopedRowResult<T>>,
  pageSize = 500,
  maxRows = 200000,
): Promise<ScopedRowResult<T>> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || !Number.isInteger(maxRows) || maxRows < pageSize)
    throw new Error("Limites inválidos de paginação.");
  const rows: T[] = [];
  const seen = new Set<string>();
  for (let offset = 0; offset <= maxRows; offset += pageSize) {
    const result = await readPage(offset, pageSize);
    if (result.error) {
      if (offset === 0) return result;
      throw new Error("A continuação dos dados oficiais falhou. Nenhum resultado parcial foi aplicado.");
    }
    const page = result.data ?? [];
    if (!Array.isArray(page) || page.length > pageSize)
      throw new Error("Resposta inválida da paginação oficial.");
    for (const row of page) {
      const id = String(row.id ?? "");
      if (!id || seen.has(id))
        throw new Error("Os dados oficiais mudaram durante a paginação. Atualize para obter uma lista íntegra.");
      seen.add(id);
      rows.push(row);
    }
    if (rows.length > maxRows) throw new Error("A consulta excedeu o limite seguro de sincronização.");
    if (page.length < pageSize) return { data: rows, error: null };
  }
  throw new Error("A consulta excedeu o limite seguro de sincronização.");
}
