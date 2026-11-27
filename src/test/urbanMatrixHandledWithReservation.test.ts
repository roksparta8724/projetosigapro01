import {describe,it,expect} from "vitest";
import {calculateUrbanMatrixBatchProgress} from "@/lib/urbanLegalMatrixReview";
import type {UrbanMatrixBatchDetail,UrbanMatrixRowReadingAudit} from "@/integrations/backend/urbanPrecheckClient";
const batch:UrbanMatrixBatchDetail={
id:"batch-1",municipality_id:"city-1",document_title:"quadros.pdf",
document_sha256:"a".repeat(64),source_municipality:"Campo Limpo Paulista",
source_rows:Array.from({length:23},(_,i)=>({zona_conforme_tabela:i===21?"AIU(2)":"ZC",pagina_pdf:i===21?37:36})),
reviewed_indexes:Array.from({length:23},(_,i)=>i).filter(i=>i!==21),
status:"pending_legal_review",version:1};
const audit:UrbanMatrixRowReadingAudit={
id:"audit21",batch_id:"batch-1",row_index:21,page_number:37,action:"needs_correction",
note:"Orientação do analista 1,00, documento digitalizado ilegível, ressalva sem validação legal.",
created_at:"2026-11-03T20:50:45.412Z",actor_profile_id:"official"};
describe("Quadro I — 22 verified and 1 treated with caveat",()=>{
it("makes handling 23/23 without misrepresenting CA minimum as confirmed",()=>{
const p=calculateUrbanMatrixBatchProgress(batch,[audit]);
expect(p.total).toBe(23);expect(p.reviewed).toBe(22);
expect(p.needsCorrection).toBe(1);expect(p.handled).toBe(23);
expect(p.untreated).toBe(0);expect(p.handledPercentage).toBe(100);
expect(p.pending).toBe(1);
expect(p.rows.find(r=>r.index===21)?.readingReviewed).toBe(false);
expect(p.rows.find(r=>r.index===21)?.needsCorrection).toBe(true);
});
it("does not close a line without a signed review or caveat",()=>{
const p=calculateUrbanMatrixBatchProgress(batch,[]);
expect(p.untreated).toBe(1);expect(p.handled).toBe(22);
});
});
