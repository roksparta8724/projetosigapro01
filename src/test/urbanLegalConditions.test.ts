import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifyUrbanLegalExcerpt, findUrbanLegalConditions, validateUrbanLegalReview,
  type UrbanLegalReviewConfirmation,
} from "@/lib/urbanLegalConditions";
import type { UrbanLegalEvidence } from "@/lib/urbanLegalKnowledge";
import type { UrbanRegulationVersion } from "@/lib/urbanPrecheck";

const sha = "a".repeat(64);
const version: UrbanRegulationVersion = {
  id:"active",municipality_id:"prefeitura-a",zone_code:"ZR1",use_code:"RESIDENCIAL",
  effective_from:"2026-01-01",version:1,status:"active",
  rules:[{metric:"front_setback_m",limit:5,reference:"Lei 10/2026 art. 4"}],
  created_at:"2026-01-01T00:00:00Z",
};
const row: UrbanLegalEvidence = {
  id:"c1",municipality_id:"prefeitura-a",document_title:"Lei urbanística 10/2026",
  document_sha256:sha,page_number:12,metric:"front_setback_m",
  excerpt:"O recuo frontal mínimo de 5 metros, salvo quando o lote estiver na zona especial, conforme anexo II.",
  created_at:"2026-10-23T00:00:00Z",
};
const review: UrbanLegalReviewConfirmation = {
  evidenceIds:["c1"],note:"Foi conferida a Lei 10/2026, artigo 4, e as exceções do Anexo II.",
  documentScopeConfirmed:true,
};

describe("SIGAPRO IA Urbanismo - revisão de condições e exceções",()=>{
  it("identifica ressalva, condição, zona, vigência e remissões sem decidir aplicação",()=>{
    const flags=classifyUrbanLegalExcerpt(
      "Salvo quando prevista dispensa no Anexo II, para zona especial, em regra transitória."
    );
    expect(flags).toContain("exception");
    expect(flags).toContain("condition");
    expect(flags).toContain("external_reference");
    expect(flags).toContain("zoning");
    expect(flags).toContain("effective_date");
    expect(classifyUrbanLegalExcerpt("Recuo frontal mínimo de 5 metros.")).toEqual([]);
  });
  it("isola evidências por município e métricas presentes na versão normativa selecionada",()=>{
    const foreign={...row,id:"foreign",municipality_id:"prefeitura-b"};
    const unrelated={...row,id:"height",metric:"height_m" as const};
    const flags=findUrbanLegalConditions([row,foreign,unrelated],"prefeitura-a",version);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({evidenceId:"c1",metric:"front_setback_m",page:12});
    expect(flags[0].kinds).toContain("exception");
    expect(findUrbanLegalConditions([row],"prefeitura-b",version)).toEqual([]);
    expect(findUrbanLegalConditions([row],"prefeitura-a",null)).toEqual([]);
  });
  it("impede conferir apenas parte das ressalvas, sem nota ou sem escopo legal validado",()=>{
    const flags=findUrbanLegalConditions([row,{...row,id:"c2",page_number:13}],"prefeitura-a",version);
    expect(validateUrbanLegalReview(flags,{...review,evidenceIds:["c1"]})).toMatch(/todas/i);
    expect(validateUrbanLegalReview(flags,{...review,documentScopeConfirmed:false})).toMatch(/Confirme/i);
    expect(validateUrbanLegalReview(flags,{...review,note:"curta"})).toMatch(/20 a 1200/i);
    expect(validateUrbanLegalReview(flags,{...review,evidenceIds:["c1","c2"]})).toBeNull();
    expect(validateUrbanLegalReview([], {evidenceIds:[],note:"",documentScopeConfirmed:false})).toBeNull();
  });
  it("não substitui a checagem legal nem envia aprovação por IA",()=>{
    const code=readFileSync(resolve(process.cwd(),"src/components/platform/UrbanPrecheckPanel.tsx"),"utf8");
    expect(code).toContain('data-urban-legal-conditions="true"');
    expect(code).toContain("legalReviewReady");
    expect(code).toContain("saveUrbanPrecheckRun(process.id, regulation.id, asOf, complete");
    expect(code).toContain('data-urban-review-audit="true"');
    expect(code).toContain("Condição legal: conferir");
    expect(code).not.toContain("approveProcess(");
  });
  it("auditoria v3 salva nota junto ao histórico e reutiliza permissões da v2",()=>{
    const migration=readFileSync(resolve(process.cwd(),
      "neon/migrations/20261024_urban_ai_conditional_review_v3.sql"),"utf8");
    const client=readFileSync(resolve(process.cwd(),
      "src/integrations/backend/urbanPrecheckClient.ts"),"utf8");
    expect(migration).toContain("public.can_write_process_analysis(_process_id)");
    expect(migration).toContain("public.save_urban_precheck_run_v2(");
    expect(migration).toContain("municipality_id=_municipality_id");
    expect(migration).toContain("reviewed_by_profile_id");
    expect(migration).toContain("legal_review");
    expect(migration).toContain("revoke execute on function public.save_urban_precheck_run_v2");
    expect(client).toContain('invoke("save_urban_precheck_run_v3"');
    expect(client).toContain("legal_review?");
  });
});
