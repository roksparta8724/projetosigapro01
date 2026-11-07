import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  isEligiblePrivateR2Document,
  classifyR2SignFailure,
} from "../../server/api/r2-sign-get";
import {
  isPublicLegislationPdfKey,
  isSafeR2ObjectKey,
  signedR2Ttl,
} from "../../server/r2-object-key-validation";

const city = "49dac0b6-6352-4744-9aab-9ff91c59d970";
const foreign = "14dac0b6-6352-4744-9aab-9ff91c59d970";
const documentId = "2244ccaa-1111-4111-8111-123456abcdef";
const processId = "1244ccaa-1111-4111-8111-123456abcdef";
const objectPath = "municipalities/" + city + "/processes/" + processId + "/project.pdf";
const row = {
  id: documentId,
  process_id: processId,
  municipality_id: city,
  tenant_id: city,
  file_path: objectPath,
  version: 2,
  is_valid: true,
  invalidated_at: null,
};

describe("SIGAPRO QA — R2: não assinar objeto municipal sem autorização da versão", () => {
  it("só aceita arquivo exato, vigente e vinculado ao próprio processo/município", () => {
    expect(isEligiblePrivateR2Document(row, objectPath, city)).toBe(true);
    expect(isEligiblePrivateR2Document({...row, version: 0}, objectPath, city)).toBe(false);
    expect(isEligiblePrivateR2Document({...row, version: "2"}, objectPath, city)).toBe(false);
    expect(isEligiblePrivateR2Document({...row, is_valid: false}, objectPath, city)).toBe(false);
    expect(isEligiblePrivateR2Document({...row, invalidated_at: "2026-11-07T00:00:00Z"}, objectPath, city)).toBe(false);
    expect(isEligiblePrivateR2Document({...row, invalidated_at: undefined}, objectPath, city)).toBe(false);
    expect(isEligiblePrivateR2Document({...row, tenant_id: foreign}, objectPath, city)).toBe(false);
    expect(isEligiblePrivateR2Document({...row, municipality_id: foreign}, objectPath, city)).toBe(false);
    expect(isEligiblePrivateR2Document({...row, file_path: objectPath + ".bak"}, objectPath, city)).toBe(false);
    expect(isEligiblePrivateR2Document({...row, process_id: "other"}, objectPath, city)).toBe(false);
    expect(isEligiblePrivateR2Document({...row, id: "not-uuid"}, objectPath, city)).toBe(false);
    expect(isEligiblePrivateR2Document(row, objectPath, foreign)).toBe(false);
    expect(isEligiblePrivateR2Document(null, objectPath, city)).toBe(false);
    // Some older records have no redundant municipality_id, but tenant_id is required.
    expect(isEligiblePrivateR2Document({...row, municipality_id: null}, objectPath, city)).toBe(true);
    expect(isEligiblePrivateR2Document({...row, tenant_id: null}, objectPath, city)).toBe(false);
  });

  it("never signs a traversal, control character, encoded segment or oversized key", () => {
    expect(isSafeR2ObjectKey(objectPath)).toBe(true);
    for (const bad of [
      "municipalities/" + city + "/../other/file.pdf", objectPath + "?signature=fake",
      "municipalities/" + city + "//private/file.pdf", "/municipalities/file.pdf",
      "municipalities\\evil\\file.pdf", objectPath + "%2Fhidden", objectPath + "\n",
      objectPath + "#fragment", objectPath + "/.", objectPath + "/..",
      "x".repeat(1025), "",
    ]) expect(isSafeR2ObjectKey(bad)).toBe(false);
  });

  it("preserves official municipal legislation PDFs but denies public bypasses", () => {
    expect(isPublicLegislationPdfKey("municipalities/" + city + "/legislation-plano-diretor/2026/" + documentId + "-plano.pdf")).toBe(true);
    expect(isPublicLegislationPdfKey("municipalities/" + city + "/legislation-registry/published/" + documentId + "-lei.pdf")).toBe(true);
    expect(isPublicLegislationPdfKey("municipalities/" + city + "/legislation/lei-379.pdf")).toBe(true);
    expect(isPublicLegislationPdfKey(objectPath)).toBe(false);
    expect(isPublicLegislationPdfKey("municipalities/" + city + "/legislation-plano-diretor/private/secrets.env")).toBe(false);
    expect(isPublicLegislationPdfKey("municipalities/" + city + "/legislation/../processes/secret.pdf")).toBe(false);
    expect(isPublicLegislationPdfKey("municipalities/" + city + "/legislation-private/secret.pdf")).toBe(false);
  });

  it("shortens private signed URLs and handles invalid TTL safely", () => {
    expect(signedR2Ttl(86400, true)).toBe(900);
    expect(signedR2Ttl(undefined, true)).toBe(900);
    expect(signedR2Ttl(30, true)).toBe(60);
    expect(signedR2Ttl(4000, false)).toBe(3600);
    expect(signedR2Ttl(NaN, true)).toBe(900);
    expect(signedR2Ttl(20.5, false)).toBe(3600);
  });

  it("does not expose provider errors, secret-bearing messages or false success", () => {
    expect(classifyR2SignFailure(Object.assign(new Error("Not found"),{$metadata:{httpStatusCode:404}})))
      .toMatchObject({status:404,code:"R2_OBJECT_NOT_FOUND"});
    expect(classifyR2SignFailure({name:"SignatureDoesNotMatch",message:"key=SECRET"}))
      .toMatchObject({status:503,code:"R2_STORAGE_AUTH_FAILED"});
    expect(classifyR2SignFailure({name:"UnknownError",message:"private presigned url https://example/?signature=secret"}))
      .toMatchObject({status:503,code:"R2_UNAVAILABLE"});
    expect(JSON.stringify(classifyR2SignFailure({message:"secret123 token"}))).not.toContain("secret123");
    expect(classifyR2SignFailure(new Error("R2_BODY_LIMIT")).status).toBe(413);
    expect(classifyR2SignFailure(new Error("R2_BODY_INVALID")).status).toBe(400);
  });

  it("enforces RLS + role RPC + document validity before generating a presigned URL", () => {
    const api = readFileSync("server/api/r2-sign-get.ts", "utf8");
    const guard = api.indexOf("isEligiblePrivateR2Document(document, objectKey, keyMunicipalityId)");
    const rpc = api.indexOf('"authorize_technical_document_signing_v1"');
    const signer = api.indexOf("    const municipalTarget = municipalityId");
    expect(guard).toBeGreaterThan(-1);
    expect(rpc).toBeGreaterThan(guard);
    expect(signer).toBeGreaterThan(rpc);
    expect(api).toContain('select: "id,process_id,municipality_id,tenant_id,file_path,version,is_valid,invalidated_at"');
    expect(api).toContain('limit: "2"');
    expect(api).toContain("MAX_SIGN_REQUEST_BYTES = 4096");
    expect(api).toContain("await municipalTarget.client.send(new HeadObjectCommand");
    expect(api).toContain("municipalTarget.client.destroy();");
    expect(api).toContain("client.destroy();");
    expect(api).toContain('redirect: "error"');

    expect(api).not.toContain('console.log("[ProdAudit][R2Sign] env"');
    expect(api).not.toContain('error: rawMessage');
    const legislation = readFileSync("api/legislation-open.ts", "utf8");
    expect(legislation).toContain("isPublicLegislationPdfKey(objectKey)");
    expect(legislation).toContain("getR2EndpointCandidates()");
    expect(legislation).toContain("HeadObjectCommand");
    expect(legislation).not.toContain("error.message");
    const config = readFileSync("vitest.config.ts", "utf8");
    expect(config).toContain('"server/**/*.{test,spec}.{ts,tsx}"');

  });
});
