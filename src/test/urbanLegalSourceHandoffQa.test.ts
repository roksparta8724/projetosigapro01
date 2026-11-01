import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
describe("SIGAPRO QA — passagem segura da linha do Quadro I para fontes legais",()=>{
 it("does not confuse 13 recognized fields with approved legal indices",()=>{
   const ui=readFileSync("src/components/platform/UrbanLegalMatrixImporter.tsx","utf8");
   expect(ui).toContain("13 campos detectados no PDF; nenhum índice está legalmente homologado");
   expect(ui).toContain("Evidência textual ≠ evidência legal confirmada");
   expect(ui).toContain("data-urban-go-to-legal-evidence");
   expect(ui).toContain("onSourceContextChange");
   expect(ui).toContain("pdfTableReading?.row");
   expect(ui).toContain("Zero rótulos literais não significa");
   expect(ui).toContain("availablePdfRows.length} linha(s) da tabela");
 });
 it("reuses source PDF/page/zone/use only from an exact selected row, not unrelated QA rules",()=>{
   const settings=readFileSync("src/components/platform/MunicipalUrbanRulesSettings.tsx","utf8");
   const panel=readFileSync("src/components/platform/UrbanLegalEvidenceCatalogPanel.tsx","utf8");
   expect(settings).toContain("onSourceContextChange={setLegalSourceContext}");
   expect(settings).toContain("sourceContext={legalSourceContext}");
   expect(panel).toContain("sourceContext.file");
   expect(panel).toContain("sourceContext.physicalPage");
   expect(panel).toContain("matchingLegalVersions.length===0");
   expect(panel).toContain("(!sourceContext||matchingLegalVersions.some");
   expect(panel).toContain("sourceContext?matchingLegalVersions:");
   expect(panel).toContain("setTitle(sourceContext.file.name.replace(/\\.pdf$/i");
   expect(panel).toContain("versionsForScope.length===1?");
   expect(panel).not.toContain("setAttested(true)");
   expect(panel).toContain('data-urban-prepare-draft-from-reading="true"');
   expect(settings).toContain("onPrepareDraft={prepareDraftFromPdf}");
   expect(settings).toContain('data-urban-draft-from-pdf="true"');
   expect(settings).toContain('setEffectiveFrom("");setManualEditorOpen(true);');
 });
});
