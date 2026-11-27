import { describe, expect, it } from "vitest";
import { summarizeQuadroIIReviewProgress } from "@/lib/urbanQuadroIIReviewProgress";
import type { QuadroIIQueueItem } from "@/lib/urbanQuadroIIReviewQueue";
import type { UrbanReviewedMatrixImport } from "@/integrations/backend/urbanPrecheckClient";
const town = "49dac0b6-6352-4744-9aab-9ff91c59d970", sha = "a".repeat(64);
const queue: QuadroIIQueueItem[] = [38,39,43].map((p,i) => ({
  pageNumber:p, categoryCode:i===2?"S1.1":"E1.1",
  description:"Serviço", status:"draft_unverified",
  proposal:{category_code:i===2?"S1.1":"E1.1",use_description:"Serviço",
    source_excerpt:"OCR candidato",status:"proposal_unverified"},
}));
const record=(o: Partial<UrbanReviewedMatrixImport> = {}): UrbanReviewedMatrixImport => ({
  id:"record",municipality_id:town,document_title:"quadros.pdf",document_sha256:sha,
  page_number:38,quadro:"II",zone_code:"ZC",use_code:"e1.1",
  effective_from:"2009-12-02",version:1,status:"reviewed_draft",
  created_at:"2026-11-09T00:00:00Z",...o,
});
describe("Quadro II juridical progress: no false approvals",()=>{
  it("does not promote OCR drafts",()=>{
    const p=summarizeQuadroIIReviewProgress(queue,[],town,sha);
    expect(p.withoutFirstReview).toHaveLength(3);
    expect(p.withFirstReview).toHaveLength(0);
    expect(p.legallyActive).toBe(0);
  });
  it("tracks a first preliminary legal review by exact category and page",()=>{
    const p=summarizeQuadroIIReviewProgress(queue,[record(),record({zone_code:"AIU(2)"})],town,sha);
    expect(p.withFirstReview.map(x=>x.pageNumber)).toEqual([38]);
    expect(p.withoutFirstReview).toHaveLength(2);
    expect(p.legallyActive).toBe(0);
  });
  it("rejects wrong tenant, altered PDF and incomplete or non-draft records",()=>{
    const fake=[record({municipality_id:"other"}),record({document_sha256:"b".repeat(64)}),
      record({status:"active" as "reviewed_draft"}),record({zone_code:""}),
      record({effective_from:""}),record({page_number:0})];
    expect(summarizeQuadroIIReviewProgress(queue,fake,town,sha).withFirstReview).toHaveLength(0);
    expect(summarizeQuadroIIReviewProgress(queue,[record()],town,"invalid").withFirstReview).toHaveLength(0);
  });
});
