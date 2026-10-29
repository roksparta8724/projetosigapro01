import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const sql=readFileSync("scripts/municipal-new-process-activation-gate.sql","utf8");
describe("municipal onboarding: never equate configured profile with production acceptance",()=>{
 it("does not change historic guides or create test payments",()=>{
  expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER)\s+(?:INTO\s+|FROM\s+|TABLE\s+)?public\./i);
  expect(sql).not.toContain("payment_guides");
  expect(sql).toContain("somente leitura");
 });
 it("checks plan, finance, laws and configured provider per municipality",()=>{
  for(const name of ["client_plan_assignments","tenant_memberships","urban_regulation_versions",
   "municipal_collection_configurations","municipal_payment_provider_connections",
   "credentials_ciphertext","last_test_status='ok'","p.environment=c.environment",
   "municipality_id","financial_operator_active","analyst_active"])
   expect(sql).toContain(name);
 });
 it("never treats bank config as proof of real payment or director signature",()=>{
  expect(sql).toContain("READY_FOR_AUTHENTICATED_PAYMENT_AND_PERMIT_E2E");
  expect(sql).toContain("PENDING_EXTERNAL_MUNICIPAL_GATEWAY_E2E");
  expect(sql).toContain("REAL_BANK_CREDIT_PDF_SHA_DIRECTOR_SIGNATURE_BROWSER_AND_TWO_TENANT_ACCEPTANCE_REQUIRED");
 });
});