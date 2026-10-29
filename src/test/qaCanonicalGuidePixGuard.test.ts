import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync("neon/migrations/20261027_guide_archive_payable_canonical_pix_guard_v1.sql", "utf8");

describe("DAM archived guide requires bank authority and payable status", () => {
  it("blocks display-only previews from being frozen", () => {
    expect(migration).toContain("nonPayablePreview");
    expect(migration).toContain("Prévia não pagável não pode ser arquivada");
  });
  it("never accepts a browser-submitted unregistered PIX code", () => {
    expect(migration).toContain("is distinct from g.pix_code");
    expect(migration).toContain("pix_code = g.pix_code");
    expect(migration).not.toContain("pix_code = nullif(_snapshot");
  });
  it("requires valid original boleto numbers or an existing matching PIX", () => {
    expect(migration).toContain("coalesce(g.barcode,'') ~ '^[0-9]{44}$'");
    expect(migration).toContain("g.pix_code ~ '^000201");
  });
  it("never directly overwrites existing settled financial records", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.freeze_payment_guide_document_v1");
    expect(migration).not.toMatch(/\bDELETE\s+FROM\s+public\.payment_guides/i);
    expect(migration).not.toMatch(/\bUPDATE\s+public\.payment_guides\s+SET\s+(status|paid|amount|created_at|due_date)/i);
  });
});
