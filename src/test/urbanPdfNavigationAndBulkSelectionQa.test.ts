
import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const ui=readFileSync("src/components/platform/UrbanLegalMatrixImporter.tsx","utf8");
const css=readFileSync("src/styles/surface-polarity.css","utf8");

describe("SIGAPRO QA — paginação PDF e revisão premium",()=>{
 it("monta novamente o leitor quando o PDF, a página ou o refresh mudam",()=>{
   expect(ui).toContain('const selectedPdfPage=Number.isSafeInteger(Number(page)) && Number(page)>0');
   expect(ui).toContain('key={[previewUrl,selectedPdfPage,pdfViewerReload].join(":")}');
   expect(ui).toContain('src={previewUrl+"#page="+selectedPdfPage}');
   expect(ui).toContain('data-urban-pdf-reload="true"');
   expect(ui).toContain('setPdfViewerReload(n=>n+1)');
   expect(ui).toContain('data-urban-pdf-selected-page="true"');
   expect(ui).toContain("alguns navegadores ignoram a navegação automática");
   expect(ui).toContain('target="_blank" rel="noreferrer"');
 });
 it("exibe estado concluído e não finge marcação antes da declaração humana",()=>{
   expect(ui).toContain('const allCellsSelected=confirmedCells.length===referenceCells.length');
   expect(ui).toContain('aria-pressed={allCellsSelected}');
   expect(ui).toContain('disabled={!sourceAttested||reviewBlocked||allCellsSelected}');
   expect(ui).toContain('✓ Todas marcadas (');
   expect(ui).toContain('data-urban-manual-uncheck-all="true"');
   expect(css).toContain('[data-urban-manual-check-all="true"][data-selection-state="complete"]');
   expect(css).toContain('-webkit-text-fill-color:#065f46 !important');
 });
 it("recolhe índices históricos redundantes sem eliminar conferência humana",()=>{
   expect(ui).toContain('data-urban-original-reference="true"');
   expect(ui).toContain("Ver os 11 índices históricos do pacote");
   expect(ui).toContain('data-urban-matrix-manual-verification="true"');
   expect(ui).toContain('data-urban-manual-result="true"');
 });
 it("não altera persistência nem ativa regras como consequência de navegação e seleção",()=>{
   const viewer=ui.slice(ui.indexOf('{previewUrl?<section data-urban-pdf-review="true"'),ui.indexOf('data-urban-matrix-ai-card="true"'));
   expect(viewer).not.toContain('backendClient');
   const checker=ui.slice(ui.indexOf('data-urban-manual-bulk-check="true"'),ui.indexOf('data-urban-manual-uncheck-all="true"'));
   expect(checker).not.toContain("backendClient");
   expect(ui).toContain('disabled={!canPrepare}');
 });
});
