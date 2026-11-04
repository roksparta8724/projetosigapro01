import {beforeEach,describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
const mock=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock("@/integrations/backend/databaseClient",()=>({backendClient:{rpc:mock.rpc}}));
import {saveUrbanQuadroIIReviewedImport} from "@/integrations/backend/urbanPrecheckClient";
const source="A categoria S1.1 é permitida nesta zona com condições e vagas determinadas pela tabela.";
const arg={municipalityId:"49dac0b6-6352-4744-9aab-9ff91c59d970",
 documentTitle:"quadros.pdf",documentSha256:"a".repeat(64),pageNumber:43,
 categoryCode:"S1.1",zoneCode:"ZC",useDescription:"Serviços profissionais",
 permittedZones:"ZC",roadHierarchy:"",parkingRequirement:"Conforme tabela",
 specialConditions:"Sujeito ao Quadro II",
 effectiveFrom:"2009-12-02",sourceExcerpt:source,literalExcerpt:source};
describe("Quadro II — versioned municipal legal drafts",()=>{
 beforeEach(()=>vi.resetAllMocks());
 it("retains official dotted category codes and the explicit zone of application",async()=>{
  mock.rpc.mockResolvedValue({data:{id:"version-1",version:1,status:"reviewed_draft"},error:null});
  await saveUrbanQuadroIIReviewedImport(arg);
  expect(mock.rpc).toHaveBeenCalledWith("save_urban_legal_matrix_import_v1",expect.objectContaining({
   _municipality_id:arg.municipalityId,_quadro:"II",_zone_code:"ZC",_use_code:"S1.1",
   _verification_method:"visual_double_transcription",
   _reviewed_entries:[expect.objectContaining({kind:"use_condition",source_excerpt:source})],
  }));
 });
 it("never sends an invented zone, unverified excerpt or date to Neon",async()=>{
  await expect(saveUrbanQuadroIIReviewedImport({...arg,zoneCode:""})).rejects.toThrow(/Revise a zona/);
  await expect(saveUrbanQuadroIIReviewedImport({...arg,literalExcerpt:"texto inventado não localizado no documento"})).rejects.toThrow(/Revise a zona/);
  await expect(saveUrbanQuadroIIReviewedImport({...arg,effectiveFrom:""})).rejects.toThrow(/Revise a zona/);
  expect(mock.rpc).not.toHaveBeenCalled();
 });
 it("keeps imports in human-reviewed draft state even after a successful write",()=>{
  const ui=readFileSync("src/components/platform/UrbanQuadroIILegalReviewPanel.tsx","utf8");
  const migration=readFileSync("neon/migrations/20261104_quadro_ii_reviewed_draft_category_codes_v1.sql","utf8");
  const ready=readFileSync("src/lib/urbanAiReadiness.ts","utf8");
  expect(ui).toContain('data-urban-quadro-ii-legal-import="true"');
  expect(ui).toContain('canEdit && current');
  expect(ui).toContain("repeatExcerpt.trim() === excerpt.trim()");
  expect(ui).toContain("Gravar versão jurídica revisada — sem ativar IA");
  expect(migration).toContain("^[A-Z0-9_. -]{1,60}$");
  expect(migration).not.toContain("activate_urban_regulation");
  expect(migration).not.toContain("DELETE FROM");
  expect(ready).toContain("data.quadroII?.legal_approval === true");
 });
});
