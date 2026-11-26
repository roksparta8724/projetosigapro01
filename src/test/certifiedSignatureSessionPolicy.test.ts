import { describe,it,expect } from "vitest";
import { readFileSync } from "node:fs";
const sql=readFileSync("neon/migrations/20261126_zzzzzzzzzzzzz_certified_signature_sessions_v1.sql","utf8");
describe("Private certified session safeguards",()=>{
 it("stores only hashed correlation secrets and binds the exact document, signer and municipality",()=>{
  expect(sql).toContain("state_sha256 text PRIMARY KEY");
  expect(sql).toContain("nonce_sha256 text NOT NULL");
  expect(sql).toContain("profile_id=_profile");
  expect(sql).toContain("municipality_id=_municipality");
  expect(sql).toContain("prepared_pdf_sha256 IS DISTINCT FROM _pdf_sha");
  expect(sql).toContain("byte_range_sha256 IS DISTINCT FROM _range_sha");
  expect(sql).toContain("current_snapshot IS DISTINCT FROM s.permit_snapshot_sha256");
 });
 it("consumes exactly once and exposes no client mutation or issuance",()=>{
  expect(sql).toContain("consumed_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE");
  expect(sql).toContain("SET consumed_at=clock_timestamp()");
  expect(sql).toContain("FROM PUBLIC, anonymous, authenticated");
  expect(sql).not.toMatch(/(?:INSERT INTO|UPDATE) public\.(?:signatures|signature_blocks|process_construction_permits|process_habite_se_permits)\b/i);
 });
});
