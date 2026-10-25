import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration=readFileSync(
  "neon/migrations/20261025_qa_document_provenance_independent_attestation_v2.sql","utf8"
);
const handler=readFileSync("functions/sigaproqa/index.js","utf8");
const normalized=migration.toLowerCase();

describe("SIGAPRO QA independent document provenance is fail-closed",()=>{
  it("keeps the trusted evidence table private and never backfills legacy records automatically",()=>{
    expect(normalized).toContain("create table if not exists public.qa_verified_document_provenance_v1");
    expect(normalized).toContain("enable row level security");
    expect(normalized).toContain("revoke all on table public.qa_verified_document_provenance_v1 from authenticated");
    expect(normalized).not.toMatch(/insert\s+into\s+public\.qa_verified_document_provenance_v1/);
  });
  it("requires independent proof as well as the catalog before delegated recovery",()=>{
    expect(normalized).toMatch(/inner join public\.qa_verified_document_provenance_v1 proof/);
    expect(normalized).toContain("public.qa_storage_process_tenant_access_v1(_process_id,_tenant_id)");
    expect(normalized).toContain("proof.object_key=doc.file_path");
    expect(normalized).toContain("doc.is_valid=true");
  });
  it("obtains the trusted digest separately and rejects altered storage bytes",()=>{
    expect(normalized).toContain("create or replace function public.qa_storage_verified_file_sha_v1");
    expect(normalized).toContain("proof.content_sha256");
    expect(handler).toContain('rpc(token,"qa_storage_verified_file_sha_v1"');
    expect(handler).toContain('sha(new Uint8Array(raw))!==verifiedBytesSha');
    expect(handler).toContain("QA_STORAGE_INTEGRITY_MISMATCH");
    expect(handler).toContain("QA_PROVENANCE_NOT_VERIFIED");
  });
});
