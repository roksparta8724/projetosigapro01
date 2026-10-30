import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const ui=readFileSync("src/components/platform/UrbanLegalMatrixImporter.tsx","utf8");
describe("SIGAPRO QA — OCR não transforma índices soltos em regras",()=>{
 it("exibe matriz histórica por coluna, sem afirmar que foi verificada pela IA",()=>{
   expect(ui).toContain('data-urban-ocr-comparison="true"');
   expect(ui).toContain("matchingOriginalScope");
   expect(ui).toContain('data-urban-ocr-fallback="true"');
   expect(ui).toContain('{matchingOriginalScope && matchingOriginalRow ? <>');
   expect(ui).not.toContain('ocrDraft && matchingOriginalScope && matchingOriginalRow ?');
   expect(ui).toContain("<OcrReferenceComparison row={matchingOriginalRow} analysis={ocrReconciliation}/>");
   expect(ui).toContain("ocrReconciliationBlocked");
   expect(ui).toContain('data-urban-ocr-column-block="true"');
   expect(ui).toContain("Não são valores confirmados pela IA nem comprovação da vigência atual.");
   expect(ui).toContain("Conferir na imagem");
 });
 it("bloqueia confirmação com [ILEGÍVEL] e extração prematura",()=>{
   expect(ui).toContain('ocrHasIllegibleCell=/\\[\\s*ILEG[IÍ]VEL\\s*\\]/i.test(text)');
   expect(ui).toContain('disabled={ocrHasIllegibleCell||ocrReconciliationBlocked}');
   expect(ui).toContain('disabled={busy||(ocrDraft&&(!ocrVerified||ocrHasIllegibleCell||ocrReconciliationBlocked))}');
   expect(ui).toContain('data-urban-ocr-unresolved="true"');
   expect(ui).toContain('(ocrDraft && (!ocrVerified || ocrHasIllegibleCell || ocrReconciliationBlocked))');
 });
 it("não persiste nem ativa dados só por mostrar a matriz de comparação",()=>{
   const comparison=ui.slice(ui.indexOf("function OcrReferenceComparison("),ui.indexOf("const dateValid"));
   expect(comparison).not.toContain("backendClient");
   expect(comparison).not.toContain("setEffectiveFrom");
   expect(comparison).not.toContain("save_urban_matrix_numeric_review_v1");
 });
});
