import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ProcessRecord } from "@/lib/platform";
import { isQa04ArchitecturalImportAllowed, QA04_DOCUMENT_LABELS } from "@/lib/qa04ArchitecturalFixture";
const fixture = { id: "915e1c63-ebda-4cdd-8e95-34316d9e0089",
  protocol: "PM-2026-00004", title: "QA-URBAN-E2E-20261024 PROCESSO A FICTÍCIO" } as ProcessRecord;
describe("QA 04 document fixture stays isolated", () => {
  it("provides exactly four mandatory QA document types", () => {
    expect(QA04_DOCUMENT_LABELS).toEqual([
      "Projeto Arquitetônico", "Memorial Descritivo", "ART/RRT", "Escritura/Matrícula",
    ]);
  });
  it("does not deadlock the only allowed role behind the generic municipal admin guard", () => {
    const page = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
    const begin = page.indexOf("const handleImportQa04ArchitecturalFixture =");
    const end = page.indexOf("const handleUploadMissingDocument =", begin);
    expect(begin).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(begin);
    const qaHandler = page.slice(begin, end);
    expect(qaHandler).toContain('allowMunicipalAdmin: true');
    expect(qaHandler).toContain('runProcessAction("qa04-import-project"');
    expect(qaHandler).toContain('canImportQa04Fixture');
    expect(page).toContain('processActionStatus ? (');
    expect(page).toContain('!text-white');
  });

  it("only exposes the import to an admin on the exact isolated QA record", () => {
    expect(isQa04ArchitecturalImportAllowed({ isolatedQa: true, role: "prefeitura_admin", process: fixture })).toBe(true);
    expect(isQa04ArchitecturalImportAllowed({ isolatedQa: false, role: "prefeitura_admin", process: fixture })).toBe(false);
    expect(isQa04ArchitecturalImportAllowed({ isolatedQa: true, role: "analista", process: fixture })).toBe(false);
    expect(isQa04ArchitecturalImportAllowed({ isolatedQa: true, role: "prefeitura_admin", process: { ...fixture, title: "Outra coisa" } })).toBe(false);
    expect(isQa04ArchitecturalImportAllowed({ isolatedQa: true, role: "prefeitura_admin", process: { ...fixture, id: "other-id" } })).toBe(false);
  });
});
