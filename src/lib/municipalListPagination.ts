/** Display-only pagination of records already loaded for one municipality.
 * Backend cursor pagination may be added when workloads exceed in-memory data. */
export function paginateMunicipalItems<T>(items: readonly T[], requestedPage: number, pageSize = 20) {
  const size = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 20;
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1;
  const page = Math.min(totalPages, Math.max(1, safePage));
  const start = (page - 1) * size;
  const end = Math.min(total, start + size);
  return { items: items.slice(start, end), total, page, totalPages, start, end };
}
