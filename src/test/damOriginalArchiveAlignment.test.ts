import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "neon/migrations/20261026_dam_original_archive_access_alignment.sql", "utf8",
);
const upload = readFileSync("server/api/r2-upload.ts", "utf8");
const signing = readFileSync("server/api/r2-sign-get.ts", "utf8");
const archival = readFileSync("src/lib/guideOriginal.ts", "utf8");
const external = readFileSync("src/pages/saas/ExternalPaymentsPage.tsx", "utf8");

describe("immutable guide originals: scope, database and R2 contract", () => {
  it("grants only archive access, not bank-provider mutation, to a process creator", () => {
    expect(migration).toContain("assert_dam_document_archiver_v2");
    expect(migration).toContain("public.has_tenant_access(_guide.municipality_id)");
    expect(migration).toContain("public.has_process_access(_guide.process_id)");
    expect(migration).toContain("public.current_role_code()");
    expect(migration).toContain("'profissional_externo'");
    expect(migration).toContain("pr.created_by_profile_id = actor");
    expect(migration).toContain("pr.municipality_id = _guide.municipality_id");
    expect(migration).not.toContain("create or replace function public.assert_dam_writer_v1");
    expect(migration).not.toContain("update public.profiles");
    expect(migration).not.toContain("delete from public.payment_guides");
  });

  it("freezes the exact payable guide snapshot and never overwrites an already archived PDF", () => {
    expect(migration).toContain("create or replace function public.freeze_payment_guide_document_v1");
    expect(migration).toContain("create or replace function public.attach_payment_guide_original_v1");
    expect(migration).toContain("if g.document_snapshot is not null then return to_jsonb(g); end if;");
    expect(migration).toContain("if g.original_pdf_key is not null then return to_jsonb(g); end if;");
    expect(migration).toContain("g.barcode");
    expect(migration).toContain("g.digitable_line");
    expect(migration).toContain("g.created_at");
    expect(migration).toContain("g.amount");
    expect(migration).toContain("protect_dam_original_delete");
    expect(migration).not.toContain("drop trigger if exists");
    expect(archival).toContain("await readGuideOriginal(municipalityId, code)");
    expect(archival).toContain("await openStoredGuide(original, target)");
    expect(archival).toContain("if (original.status === \"compensada\")");
  });

  it("matches the same sha256-based original object path in SQL, upload, signed reading and the browser", () => {
    expect(migration).toContain("'/processes/' || g.process_id || '/dam-originals/'");
    expect(archival).toContain("/processes/${original.process_id}/dam-originals/");
    expect(upload).toContain('"/dam-originals/"');
    expect(upload).toContain("authorize_payment_guide_original_upload_v2");
    expect(signing).toContain("authorize_payment_guide_original_read_v1");
    expect(upload).toContain('createHash("sha256")');
    expect(external).toContain("archiveAndOpenGuide(effectiveScopeId, guideDocument, reservedGuideWindow)");
  });
});
