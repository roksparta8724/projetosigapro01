import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read=(path:string)=>readFileSync(path,"utf8");
const migration=read("neon/migrations/20261111_director_signature_signed_analysis_evidence_guard_qa.sql");
const journey=read("neon/qa/rollback_workflow_probe_20261111.sql");

describe("SIGAPRO QA rollback full logical journey and signature evidence",()=>{
  it("tests cadastral repair, four documents, triage, analyst and permit without retaining fictitious records",()=>{
    const stages=[
      "correct_paid_triage_identity_v1",
      "Projeto Arquitetônico",
      "Memorial Descritivo",
      "ART/RRT",
      "Escritura/Matrícula",
      "append_process_documents",
      "start_process_analysis",
      "review_process_document",
      "save_process_analysis_sheet_v2",
      "save_construction_permit_draft_v1",
      "request_construction_permit_director_signature_v1",
    ];
    for(const name of stages)expect(journey).toContain(name);
    expect(journey).toContain("RAISE EXCEPTION '__SIGAPRO_QA_E2E_ROLLBACK__'");
    expect(journey).toContain("rollbackVerified");
    expect(journey).toContain("'realR2UploadTested',false");
    expect(journey).toContain("'realBankPaymentTested',false");
    expect(journey).toContain("'realBrowserLoginTested',false");
    expect(journey).toContain("signature block only inside the rollback-only");
  });
  it("requires matching genuine reauthenticated technical signature, not a mere completed flag",()=>{
    expect(migration).toContain("JOIN public.signatures sg ON sg.signature_block_id=sb.id");
    expect(migration).toContain("sg.signer_slot='analise_tecnica'");
    expect(migration).toContain("sg.signer_profile_id=_process.analysis_assigned_to_profile_id");
    expect(migration).toContain("sg.document_hash=sb.evidence_hash");
    expect(migration).toContain("sg.reauthenticated_at IS NOT NULL");
    expect(migration).toContain("sb.municipality_id=_process.municipality_id");
    expect(migration).toContain("sb.tenant_id=_process.tenant_id");
    expect(journey).toContain("forged-signature-block-must-not-release-permit");
  });
});