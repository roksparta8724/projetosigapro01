import {describe,expect,it} from "vitest";
import {createQuadroIIDossier} from "@/lib/urbanQuadroIIDossier";
import type {UrbanQuadroIIWorkspace} from "@/integrations/backend/urbanPrecheckClient";
const workspace={
 status:"pending_legal_review",document_title:"quadros.pdf",document_sha256:"a".repeat(64),
 pages:Array.from({length:14},(_,i)=>({page_number:38+i,topic:"Uso e ocupacao",
   visual_warning:i===5,draft_count:3,proposals:[]})),
 entries:Array.from({length:45},(_,i)=>({
   id:String(i),page_number:38+Math.floor(i/4),category_code:"S"+i+".1",
   use_description:"Atividade de conferencia urbanistica",
   permitted_zones_text:"",road_hierarchy_text:"N3, E3",
   parking_requirement_text:"Uma vaga conforme fonte",
   special_conditions_text:"",source_excerpt:"Trecho candidato sujeito a revisão documental.",
   status:"draft_unverified",created_by_profile_id:"qa",created_at:"2026-11-09T00:00:00Z",
 })),
} as UrbanQuadroIIWorkspace;
describe("SIGAPRO Quadro II: single preparatory review dossier",()=>{
 it("includes all 45 drafts with provenance and paginates A4",()=>{
  const result=createQuadroIIDossier(workspace,"municipality-qa",[],true);
  expect(result.getNumberOfPages()).toBeGreaterThan(2);
  expect(result.output()).toContain("%PDF-");
  expect(result.output()).toContain("quadros.pdf");
  expect(result.output()).toContain("a".repeat(64));
  expect(result.output()).toContain("RASCUNHO");
 });
 it("rejects invalid SHA instead of mislabelling unrelated drafts",()=>{
  expect(()=>createQuadroIIDossier({...workspace,document_sha256:"bad"},
    "municipality-qa",[],true)).toThrow();
 });
});
