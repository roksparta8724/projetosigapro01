import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("marker workflow", () => {
  it("uses the topbar presets as the single marker catalog", () => {
    const selector = read("src/components/platform/MarkerSelector.tsx");
    const presets = read("src/hooks/useMarkerPresets.ts");

    expect(selector).toContain("Use os marcadores criados no ícone de Marcadores da barra superior.");
    expect(selector).not.toContain("Criar marcador");
    expect(selector).not.toContain("addPreset");
    expect(selector).not.toContain("removePreset");
    expect(presets).toContain('const MARKER_PRESETS_EVENT = "sigapro-marker-presets-updated"');
    expect(presets).toContain("window.setTimeout(() =>");
  });

  it("shows compact highlighted process markers in the principal work queues", () => {
    const protocol = read("src/pages/saas/ProtocolDeskPage.tsx");
    const analysis = read("src/pages/saas/AnalystDeskPage.tsx");
    const finance = read("src/pages/saas/FinanceDeskPage.tsx");
    const financeProtocols = read("src/pages/saas/FinanceProtocolsPage.tsx");
    const externalControl = read("src/pages/saas/ExternalProcessControlPage.tsx");

    expect(protocol).toContain("<MarkerSelector");
    expect(protocol).toContain("protocolMarkerLinks");
    expect(protocol).toContain("markerFilteredProcesses");
    expect(analysis).toContain("<MarkerSelector");
    expect(finance).toContain("<MarkerSelector");
    expect(financeProtocols).toContain("<MarkerSelector");
    expect(externalControl).toContain("<MarkerSelector");
  });

  it("offers the same marker catalog on the process and on every document surface", () => {
    const detail = read("src/pages/saas/ProcessDetailPage.tsx");
    const analysis = read("src/pages/saas/DocumentAnalysisPage.tsx");
    const viewer = read("src/pages/saas/DocumentViewerPage.tsx");
    const documentAssignments = read("src/hooks/useDocumentMarkerAssignments.ts");

    expect(detail).toContain('subjectLabel="processo"');
    expect(detail).toContain('subjectLabel="documento"');
    expect(detail).toContain("documentMarkers.getTags(process.id, document.id)");
    expect(analysis).toContain('subjectLabel="documento"');
    expect(viewer).toContain('subjectLabel="documento"');
    expect(documentAssignments).toContain('const STORAGE_PREFIX = "sigapro-document-markers"');
  });

  it("renders applied markers prominently instead of large process cards", () => {
    const selector = read("src/components/platform/MarkerSelector.tsx");

    expect(selector).toContain("markers.slice(0, 2)");
    expect(selector).toContain('style={{');
    expect(selector).toContain("backgroundColor:");
    expect(selector).toContain("{markers.length - 2}");
  });
});
