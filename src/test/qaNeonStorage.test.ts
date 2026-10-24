import { afterEach, describe, expect, it, vi } from "vitest";
import { handleQaStorage, qaStorageReady } from "../../server/qa-storage";

const check = vi.hoisted(() => vi.fn());
vi.mock("../../server/municipal-storage.js", () => ({ callDataApiRpc: check }));
const send = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/client-s3", async (actual) => {
  const mod = await actual<typeof import("@aws-sdk/client-s3")>();
  return { ...mod, S3Client: class { send = send; } };
});
const signed = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: signed }));

const KEY = "municipalities/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/processes/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/qa.pdf";
function response() { return {
  statusCode: 200, data: "", headers: {} as Record<string, string>,
  setHeader(name: string, value: string) { this.headers[name] = value; },
  end(s: string) { this.data = s; },
}; }
function active() {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
  vi.stubEnv("SIGAPRO_QA_STORAGE_ENDPOINT", "https://br-solitary-sound-b4xlbvs6.storage.c-6.us-east-2.aws.neon.tech");
  vi.stubEnv("SIGAPRO_QA_STORAGE_BUCKET", "sigapro-qa-urban-documents");
  vi.stubEnv("SIGAPRO_QA_STORAGE_REGION", "us-east-2");
  vi.stubEnv("SIGAPRO_QA_STORAGE_ACCESS_KEY_ID", "nak_mock_for_unit_test");
  vi.stubEnv("SIGAPRO_QA_STORAGE_SECRET_ACCESS_KEY", "unit-test-only-not-a-real-storage-key");
}
afterEach(() => {vi.unstubAllEnvs();check.mockReset();send.mockReset();signed.mockReset();});
describe("SIGAPRO isolated Neon QA storage", () => {
  it("rejects missing credentials without touching production R2", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
    expect(qaStorageReady()).toBe(false);
    const res = response();
    await handleQaStorage({ method: "POST" } as never, res as never, "upload");
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.data).code).toBe("QA_STORAGE_NOT_READY");
    expect(send).not.toHaveBeenCalled();
  });
  it("rejects a forged endpoint even with credentials", () => {
    active();vi.stubEnv("SIGAPRO_QA_STORAGE_ENDPOINT", "https://production.r2.cloudflarestorage.com");
    expect(qaStorageReady()).toBe(false);
  });
  it("denies cross-tenant upload before S3", async () => {
    active();check.mockResolvedValue({ok:true,payload:false});
    const res=response();
    await handleQaStorage({ method:"POST",headers:{authorization:"Bearer synthetic"},body:{
      bucket:"sigapro-documentos",objectKey:KEY,contentType:"application/pdf",
      base64:Buffer.from("%PDF-1.4\\nqa").toString("base64")
    }} as never,res as never,"upload");
    expect(res.statusCode).toBe(403);expect(send).not.toHaveBeenCalled();
  });
  it("writes a correctly authorized synthetic PDF to the QA bucket", async () => {
    active();check.mockResolvedValue({ok:true,payload:true});send.mockResolvedValue({});
    const res=response();
    await handleQaStorage({method:"POST",headers:{authorization:"Bearer synthetic"},body:{
      bucket:"sigapro-documentos",objectKey:KEY,contentType:"application/pdf",
      base64:Buffer.from("%PDF-1.4\\nQA-only").toString("base64")
    }} as never,res as never,"upload");
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.data).storageProvider).toBe("neon_qa");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("refuses original payment guide document mutations", async () => {
    active();check.mockResolvedValue({ok:true,payload:true});
    const res=response();
    await handleQaStorage({method:"POST",headers:{authorization:"Bearer synthetic"},body:{
      bucket:"sigapro-documentos",
      objectKey:"municipalities/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/processes/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/dam-originals/qa.pdf"
    }} as never,res as never,"delete");
    expect(res.statusCode).toBe(409);expect(send).not.toHaveBeenCalled();
  });
});
