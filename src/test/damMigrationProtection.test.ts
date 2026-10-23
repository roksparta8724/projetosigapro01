import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("neon/migrations/20261021_dam_original_and_provider_persistence.sql", "utf8");
const signedRead = readFileSync("server/api/r2-sign-get.ts", "utf8");

describe("DAM persistence migration", () => {
  it("blocks a second charge and protects compensated guides from every update path", () => {
    expect(sql).toContain("nullif(btrim(g.bank_reference),'') is null");
    expect(sql).toContain("Guia compensada é imutável");
    expect(sql).toContain("create trigger protect_dam_original before update");
  });
  it("binds the immutable R2 original to municipality, process, guide and SHA-256", () => {
    expect(sql).toContain("'/processes/' || g.process_id || '/dam-originals/'");
    expect(sql).toContain("original_pdf_sha256");
    expect(sql).toContain("create trigger protect_dam_original_delete before delete");
    expect(sql).toContain("authorize_payment_guide_original_read_v1");
    expect(signedRead).toContain('callDataApiRpc(req, "authorize_payment_guide_original_read_v1"');
  });
});
