import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  "neon/migrations/20261025_qa_scope_new_preprotocol_document_keys_v1.sql",
  "utf8",
);
const uploader = readFileSync("src/integrations/r2/storage.ts", "utf8");
const page = readFileSync("src/pages/saas/ProtocolarProjetoPage.tsx", "utf8");

describe("SIGAPRO QA — new draft document paths belong to uploader", () => {
  it("limits changes to isolated QA and requires earlier municipal review protections", () => {
    expect(migration).toContain("current_database()<>'sigapro_migration_stage_20260923'");
    expect(migration).toContain("review_status=review_status");
    expect(migration).toContain("and coalesce(d.is_required,false)=false");
    expect(migration).toContain("Expected exactly one new-document insertion anchor");
    expect(migration).not.toMatch(/\b(?:truncate|delete from public\.process_documents|drop table)\b/i);
  });

  it("checks scope, uploader, file, byte size before linking any new reference", () => {
    expect(migration).toContain("coalesce(_process.municipality_id,_process.tenant_id)::text");
    expect(migration).toContain("_profile_id::text||'/%'");
    expect(migration).toContain("'/protocols/'");
    expect(migration).toContain("'/habite-se/'");
    expect(migration).toContain("split_part(_doc->>'filePath','/',5)");
    expect(migration).toContain("(_doc->>'filePath') like '%..%'");
    expect(migration).toContain("coalesce(nullif(_doc->>'fileSizeBytes','')::bigint,0) <= 0");
  });

  it("matches the actual frontend's legitimate upload layout", () => {
    expect(uploader).toContain("municipalities/${scopeId}/${folder}/${safeUserId}/${crypto.randomUUID()}");
    expect(page).toContain('isHabiteSeMode ? "habite-se" : "protocolos"');
    expect(page).toContain("userId: session.id");
    expect(page).toContain("fileSizeBytes: originalFile.size");
  });
});
