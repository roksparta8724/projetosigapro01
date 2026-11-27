/** Paginação determinística: nunca renderizar milhares de cards de uma só vez. */
export function paginateRegistry<T>(
  records: readonly T[],
  requestedPage: number,
  requestedPageSize = 15,
) {
  const pageSize =
    Number.isFinite(requestedPageSize) && requestedPageSize > 0
      ? Math.max(1, Math.floor(requestedPageSize))
      : 15;
  const total = records.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safeRequestedPage = Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1;
  const page = Math.min(pages, Math.max(1, safeRequestedPage));
  const offset = (page - 1) * pageSize;
  return {
    items: records.slice(offset, offset + pageSize),
    page,
    pages,
    total,
    from: total === 0 ? 0 : offset + 1,
    to: Math.min(total, offset + pageSize),
  };
}
