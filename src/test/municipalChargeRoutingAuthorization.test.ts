import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const api=readFileSync("api/collection-configuration.ts","utf8");
const page=readFileSync("src/pages/saas/ExternalPaymentsPage.tsx","utf8");
describe("bank-neutral municipal payment routing authorization",()=>{
 it("requires canonical guide access before reporting provider to professional",()=>{
  expect(api).toContain('if (action === "guide_provider")');
  expect(api).toContain("readStoredGuide(req,municipalityId,guideCode)");
  expect(api).toContain("guide.municipality_id!==municipalityId");
 });
 it("returns only safe provider metadata, never secrets or bank key",()=>{
  const segment=api.split('if (action === "guide_provider")')[1].split('if (action === "get")')[0];
  expect(segment).toContain("provider:String(configuration.provider");
  expect(segment).not.toContain("credentials_ciphertext:");
  expect(segment).not.toContain("webhook_secret_ciphertext:");
  expect(segment).not.toContain("accessToken:");
  expect(segment).not.toContain("credential_fingerprint:");
 });
 it("external professionals never call admin-only payment connection RPC",()=>{
  expect(page).toContain('"collection-configuration", effectiveScopeId, "guide_provider"');
  expect(page).not.toContain('"payment-connection", effectiveScopeId, "get"');
  expect(page).toContain("resolveMunicipalChargeRoute(officialOriginal!,connection,null)");
 });
});
