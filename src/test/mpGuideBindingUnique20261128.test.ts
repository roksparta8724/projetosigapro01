import {readFileSync} from "node:fs";
import {describe,it,expect} from "vitest";
const sql=readFileSync("neon/migrations/20261128_mp_guide_binding_unique_v1.sql","utf8");
describe("Bank identity is enforced in Neon",()=>{
 it("prevents concurrent duplicate order and payment identifiers",()=>{
  expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS payment_guides_mp_order_unique_v1");
  expect(sql).toContain("CREATE UNIQUE INDEX IF NOT EXISTS payment_guides_mp_payment_unique_v1");
  expect(sql).toContain("municipality_id, (btrim(bank_reference))");
  expect(sql).toContain("municipality_id, (btrim(bank_payment_id))");
 });
 it("preserves existing immutable bank identity and permits initial payment attachment",()=>{
  expect(sql).toContain("NEW.bank_reference IS DISTINCT FROM OLD.bank_reference");
  expect(sql).toContain("NEW.bank_payment_id IS DISTINCT FROM OLD.bank_payment_id");
  expect(sql).toContain("nullif(btrim(OLD.bank_payment_id),'') IS NOT NULL");
  expect(sql).toContain("NEW.provider_environment IS DISTINCT FROM OLD.provider_environment");
 });
});
