import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {createUrbanQaProcess04Fixture} from "@/lib/urbanQaProcess04PdfFixture";
describe("Processo fictício 000004/2026 — fixture segura e explícita QA",()=>{
 it("produz PDF de três pranchas sem utilizar dados de cidadão",async()=>{
  const doc=await createUrbanQaProcess04Fixture();
  expect(doc.name).toContain("Processo_000004_2026");
  expect(doc.size).toBeGreaterThan(2000);
  const sig=new TextDecoder().decode((await doc.arrayBuffer()).slice(0,5));
  expect(sig).toBe("%PDF-");
 });
 it("somente o processo QA designado expõe o botão, sem gravar o PDF automaticamente",()=>{
  const panel=readFileSync("src/components/platform/UrbanProjectReaderPanel.tsx","utf8");
  const parent=readFileSync("src/components/platform/UrbanPrecheckPanel.tsx","utf8");
  expect(panel).toContain('processId==="915e1c63-ebda-4cdd-8e95-34316d9e0089"');
  expect(panel).toContain('VITE_SIGAPRO_URBAN_MATRIX_QA_ENABLED==="true"');
  expect(panel).toContain('data-urban-pilot-process-04="true"');
  expect(panel).toContain('data-urban-open-process04-fixture="true"');
  expect(panel).toContain("setReport(inspected)");
  expect(parent).toContain("processId={process.id}");
  expect(panel).toContain("não fica salvo nem vinculado ao R2");
 });
});
