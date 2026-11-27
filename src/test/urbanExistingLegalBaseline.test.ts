import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {verifiedUrbanBaseline} from "@/lib/urbanExistingLegalBaseline";
const municipalityId="49dac0b6-6352-4744-9aab-9ff91c59d970";
const example={
  status:"available",municipalityId,
  documents:[
    {slot:"uso_solo",name:"quadros.pdf"},
    {slot:"zoneamento",name:"zoneamento clp.pdf"},
    {slot:"leis_complementares",name:"440-2011.pdf"},
  ],
  quadroI:{sourceDocument:"quadros.pdf",sourceSha256:"a".repeat(64),
    rows:23,reviewed:22,needsCorrection:1,pending:1,legalStatus:"pending_legal_review"},
  quadroII:{pages:14,draftEntries:45,machineSuggestions:45,legalStatus:"draft_unverified"},
  activeRealRegulations:0,verifiedLegalScopes:0,automaticallyApproved:false,legalConformity:"not_evaluated",
};
describe("SIGAPRO: reutilização segura de Quadros e PDFs anteriores",()=>{
  it("preserva o histórico sem promover rascunho a regra legal",()=>{
    const verified=verifiedUrbanBaseline(example,municipalityId);
    expect(verified?.quadroI.reviewed).toBe(22);
    expect(verified?.quadroII.draftEntries).toBe(45);
    expect(verified?.documents.map(x=>x.name)).toContain("zoneamento clp.pdf");
    expect(verified?.activeRealRegulations).toBe(0);
    expect(verified?.automaticallyApproved).toBe(false);
  });
  it("descarta dados retornados de outra prefeitura ou aprovação fictícia",()=>{
    expect(verifiedUrbanBaseline(example,"00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(verifiedUrbanBaseline({...example,automaticallyApproved:true},municipalityId)).toBeNull();
    expect(verifiedUrbanBaseline({...example,legalConformity:"compliant"},municipalityId)).toBeNull();
  });
  it("rejeita contagem contraditória de conferências e PDF estranho",()=>{
    expect(verifiedUrbanBaseline({...example,quadroI:{...example.quadroI,reviewed:24}},municipalityId)).toBeNull();
    expect(verifiedUrbanBaseline({...example,documents:[{slot:"other",name:"file.pdf"}]},municipalityId)).toBeNull();
    expect(verifiedUrbanBaseline({...example,quadroII:{...example.quadroII,pages:-2}},municipalityId)).toBeNull();
  });
  it("o servidor só consulta documentos existentes depois de autorizar PDF e processo",()=>{
    const server=readFileSync("server/ai-project-extract.ts","utf8");
    const rpc=readFileSync("neon/migrations/20261106_urban_existing_work_baseline_qa_v1.sql","utf8");
    const frontend=readFileSync("src/components/platform/ArchitecturalPdfAiPanel.tsx","utf8");
    expect(server).toContain('"get_urban_process_legal_baseline_v1"');
    const post=server.slice(server.indexOf("const doc=await verifiedDocument(req,tenant,processId,documentId)"));
    expect(post.indexOf("const doc=await verifiedDocument(req,tenant,processId,documentId)"))
      .toBeLessThan(post.indexOf('"get_urban_process_legal_baseline_v1",{_process_id:processId}'));
    expect(rpc).toContain("public.has_process_access(_process_id)");
    expect(rpc).toContain("public.current_profile_id()");
    expect(rpc).toContain("municipality_id=_p.municipality_id");
    expect(rpc).toContain("row_security TO off");
    expect(rpc).toContain("REVOKE ALL ON FUNCTION");
    expect(rpc).not.toMatch(/\bUPDATE\s+public\.urban_matrix_batch_staging_v1\b/i);
    expect(frontend).toContain('data-sigapro-existing-legal-baseline="true"');
  });
  it("a navegação do Quadro II exige clique explícito para rolar até o editor",()=>{
    const panel=readFileSync("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx","utf8");
    expect(panel).toContain('data-urban-qii-go-editor="true"');
    expect(panel).toContain("[overflow-anchor:none]");
    expect(panel).not.toContain('editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })');
  });
});
