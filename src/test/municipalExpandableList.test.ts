import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { paginateMunicipalItems } from "@/lib/municipalListPagination";

describe("Municipal compact expandable listings", () => {
  it("shows just 20 rows per page with 2,000 official processes", () => {
    const all = Array.from({ length: 2000 }, (_, index) => index + 1);
    expect(paginateMunicipalItems(all, 1).items).toEqual(all.slice(0, 20));
    expect(paginateMunicipalItems(all, 50).items).toEqual(all.slice(980, 1000));
    expect(paginateMunicipalItems(all, 100).items).toEqual(all.slice(-20));
    expect(paginateMunicipalItems(all, 100).totalPages).toBe(100);
  });
  it("handles empty results, invalid pages and clamping", () => {
    expect(paginateMunicipalItems([], 999).items).toEqual([]);
    expect(paginateMunicipalItems([1, 2, 3], -10, 2).items).toEqual([1, 2]);
    expect(paginateMunicipalItems([1, 2, 3], 99, 2).items).toEqual([3]);
    expect(paginateMunicipalItems([1, 2, 3], Number.NaN, 2).page).toBe(1);
  });
  it("renders compact disclosure links and paginated process and activity views", () => {
    const code = readFileSync(resolve(process.cwd(), "src/pages/saas/TenantAdminPage.tsx"), "utf8");
    expect(code).toContain('data-municipal-queue-row="true"');
    expect(code).toContain('data-municipal-activity-card="true"');
    expect(code).toContain("<details");
    expect(code).toContain("<summary");
    expect(code).toContain("Ver detalhes");
    expect(code).toContain("Ocultar detalhes");
    expect(code).toContain('data-municipal-queue-paged="true"');
    expect(code).toContain('data-municipal-history-paged="true"');
    expect(code).toContain("queuePageData.items.map");
    expect(code).toContain("historyPageData.items.map");
  });
});
