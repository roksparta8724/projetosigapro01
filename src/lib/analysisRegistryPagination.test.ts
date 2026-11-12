import { describe, expect, it } from "vitest";
import { paginateRegistry } from "./analysisRegistryPagination";

describe("SIGAPRO — listagem de milhares de processos", () => {
  const records = Array.from({ length: 2003 }, (_, i) => ({ id: i + 1 }));

  it("exibe somente os 15 primeiros sem perder o total real", () => {
    const page = paginateRegistry(records, 1);
    expect(page).toMatchObject({ page: 1, pages: 134, total: 2003, from: 1, to: 15 });
    expect(page.items.map((x) => x.id)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
  });

  it("permite alcançar a última página sem renderização excessiva", () => {
    const page = paginateRegistry(records, 999999);
    expect(page).toMatchObject({ page: 134, total: 2003, from: 1996, to: 2003 });
    expect(page.items).toHaveLength(8);
  });

  it("mantém lista vazia e páginas inválidas em estado estável", () => {
    expect(paginateRegistry([], NaN)).toMatchObject({ items: [], page: 1, pages: 1, total: 0, from: 0, to: 0 });
    expect(paginateRegistry(records, -5).page).toBe(1);
    expect(paginateRegistry(records, 2, 0).items).toHaveLength(15);
    expect(paginateRegistry(records, 2, 30).items[0].id).toBe(31);
  });

  it("não altera a coleção original nem a ordem dos registros", () => {
    const source = Object.freeze([1, 2, 3, 4, 5]);
    const result = paginateRegistry(source, 2, 2);
    expect(result.items).toEqual([3, 4]);
    expect(source).toEqual([1, 2, 3, 4, 5]);
  });
});
