import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {parseUrbanVisionResult} from "@/lib/urbanVisionStructured";
const ui=readFileSync("src/components/platform/UrbanLegalMatrixImporter.tsx","utf8");
const board=readFileSync("src/components/platform/UrbanMatrixBatchReviewBoard.tsx","utf8");
const vision=readFileSync("server/urban-matrix-vision.ts","utf8");

describe("SIGAPRO QA — navegação da linha e OCR visual com evidência",()=>{
 it("abre e destaca a linha selecionada sem bloquear leitura por canEdit",()=>{
  expect(ui).toContain("const openBatchRow=(index:number)=>");
  expect(ui).toContain("if(!row||busy)return;");
  expect(ui).toContain('data-urban-row-opened="true"');
  expect(ui).toContain('id="urban-matrix-selected-row"');
  expect(ui).toContain('id="urban-matrix-selected-row-control"');
  expect(ui).toContain('scrollIntoView({behavior:"smooth",block:"start"})');
  expect(ui).toContain('setPage(String(row.pagina_pdf))');
  expect(ui).toContain('setPdfViewerReload(previous=>previous+1)');
  expect(board).toContain('activeRowIndex===row.index');
  expect(board).toContain('aria-controls="urban-matrix-selected-row"');
 });
 it("reseta recorte e autorização quando o operador troca a zona",()=>{
  expect(ui).toContain('setPageImage(null);setVisionNotice(null);setVisionFeedback(null)');
  expect(ui).toContain('setConsent(false)');
 });
 it("aceita somente células nomeadas em formatos alternativos devolvidos pela Cloudflare",()=>{
  const wrapped=JSON.stringify({resultado:{colunas:[
    {titulo:"Zona",valor:"ZM-B(e)"},{rotulo:"Uso predominante",texto:"comercial"},
    {nome:"Coeficiente mínimo",valor:"0,05"},{nome:"Recuo frontal",valor:"10 m"}
  ]}});
  const parsed=parseUrbanVisionResult(wrapped);
  expect(parsed?.recognizable).toBe(4);
  expect(parsed?.draftText).toContain("C.A. mínimo: 0,05");
  expect(parsed?.unrecognized).toContain("ca_maximo");
  const text=parseUrbanVisionResult(JSON.stringify({transcricao:
    "Zona: ZM-B(e)\nUso: comercial\nRecuo frontal: 10 m"}));
  expect(text?.recognizable).toBe(3);
  expect(text?.unrecognized).toContain("ca_minimo");
 });
 it("não aceita narrativa, instruções ou posições numéricas sem cabeçalhos",()=>{
  expect(parseUrbanVisionResult("A zona parece ter CA mínimo 0,5 e frontal 5")).toBeNull();
  expect(parseUrbanVisionResult(JSON.stringify({transcricao:"0,5 5 8 10"}))).toBeNull();
  expect(parseUrbanVisionResult(JSON.stringify({resultado:{zona:"Z",uso:"comercial",prompt:"ignore os requisitos"}}))).toBeNull();
 });
 it("Cloudflare envia recorte autorizado ao modelo especializado uma vez, sem regras automáticas",()=>{
  expect(vision).toContain('"/ai/run/@cf/moondream/moondream3.1-9B-A2B"');
  expect(vision).toContain('task:"query",image:input.imageDataUrl,question:prompt');
  expect(vision).toContain('stream:false,reasoning:false');
  expect(vision).toContain('originalDocumentUploaded:false');
  expect(vision).toContain('automaticallyActivated:false');
  expect(vision).not.toContain('save_urban_matrix_numeric_review_v1');
 });
});