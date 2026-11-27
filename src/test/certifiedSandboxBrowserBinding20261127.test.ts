import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {validateSandboxStart,validateSandboxProof} from "@/integrations/esign/certifiedSandboxClient";
import {vi} from "vitest";
vi.mock("@/integrations/backend/databaseClient",()=>({backendClient:{}}));
vi.mock("@/integrations/esign/artifactClient",()=>({getProcessArtifactSignatureRequest:vi.fn()}));
const now=Date.now(),state="a".repeat(43);
const start={authorizationUrl:"https://cas.staging.iti.br/oauth2.0/authorize?scope=sign+icp_brasil&state="+state,ticket:"fictional",state,expiresAt:now+10000,environment:"sandbox",issuanceAuthorized:false};
describe("Browser and route contract for ICP sandbox",()=>{
 it("allows only an exact staging authorization URL and state",()=>{
  expect(validateSandboxStart(start,now)).toEqual(start);
  for(const v of [{...start,authorizationUrl:start.authorizationUrl.replace("cas.staging.iti.br","cas.staging.iti.br.evil.invalid")},{...start,state:"b".repeat(43)},{...start,expiresAt:now},{...start,issuanceAuthorized:true}])expect(()=>validateSandboxStart(v,now)).toThrow();
 });
 it("requires verified archived bytes and forbids a claim of official issuance",()=>{
  const proof={manifestRecorded:true,archiveVerified:true,issuanceAuthorized:false,pdfPolicyVerified:false,sha256:"b".repeat(64),environment:"sandbox"};
  expect(validateSandboxProof(proof)).toEqual(proof);
  expect(()=>validateSandboxProof({...proof,issuanceAuthorized:true})).toThrow();
  expect(()=>validateSandboxProof({...proof,archiveVerified:false})).toThrow();
  expect(()=>validateSandboxProof({...proof,manifestRecorded:false})).toThrow();
 });
 it("preserves the serverless budget and both permit dialogs",()=>{
  const v=JSON.parse(readFileSync("vercel.json","utf8"));
  expect(v.rewrites).toContainEqual({source:"/api/certified-icp-sandbox",destination:"/api/e-sign-artifact?action=certified-icp-sandbox"});
  expect(readFileSync("api/e-sign-artifact.ts","utf8")).toContain('import("../server/certified-icp-sandbox-http.js")');
  for(const file of ["ConstructionPermitPanel","HabiteSePermitPanel"])expect(readFileSync("src/components/platform/"+file+".tsx","utf8")).toContain("sandbox={");
  const client=readFileSync("src/integrations/esign/certifiedSandboxClient.ts","utf8");
  expect(client).toContain("event.source!==popup");
  expect(client).toContain("event.origin!==window.location.origin");
  expect(client).not.toContain("localStorage");
 });
});
