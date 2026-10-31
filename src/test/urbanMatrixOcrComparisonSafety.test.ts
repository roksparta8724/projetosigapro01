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
   expect(ui).toContain("onPrepareVerified={verifiedText=>");
   expect(ui).toContain("row={matchingOriginalRow} analysis={ocrReconciliation}");
   expect(ui).toContain("ocrReconciliationBlocked");
   expect(ui).toContain('data-urban-ocr-column-block="true"');
   expect(ui).toContain("Não são valores confirmados pela IA nem comprovação da vigência atual.");
   expect(ui).toContain("Conferir na imagem");
 });
 it("bloqueia confirmação com [ILEGÍVEL] e extração prematura",()=>{
   expect(ui).toContain('ocrHasIllegibleCell=/\\[\\s*ILEG[IÍ]VEL\\s*\\]/i.test(text)');
   expect(ui).toContain('disabled={ocrHasIllegibleCell||ocrReconciliationBlocked}');
   expect(ui).toContain('disabled={busy||!file||text.trim().length<40||!consent||!Number.isSafeInteger(Number(page))||Number(page)<1||');
   expect(ui).toContain('!zone.trim()||!usage.trim()||(ocrDraft&&(!ocrVerified||ocrHasIllegibleCell||ocrReconciliationBlocked))}');
   expect(ui).toContain('data-urban-ocr-unresolved="true"');
   expect(ui).toContain('(ocrDraft && (!ocrVerified || ocrHasIllegibleCell || ocrReconciliationBlocked))');
 });
 it("permite conferência célula a célula sem depender de leitura visual ou escrita no Neon",()=>{
   expect(ui).toContain('data-urban-matrix-manual-verification="true"');
   expect(ui).toContain('data-urban-matrix-manual-progress="true"');
   expect(ui).toContain('13');
   expect(ui).toContain('Conferi no PDF: ');
   expect(ui).toContain('disabled={!canPrepare}');
   expect(ui).toContain('sourceAttested');
   expect(ui).toContain('referenceCells.every');
   expect(ui).toContain('setMethod("visual_double_transcription")');
   expect(ui).toContain('key={[municipalityId,reviewPackage?.arquivo_sha256,reviewRowIndex,zone,usage,page].join(":")}');
   expect(ui).toContain('data-urban-vision-raw-preview="true"');
   expect(ui).toContain('result.status==="unverified_unstructured_ocr_response"');
 });
 it("não persiste nem ativa dados só por mostrar a matriz de comparação",()=>{
   const comparison=ui.slice(ui.indexOf("function OcrReferenceComparison("),ui.indexOf("const dateValid"));
   expect(comparison).not.toContain("backendClient");
   expect(comparison).not.toContain("setEffectiveFrom");
   expect(comparison).not.toContain("save_urban_matrix_numeric_review_v1");
 });
 it("mostra o resultado no próprio card, além do campo de transcrição acima",()=>{
   expect(ui).toContain('data-urban-manual-result="true"');
   expect(ui).toContain('data-urban-manual-result-text="true"');
   expect(ui).toContain("Resultado da conferência humana");
   expect(ui).toContain("Não salvo · não é leitura da IA");
   expect(ui).toContain('href="#urban-matrix-transcription"');
   expect(ui).toContain('id="urban-matrix-transcription"');
   expect(ui).toContain('preparedText={preparedManualText}');
   expect(ui).toContain("setPreparedManualText(verifiedText)");
   expect(ui).toContain("Editar transcrição preparada — abrir somente se precisar corrigir");
 });
 it("invalida o resultado visual se o operador altera a revisão, troca o PDF ou edita o texto",()=>{
   expect(ui).toContain("onInvalidatePrepared={()=>{");
   expect(ui).toContain('if(preparedManualText && text===preparedManualText)setText("")');
   expect(ui).toContain('onChange={e=>{onInvalidatePrepared();setSourceAttested(e.target.checked);}}');
   expect(ui).toContain('onChange={e=>{setText(e.target.value);setPreparedManualText(null);');
   expect(ui).toContain('setReviewPackage(null);setReviewRowIndex(0);setPreparedManualText(null);');
 });
 it("recolhe comparação extensa quando não houve análise da IA, mantendo revisão manual acessível",()=>{
   expect(ui).toContain('data-urban-ocr-detailed-comparison="true" open={Boolean(analysis)}');
   expect(ui).toContain("Comparação detalhada dos 11 índices — expandir ou recolher");
   expect(ui).toContain('data-urban-matrix-manual-verification="true"');
   expect(ui).toContain('role="status" aria-live="polite"');
   expect(ui).not.toContain("Ainda não houve transcrição pela IA nesta sessão.");
 });
 it("permite marcar ou desmarcar todos os 13 parâmetros SOMENTE após declaração humana",()=>{
   expect(ui).toContain('data-urban-manual-bulk-check="true"');
   expect(ui).toContain('data-urban-manual-check-all="true" data-sigapro-contrast="dark"');
   expect(ui).toContain('disabled={!sourceAttested||reviewBlocked||allCellsSelected}');
   expect(ui).toContain('data-selection-state={allCellsSelected?"complete":"pending"}');
   expect(ui).toContain('aria-pressed={allCellsSelected}');
   expect(ui).toContain('✓ Todas marcadas (');
   expect(ui).toContain('setConfirmedCells(referenceCells.map(([label])=>label))');
   expect(ui).toContain('data-urban-manual-uncheck-all="true"');
   expect(ui).toContain('setConfirmedCells([])');
   expect(ui).toContain("onInvalidatePrepared();");
   expect(ui).toContain('disabled={!canPrepare}');
   expect(ui).toContain('referenceCells.every');
 });
 it("apresenta só um resultado principal e recolhe edição do texto após conferência",()=>{
   expect(ui).toContain('data-urban-manual-result="true"');
   expect(ui).toContain('data-urban-transcription-edit="true"');
   expect(ui).toContain('{preparedManualText ? <details');
   expect(ui).toContain('{!ocrDraft && !preparedManualText?<p data-urban-ocr-fallback="true"');
   expect(ui).toContain('setVisionNotice(null);');
   expect(ui).toContain('setMessage("");');
   expect(ui).toContain('onChange={e=>{setText(e.target.value);setPreparedManualText(null);');
   expect(ui).toContain('Nenhuma regra nem vigência foi alterada.');
 });

});
