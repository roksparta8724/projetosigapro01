import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildUrbanQuadroIIReviewQueue } from "@/lib/urbanQuadroIIReviewQueue";
import type { UrbanQuadroIIWorkspace } from "@/integrations/backend/urbanPrecheckClient";

const entries = Array.from({ length: 45 }, (_, i) => ({
  id: "draft-" + i,
  page_number: 38 + Math.floor(i / 5),
  category_code: "S" + i,
  use_description: "Categoria cadastrada " + i,
  source_excerpt: "Trecho de origem existente no documento para conferência",
}));
const pages = Array.from({ length: 14 }, (_, i) => {
  const pageNumber = 38 + i;
  const ofPage = entries.filter(entry => entry.page_number === pageNumber);
  return {
    page_number: pageNumber,
    topic: "Uso e ocupação",
    source_quality: pageNumber === 43 ? "visual_required" : "machine_unverified",
    visual_warning: pageNumber === 43,
    source_evidence_text: pageNumber === 43 ? "" : "OCR provisório",
    proposals: ofPage.map(entry => ({
      category_code: entry.category_code,
      use_description: entry.use_description,
      status: "proposal_unverified",
      parking_requirement_text: "",
      source_pages: [pageNumber],
    })),
  };
});
const workspace = {
  status: "pending_legal_review",
  document_title: "quadros.pdf",
  document_sha256: "68c85d879011dbb323e288a935099b66b6aca3babdd059b8d1c993f98b5750e1",
  pages, entries,
} as unknown as UrbanQuadroIIWorkspace;

describe("SIGAPRO QA — continuar 45 rascunhos do Quadro II", () => {
  it("mantém todas as 45 categorias em rascunho, sem declará-las legalmente aprovadas", () => {
    const queue = buildUrbanQuadroIIReviewQueue(workspace);
    expect(queue.total).toBe(45);
    expect(queue.drafts).toBe(45);
    expect(queue.items.every(item => item.status === "draft_unverified")).toBe(true);
    expect(queue.legallyActive).toBe(0);
  });

  it("faz o botão de continuidade aceitar rascunhos existentes em vez de ficar desabilitado", () => {
    const view = readFileSync("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx", "utf8");
    expect(view).toContain("const pendingQueue = reviewQueue.items;");
    expect(view).toContain("Revisar próxima categoria");
    expect(view).toContain('status: "draft_unverified"');
    expect(view).toContain("setLegalReviewRequest(current =>");
    expect(view).toContain("focusRequest={legalReviewRequest}");
    expect(view).toContain("Rascunho existente — conferir");
    expect(view).not.toContain('pendingQueue = reviewQueue.items.filter(item => item.status !== "draft_unverified")');
  });

  it("abre conferência jurídica do mesmo registro, sem criar outro nem preencher zona ou vigência", () => {
    const form = readFileSync("src/components/platform/UrbanQuadroIILegalReviewPanel.tsx", "utf8");
    expect(form).toContain("focusRequest?.id");
    expect(form).toContain("setChosen(existing.id)");
    expect(form).toContain('setZone("")');
    expect(form).toContain('setEffectiveFrom("")');
    expect(form).toContain('setRepeatExcerpt("")');
    expect(form).toContain("setConfirmed(false)");
    expect(form).toContain("current.source_excerpt.includes(excerpt.trim())");
    expect(form).toContain('data-urban-quadro-ii-reviewed-save="true"');
    expect(form).not.toContain("activateUrbanRegulation(");
  });

  it("resume 45 rascunhos com contagens honestas e cards compactos", () => {
    const view = readFileSync("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx", "utf8");
    expect(view).toContain('["Rascunhos aguardando revisão", reviewQueue.drafts]');
    expect(view).toContain('["Páginas com revisão visual", visualOnlyPages]');
    expect(view).toContain('data-urban-qii-saved-records="true"');
    expect(view).toContain("max-h-[55vh]");
    expect(view).toContain("Rascunho já registrado nesta página. Não duplicar.");
  });
});
