import { afterEach, describe, expect, it, vi } from "vitest";
import { isCreateOnlyDocumentBucket } from "../../server/api/r2-upload";

afterEach(() => vi.unstubAllEnvs());

describe("R2 and municipal S3 uploads: create-once process document keys", () => {
  it("protects all process-document uploads, not only signed fiche and DAM paths", () => {
    expect(isCreateOnlyDocumentBucket("sigapro-documentos")).toBe(true);
    expect(isCreateOnlyDocumentBucket("sigapro-logos")).toBe(false);
    expect(isCreateOnlyDocumentBucket("institutional-branding")).toBe(false);
  });
  it("honors each environment's actual R2 document bucket", () => {
    vi.stubEnv("R2_BUCKET_DOCUMENTOS", "prefeitura-documents");
    expect(isCreateOnlyDocumentBucket("prefeitura-documents")).toBe(true);
    expect(isCreateOnlyDocumentBucket("sigapro-documentos")).toBe(false);
  });
  it("requires a conditional PUT on both R2 and municipal S3 paths", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync("server/api/r2-upload.ts", "utf8");
    expect(src.split('IfNoneMatch: "*"').length - 1).toBe(2);
    expect(src).toContain('isCreateOnlyDocumentBucket(input.bucket)');
    expect(src).toContain('isCreateOnlyDocumentBucket(bucket)');
    expect(src).toContain('code: "DOCUMENT_ALREADY_EXISTS"');
    expect(src).toContain('code: "SIGNED_PDF_IMMUTABLE"');
  });
});
