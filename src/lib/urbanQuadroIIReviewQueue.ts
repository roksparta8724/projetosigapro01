import type {
  UrbanQuadroIIWorkspace, UrbanQuadroIISuggestion,
} from "@/integrations/backend/urbanPrecheckClient";
import { prepareQuadroIIPdfAssistedPrefill } from "@/lib/urbanQuadroIIPdfAssistedPrefill";

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
  /** Includes visual-required rows; categories can belong to both counts. */
  literalCandidates: number;
  /** Includes visual-required rows without a candidate; not a separate bucket. */
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
  municipalityId = "",
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
  let literalCandidates = 0;
  let missingLiteral = 0;
  for (const page of workspace.pages) {
    if (!Number.isInteger(page.page_number) || page.page_number < 38 || page.page_number > 51) continue;
    for (const proposal of page.proposals || []) {
      if (proposal.status !== "proposal_unverified" ||
          typeof proposal.category_code !== "string" ||
          !proposal.category_code.trim()) continue;
      const key = categoryKey(page.page_number, proposal.category_code);
      if (seen.has(key)) continue;
      seen.add(key);
      const assisted = prepareQuadroIIPdfAssistedPrefill(
        municipalityId, workspace.document_sha256 || "", page.page_number, proposal,
      );
      const alreadyDrafted = drafted.has(key);
      if (!alreadyDrafted) {
        if (assisted.hasLiteralCandidate) literalCandidates += 1;
        else missingLiteral += 1;
      }
      // Keep visual-required categorization even if a provisional quote exists.
      // Visual review and candidate existence are separate, overlapping facts.
      const status: QuadroIIQueueStatus = alreadyDrafted ? "draft_unverified"
        : page.source_quality === "visual_required" || page.visual_warning
          ? "visual_required"
          : assisted.hasLiteralCandidate
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
    literalCandidates,
    missingLiteral,
    legallyActive:0,
  };
}
