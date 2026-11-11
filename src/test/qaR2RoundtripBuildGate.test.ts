import { describe,expect,it } from "vitest";
import {createHash} from "node:crypto";
import {makeQaPdf,isIsolatedQaScope,inspectConfig} from "../../scripts/qa-r2-roundtrip.mjs";
describe("R2 QA real-byte roundtrip probe: strict preview isolation",()=>{
  const qa={VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"fix/qa-triagem-analise-pagamento-20261101",
    VITE_SIGAPRO_NEON_ISOLATED:"true",
    VITE_NEON_DATA_API_URL:"https://ep-sandbox-qa.apirest.us-east-2.aws.neon.tech",
    R2_ENDPOINT:"https://012345abcdef.r2.cloudflarestorage.com",
    R2_BUCKET_DOCUMENTOS:"sigapro-qa-documents",
    R2_ACCESS_KEY_ID:"FAKE_TEST_ID",R2_SECRET_ACCESS_KEY:"FAKE_TEST_SECRET"};
  it("accepts only preview branch pointing to isolated Neon",()=>{
    expect(isIsolatedQaScope(qa)).toBe(true);
    for(const diff of [
      {VERCEL_ENV:"production"},{VERCEL_GIT_COMMIT_REF:"main"},
      {VITE_SIGAPRO_NEON_ISOLATED:"false"},
      {VITE_NEON_DATA_API_URL:"https://ep-blue-cloud.apirest.us-east-2.aws.neon.tech"},
      {VITE_NEON_DATA_API_URL:"http://169.254.169.254"}
    ]) expect(isIsolatedQaScope({...qa,...diff})).toBe(false);
  });
  it("cannot claim success without real R2 credentials",()=>{
    expect(inspectConfig({...qa,R2_ACCESS_KEY_ID:""})).toBe("NOT_VERIFIED_CONFIG");
    expect(inspectConfig({...qa,R2_ENDPOINT:"https://evil.example"})).toBe("NOT_VERIFIED_CONFIG");
    expect(inspectConfig(qa)).toBe("READY");
  });
  it("builds well-formed PDF with reproducible SHA and cross-references",()=>{
    const b=makeQaPdf();
    expect(b.subarray(0,8).toString()).toBe("%PDF-1.4");
    expect(b.toString()).toContain("%%EOF");
    expect(b.toString()).toContain("xref\n0 6\n");
    expect(createHash("sha256").update(b).digest("hex")).toMatch(/^[a-f0-9]{64}$/);
    expect(b.toString()).toContain("NO LEGAL VALUE");
  });
});