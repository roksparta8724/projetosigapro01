import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import {
  listUrbanMatrixBatches,
  listUrbanMatrixReadingAudit,
  listUrbanQuadroIIWorkspace,
} from "@/integrations/backend/urbanPrecheckClient";
import { UrbanLegislationContinuityPanel } from "@/components/platform/UrbanLegislationContinuityPanel";

vi.mock("@/integrations/backend/urbanPrecheckClient", () => ({
  listUrbanMatrixBatches: vi.fn(),
  listUrbanMatrixReadingAudit: vi.fn(),
  listUrbanQuadroIIWorkspace: vi.fn(),
}));

const municipalityId = "49dac0b6-6352-4744-9aab-9ff91c59d970";
type BatchList = Awaited<ReturnType<typeof listUrbanMatrixBatches>>;
type Audit = Awaited<ReturnType<typeof listUrbanMatrixReadingAudit>>;
type Quadros = Awaited<ReturnType<typeof listUrbanQuadroIIWorkspace>>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listUrbanMatrixBatches).mockResolvedValue([{
    id: "879a0b20-6c7a-4da5-a779-dce1a109b68d",
    document_title: "quadros.pdf",
    document_sha256: "a".repeat(64),
    source_municipality: municipalityId,
    status: "pending_legal_review",
    version: 1,
    total_rows: 23,
    reviewed_rows: 16,
    created_at: "2026-10-31T16:08:53Z",
  }] as BatchList);
  vi.mocked(listUrbanMatrixReadingAudit).mockResolvedValue({
    row_reviews: Array.from({ length: 7 }, (_, index) => ({ id: String(index), batch_id: "b",
      row_index: index, page_number: 36, action: "reading_verified", note: "Conferência preservada",
      created_at: "2026-11-03T20:00:00Z", actor_profile_id: "1" })),
    batch_events: [],
  } as Audit);
  vi.mocked(listUrbanQuadroIIWorkspace).mockResolvedValue({
    status: "pending_legal_review",
    batch_id: "879a0b20-6c7a-4da5-a779-dce1a109b68d",
    document_sha256: "a".repeat(64),
    document_title: "quadros.pdf",
    pages: Array.from({ length: 14 }, (_, index) => ({
      page_number: index + 38,
      topic: "Quadro II",
      source_quality: "machine_unverified",
      source_evidence_text: "OCR ainda não conferido",
      visual_warning: false,
      draft_count: 0,
      proposals: Array.from({ length: index < 3 ? 4 : 3 }, () => ({ category_code: "A", use_description: "Leitura" })),
    })),
    entries: [],
    legal_approval: false,
    ready_for_ai: false,
  } as unknown as Quadros);
});

describe("SIGAPRO — documentos e trabalhos anteriores não desaparecem na nova tela", () => {
  it("displays live historic counts and official PDF references separately from new registry", async () => {
    render(<UrbanLegislationContinuityPanel municipalityId={municipalityId} legacyFiles={[
      { label: "Zoneamento", name: "zoneamento clp.pdf" },
      { label: "Uso e ocupação", name: "lei complementar.pdf" },
    ]} />);
    expect(await screen.findByText("23 linhas")).toBeInTheDocument();
    expect(screen.getByText(/7 conferência\(s\)/)).toBeInTheDocument();
    expect(screen.getByText("14 páginas")).toBeInTheDocument();
    expect(screen.getByText("45 sugestões não validadas")).toBeInTheDocument();
    expect(screen.getByText(/zoneamento clp.pdf/)).toBeInTheDocument();
    expect(screen.getByText(/lei complementar.pdf/)).toBeInTheDocument();
    expect(screen.getByText(/Conferência legal pendente/)).toBeInTheDocument();
    expect(listUrbanMatrixBatches).toHaveBeenCalledWith(municipalityId);
    expect(listUrbanQuadroIIWorkspace).toHaveBeenCalledWith(municipalityId);
  });

  it("opens the existing Quadro I and II panels rather than creating duplicate pages", async () => {
    const i = document.createElement("button");
    i.id = "sigapro-quadro-i-tab";
    const ii = document.createElement("button");
    ii.id = "sigapro-quadro-ii-tab";
    i.scrollIntoView = vi.fn();
    ii.scrollIntoView = vi.fn();
    const clickI = vi.fn();
    const clickII = vi.fn();
    i.addEventListener("click", clickI);
    ii.addEventListener("click", clickII);
    document.body.append(i, ii);
    try {
      render(<UrbanLegislationContinuityPanel municipalityId={municipalityId} legacyFiles={[]} />);
      await screen.findByText("23 linhas");
      fireEvent.click(screen.getByRole("button", { name: "Abrir Quadro I e conferências" }));
      expect(clickI).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByRole("button", { name: "Abrir Quadro II" }));
      expect(clickII).toHaveBeenCalledTimes(1);
    } finally { i.remove(); ii.remove(); }
  });

  it("does not confuse a transient database error with actual data deletion", async () => {
    vi.mocked(listUrbanMatrixBatches).mockRejectedValue(new Error("backend unavailable"));
    render(<UrbanLegislationContinuityPanel municipalityId={municipalityId} legacyFiles={[]} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("NÃO significa que algum documento foi excluído");
    expect(screen.getAllByText(/Indisponível/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Atualizar registros" }));
    await waitFor(() => expect(listUrbanMatrixBatches).toHaveBeenCalledTimes(2));
  });

  it("preserves read-only access for Admin Prefeitura without edit/archiving actions", () => {
    const root = "src/components/platform/";
    const settings = readFileSync(root + "MunicipalUrbanRulesSettings.tsx", "utf8");
    const quadroI = readFileSync(root + "UrbanLegalMatrixReviewPanel.tsx", "utf8");
    const quadroII = readFileSync(root + "UrbanQuadroIIWorkspacePanel.tsx", "utf8");
    const config = readFileSync("src/pages/saas/ConfiguracoesPage.tsx", "utf8");
    expect(settings).toContain("<UrbanLegalMatrixReviewPanel municipalityId={municipalityId} canView canEdit={canEdit} />");
    expect(settings).toContain("<UrbanQuadroIIWorkspacePanel municipalityId={municipalityId} canView canEdit={canEdit} />");
    expect(quadroI).toContain("if (!canEdit) return;");
    expect(quadroI).toContain("{canEdit && !isArchived(selected.id) ? (");
    expect(quadroII).toContain('if (!canView || !municipalityId) return null');
    expect(quadroII).toContain('disabled={!canEdit || saving || entries.some');
    expect(config).toContain("<UrbanLegislationContinuityPanel");
    expect(config).toContain("zoneamentoFiles.map");
  });
});
