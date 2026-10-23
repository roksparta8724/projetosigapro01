import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  urbanLegalEvidenceAppliesTo,urbanLegalScopeMatchesDraft,validateUrbanLegalScope,
} from "@/lib/urbanLegalScope";
import type { UrbanLegalEvidence } from "@/lib/urbanLegalKnowledge";
import type { UrbanRegulationVersion } from "@/lib/urbanPrecheck";

const row:UrbanLegalEvidence={
  id:"scope1",evidence_id:"source1",municipality_id:"municipality-qa",
  document_title:"Plano Diretor Municipal",document_sha256:"a".repeat(64),
  page_number:3,metric:"front_setback_m",excerpt:"O recuo frontal deverá observar a zona e suas ressalvas legais.",
  zone_code:"ZR1",use_code:"RESIDENCIAL",effective_from:"2024-01-01",
  effective_until:"2026-12-31",created_at:"2026-10-23T15:00:00Z",
};
const rule:UrbanRegulationVersion={
  id:"version1",municipality_id:"municipality-qa",zone_code:"ZR1",
  use_code:"RESIDENCIAL",effective_from:"2025-01-01",version:1,status:"active",
  rules:[{metric:"front_setback_m",limit:5,reference:"Lei art. 12"}],
  created_at:"2025-01-01T00:00:00Z",
};

describe("SIGAPRO IA: fonte legal por zona, uso e data",()=>{
  it("permite associação apenas com código de zona, uso e datas válidas",()=>{
    const candidate={zoneCode:"ZR1",useCode:"RESIDENCIAL",effectiveFrom:"2026-10-23",effectiveUntil:""};
    expect(validateUrbanLegalScope(candidate)).toBeNull();
    expect(validateUrbanLegalScope({...candidate,zoneCode:""})).toMatch(/zona/i);
    expect(validateUrbanLegalScope({...candidate,effectiveFrom:"2026-02-30"})).toMatch(/vigência/i);
    expect(validateUrbanLegalScope({...candidate,effectiveUntil:"2026-01-01"})).toMatch(/vigência/i);
  });
  it("nunca usa citações de outro município, zona, uso ou período",()=>{
    expect(urbanLegalEvidenceAppliesTo(row,rule,"2026-08-10")).toBe(true);
    expect(urbanLegalEvidenceAppliesTo(row,{...rule,zone_code:"ZR2"},"2026-08-10")).toBe(false);
    expect(urbanLegalEvidenceAppliesTo(row,{...rule,use_code:"COMERCIAL"},"2026-08-10")).toBe(false);
    expect(urbanLegalEvidenceAppliesTo(row,{...rule,municipality_id:"different"},"2026-08-10")).toBe(false);
    expect(urbanLegalEvidenceAppliesTo(row,rule,"2027-01-01")).toBe(false);
    expect(urbanLegalEvidenceAppliesTo(row,rule,"2023-12-30")).toBe(false);
  });
  it("não oferece citação incompatível ao rascunho municipal",()=>{
    const draft={zoneCode:"ZR1",useCode:"RESIDENCIAL",effectiveFrom:"2026-08-10",effectiveUntil:""};
    expect(urbanLegalScopeMatchesDraft(row,draft)).toBe(true);
    expect(urbanLegalScopeMatchesDraft(row,{...draft,zoneCode:"ZR2"})).toBe(false);
    expect(urbanLegalScopeMatchesDraft(row,{...draft,effectiveFrom:"2028-01-01"})).toBe(false);
  });
  it("servidor exige vínculo, nega escrita antiga e checa vigência da pré-análise",()=>{
    const sql=readFileSync(resolve(process.cwd(),"neon/migrations/20261024_urban_legal_scope_binding_v4.sql"),"utf8");
    const client=readFileSync(resolve(process.cwd(),"src/integrations/backend/urbanLegalEvidenceClient.ts"),"utf8");
    const precheck=readFileSync(resolve(process.cwd(),"src/integrations/backend/urbanPrecheckClient.ts"),"utf8");
    expect(sql).toContain("urban_legal_evidence_scopes");
    expect(sql).toContain("and s.zone_code=upper(btrim(_zone))");
    expect(sql).toContain("s.effective_from<=_reference_date");
    expect(sql).toContain("s.effective_until>=_reference_date");
    expect(sql).toContain("revoke execute on function public.save_urban_legal_evidence_v1(");
    expect(sql).toContain("revoke execute on function public.save_urban_precheck_run_v3(");
    expect(client).toContain("list_urban_legal_evidence_v2");
    expect(client).toContain("save_urban_legal_evidence_scoped_v3");
    expect(precheck).toContain('invoke("save_urban_precheck_run_v4"');
  });
});
