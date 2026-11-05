import type {
  UrbanQuadroIIWorkspace, UrbanQuadroIISuggestion,
} from "@/integrations/backend/urbanPrecheckClient";

export type QuadroIIQueueStatus =
  | "draft_unverified" | "visual_required" | "literal_candidate" | "missing_literal";

export type QuadroIIQueueItem = {
  pageNumber: number;
  categoryCode: string;
  description: string;
  status: QuadroIIQueueStatus;
  proposal: UrbanQuadroIISuggestion;
};

export type QuadroIIReviewQueue = {
  items: QuadroIIQueueItem[];
  total: number;
  drafts: number;
  visualRequired: number;
  literalCandidates: number;
  missingLiteral: number;
  /** None of these counts authorizes an active law or a conclusion by AI. */
  legallyActive: 0;
};

function categoryKey(page: number, code: string): string {
  return String(page) + ":" + code.normalize("NFKC").trim().toLocaleUpperCase("pt-BR");
}

/** A queue of *unverified* OCR proposals. This never approves legal rules. */
export function buildUrbanQuadroIIReviewQueue(
  workspace: UrbanQuadroIIWorkspace | null,
): QuadroIIReviewQueue {
  const empty: QuadroIIReviewQueue = {
    items: [], total: 0, drafts: 0, visualRequired: 0,
    literalCandidates: 0, missingLiteral: 0, legallyActive: 0,
  };
  if (!workspace || workspace.status !== "pending_legal_review" ||
      !Array.isArray(workspace.pages) || !Array.isArray(workspace.entries)) return empty;
  const drafted = new Set(workspace.entries.map(entry =>
    categoryKey(entry.page_number, entry.category_code)));
  const seen = new Set<string>();
  const items: QuadroIIQueueItem[] = [];
  for (const page of workspace.pages) {
    if (!Number.isInteger(page.page_number) || page.page_number < 38 || page.page_number > 51) continue;
    for (const proposal of page.proposals || []) {
      if (proposal.status !== "proposal_unverified" ||
          typeof proposal.category_code !== "string" ||
          !proposal.category_code.trim()) continue;
      const key = categoryKey(page.page_number, proposal.category_code);
      if (seen.has(key)) continue;
      seen.add(key);
      const status: QuadroIIQueueStatus = drafted.has(key) ? "draft_unverified"
        : page.source_quality === "visual_required" || page.visual_warning
          ? "visual_required"
          : typeof proposal.literal_source_excerpt === "string" &&
            proposal.literal_source_excerpt.trim().length >= 20
            ? "literal_candidate"
            : "missing_literal";
      items.push({
        pageNumber: page.page_number,
        categoryCode: proposal.category_code.trim(),
        description: proposal.use_description || "Categoria sem descrição",
        status, proposal,
      });
    }
  }
  items.sort((a,b)=>a.pageNumber-b.pageNumber ||
    a.categoryCode.localeCompare(b.categoryCode,"pt-BR",{numeric:true}));
  return {
    items, total:items.length,
    drafts:items.filter(x=>x.status==="draft_unverified").length,
    visualRequired:items.filter(x=>x.status==="visual_required").length,
    literalCandidates:items.filter(x=>x.status==="literal_candidate").length,
    missingLiteral:items.filter(x=>x.status==="missing_literal").length,
    legallyActive:0,
  };
}
