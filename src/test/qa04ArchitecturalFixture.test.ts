import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ProcessRecord } from "@/lib/platform";
import { isQa04ArchitecturalImportAllowed, QA04_DOCUMENT_LABELS, QA04_SITE_GEOMETRY, getQa04GeometryChecks } from "@/lib/qa04ArchitecturalFixture";
import { buildProcessDocuments, type ProcessDocument } from "@/lib/platform";
const fixture = { id: "915e1c63-ebda-4cdd-8e95-34316d9e0089",
  protocol: "PM-2026-00004", title: "QA-URBAN-E2E-20261024 PROCESSO A FICTÍCIO" } as ProcessRecord;
describe("QA 04 document fixture stays isolated", () => {
  it("keeps all four proposed setbacks mathematically compatible with the plot", () => {
    expect(QA04_SITE_GEOMETRY).toMatchObject({
      lotFrontM: 12, lotDepthM: 25, buildingWidthM: 10, buildingDepthM: 8,
      frontSetbackM: 5, leftSetbackM: 1, rightSetbackM: 1, rearSetbackM: 12,
    });
    expect(getQa04GeometryChecks()).toEqual({
      widthFits: true, depthFits: true, terrainM2: 300, builtAreaM2: 80, coveragePct: 26.67,
    });
  });
  it("does not mistake drawn setbacks for municipal legal minima", () => {
    const code = readFileSync(resolve(process.cwd(), "src/lib/qa04ArchitecturalFixture.ts"), "utf8");
    expect(code).toContain("RECUOS MINIMOS LEGAIS E ZONEAMENTO OFICIAL: NAO FORNECIDOS.");
    expect(code).toContain("Permeabilidade: NAO DETERMINADA");
    expect(code).toContain("SIGAPRO-QA04-PLANTA-IMPLANTACAO-V2.pdf");
    expect(code).toContain('pdf.addPage("a3", "landscape")');
  });
  it("makes the existing QA04 V1 replaceable without hiding the revision history", () => {
    const ui = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
    expect(ui).toContain("Atualizar planta com recuos (V2)");
    expect(ui).toContain("upgradeRemoteQa04ArchitecturalPlanV2(");
    const sql = readFileSync(resolve(process.cwd(), "neon/qa/20261102_qa04_architectural_site_plan_v2.sql"), "utf8");
    expect(sql).toContain("is_valid=false");
    expect(sql).toContain("INSERT INTO public.process_audit_entries");
    expect(sql).toContain("process_id=_process_id");
  });
  it("selects the latest available architectural revision for the active document view", () => {
    const base = {
      id: "first", label: "Projeto Arquitetônico", required: true, uploaded: true,
      signed: false, version: 1, source: "prefeitura", reviewStatus: "pendente",
    } as ProcessDocument;
    const documents = buildProcessDocuments("qa04_custom_category", [
      { ...base, version: 2, id: "v2", fileName: "SIGAPRO-QA04-PLANTA-IMPLANTACAO-V2.pdf" },
      { ...base, version: 1, id: "v1", fileName: "SIGAPRO-QA04-PLANTA-FICTICIA.pdf" },
    ]);
    expect(documents.length).toBe(1);
    expect(documents[0].id).toBe("v2");
  });

  it("provides exactly four mandatory QA document types", () => {
    expect(QA04_DOCUMENT_LABELS).toEqual([
      "Projeto Arquitetônico", "Memorial Descritivo", "ART/RRT", "Escritura/Matrícula",
    ]);
  });
  it("keeps the QA fixture usable by platform master without admin privilege override", () => {
    const page = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
    const begin = page.indexOf("const handleImportQa04ArchitecturalFixture =");
    const end = page.indexOf("const handleUploadMissingDocument =", begin);
    expect(begin).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(begin);
    const qaHandler = page.slice(begin, end);
    expect(qaHandler).not.toContain('allowMunicipalAdmin: true');
    expect(qaHandler).toContain('runProcessAction("qa04-import-project"');
    expect(qaHandler).toContain('canImportQa04Fixture');
    expect(page).toContain('processActionStatus ? (');
    expect(page).toContain('!text-white');
  });

  it("only exposes the test import to platform master for the exact isolated QA record", () => {
    expect(isQa04ArchitecturalImportAllowed({ isolatedQa: true, role: "master_admin", process: fixture })).toBe(true);
    expect(isQa04ArchitecturalImportAllowed({ isolatedQa: true, role: "master_ops", process: fixture })).toBe(true);
    expect(isQa04ArchitecturalImportAllowed({ isolatedQa: true, role: "prefeitura_admin", process: fixture })).toBe(false);
    expect(isQa04ArchitecturalImportAllowed({ isolatedQa: false, role: "master_admin", process: fixture })).toBe(false);
    expect(isQa04ArchitecturalImportAllowed({ isolatedQa: true, role: "analista", process: fixture })).toBe(false);
    expect(isQa04ArchitecturalImportAllowed({ isolatedQa: true, role: "master_admin", process: { ...fixture, title: "Outra coisa" } })).toBe(false);
    expect(isQa04ArchitecturalImportAllowed({ isolatedQa: true, role: "master_admin", process: { ...fixture, id: "other-id" } })).toBe(false);
  });
});
