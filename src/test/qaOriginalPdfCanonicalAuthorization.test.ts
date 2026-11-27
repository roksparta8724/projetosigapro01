import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "neon/migrations/20261110_original_pdf_signing_strict_tenant_v1_qa.sql",
  "utf8",
);
const signer = readFileSync("server/api/r2-sign-get.ts", "utf8");
const client = readFileSync("src/lib/guideOriginal.ts", "utf8");

describe("SIGAPRO release — original DAM R2 never crosses municipality or changes SHA", () => {
  it("Neon checks guide, process, municipality and tenant agree before signing", () => {
    expect(sql).toContain("authorize_payment_guide_original_read_v1");
    expect(sql).toContain("p.id=g.process_id");
    expect(sql).toContain("p.municipality_id=g.municipality_id");
    expect(sql).toContain("p.tenant_id=g.municipality_id");
    expect(sql).toContain("IF NOT EXISTS (");
    expect(sql).toContain("THEN RETURN false; END IF;");
  });

  it("checks canonical original key with exact guide ID and PDF SHA-256", () => {
    expect(sql).toContain("g.original_pdf_sha256 !~ '^[a-f0-9]{64}$'");
    expect(sql).toContain("g.original_pdf_key IS DISTINCT FROM");
    expect(sql).toContain("g.process_id||'/dam-originals/'||g.id||'/'||g.original_pdf_sha256||'.pdf'");
    expect(sql).toContain("g.original_pdf_key=_object_key");
  });

  it("signing endpoint consults Neon before issuing R2 link and checks object existence", () => {
    const start = signer.indexOf('if (objectKey.includes("/dam-originals/"))');
    const end = signer.indexOf("const logosBucket", start);
    const flow = signer.slice(start, end);
    expect(start).toBeGreaterThan(0);
    expect(flow).toContain("authorize_payment_guide_original_read_v1");
    expect(flow).toContain("allowed.payload !== true");
    expect(signer).toContain("HeadObjectCommand");
    expect(signer).toContain("getSignedUrl(");
    expect(signer.indexOf("HeadObjectCommand")).toBeLessThan(signer.lastIndexOf("getSignedUrl("));
  });

  it("client reopens only immutable archived guide and never silently replaces paid PDF", () => {
    expect(client).toContain("if (await openStoredGuide(original, target)) return;");
    expect(client).toContain('if (isGuideSettled(original)) throw new Error("Guia paga sem PDF original arquivado.');
    expect(client).toContain("original.original_pdf_key !== originalObjectKey(original, original.original_pdf_sha256)");
    expect(client).toContain("getSignedUrlForObjectStrict");
  });

  it("migration changes authorization only, without changing or deleting financial records", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION");
    expect(sql).not.toMatch(/\bUPDATE\s+public\.payment_guides\b/i);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\s+public\.payment_guides\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
  });
});
