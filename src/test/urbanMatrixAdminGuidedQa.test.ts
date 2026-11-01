import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const importer=readFileSync("src/components/platform/UrbanLegalMatrixImporter.tsx","utf8");
describe("SIGAPRO — operação municipal guiada sem aprovar parâmetros errados",()=>{
 it("oferece três etapas claras e esconde diagnósticos técnicos inicialmente",()=>{
  expect(importer).toContain('data-urban-admin-guided="true"');
  for(const stage of ["Etapa 1 de 3 · Documento","Etapa 2 de 3 · Leitura","Etapa 3 de 3 · Conferência"])
    expect(importer).toContain(stage);
  expect(importer).toContain('useState(false)');
  expect(importer).toContain('data-urban-admin-advanced-content="true"');
  expect(importer).toContain('className={adminAdvancedOpen?"mt-4 space-y-4":"hidden"}');
  expect(importer).toContain('aria-expanded={adminAdvancedOpen}');
 });
 it("limita o resultado principal aos 13 parâmetros e suas fontes",()=>{
  expect(importer).toContain("const adminFieldOverview=URBAN_VISION_FIELDS.map");
  expect(importer).toContain('data-urban-admin-field={field.key}');
  expect(importer).toContain('field.status==="ai_agrees"');
  expect(importer).toContain('field.status==="conflict"');
  expect(importer).toContain('"Sugestão da IA — pendente"');
  expect(importer).toContain('"Camada textual do PDF — conferir"');
  expect(importer).toContain('"Pendente de leitura"');
  expect(importer).toContain("adminOverviewUnconfirmed");
 });
 it("mantém revisão e salvamento estritamente humanos",()=>{
  expect(importer).toContain("Nenhum parâmetro foi aprovado.");
  expect(importer).toContain("onClick={()=>pageImage&&consent?void readPageImage");
  expect(importer).toContain('data-urban-admin-analyze="true"');
  expect(importer).toContain('onClick={()=>void saveReview()}');
  expect(importer).toContain('window.confirm("Confirma que conferiu o PDF oficial');
  expect(importer).toContain('!qaWriteEnabled');
 });
 it("troca de PDF descarta página, zona, uso, leituras e diagnósticos anteriores",()=>{
  expect(importer).toContain('setPage("");setZone("");setUsage("");setEffectiveFrom("")');
  expect(importer).toContain("setExpertDiagnostics(null);setExpertStatus(\"\");setAutoAuditPending(false)");
  expect(importer).toContain("setPdfLayer(null);setPdfLayerNotice(\"\")");
  expect(importer).toContain("visionSessionCache.current.clear()");
 });
});
