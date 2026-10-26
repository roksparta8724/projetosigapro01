import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { S3Client } from "@aws-sdk/client-s3";
import { verifyImmutableDamOriginalAlreadyStored } from "../../server/lib/damOriginalS3";

const valid = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
const sha = createHash("sha256").update(valid).digest("hex");
const key = `municipalities/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/processes/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/dam-originals/cccccccc-cccc-4ccc-8ccc-cccccccccccc/${sha}.pdf`;
function mockStore(bytes: Uint8Array = valid, length: number | undefined = bytes.byteLength) {
  const send = vi.fn(async (_command: unknown) => ({
    ContentLength: length,
    Body: { transformToByteArray: async () => new Uint8Array(bytes) },
  }));
  return { client: { send } as unknown as S3Client, send };
}

describe("immutable municipal DAM original: AWS conditional 412 handling", () => {
  it("accepts an idempotent 412 only after a verified GET returns the same PDF bytes", async () => {
    const { client, send } = mockStore();
    await expect(verifyImmutableDamOriginalAlreadyStored(client, "process-documents", key))
      .resolves.toBeUndefined();
    expect(send).toHaveBeenCalledOnce();
    expect((send.mock.calls[0][0] as { constructor: { name: string } }).constructor.name).toBe("GetObjectCommand");
    expect((send.mock.calls[0][0] as { input: unknown }).input).toMatchObject({
      Bucket: "process-documents", Key: key,
    });
  });

  it("accepts identical PDF in a municipal S3 bucket with configured base path", async () => {
    const { client, send } = mockStore();
    const physicalKey = "prefeitura-arquivos/urbanismo/" + key;
    await expect(verifyImmutableDamOriginalAlreadyStored(
      client, "municipal-documentos", physicalKey, key,
    )).resolves.toBeUndefined();
    expect((send.mock.calls[0][0] as { input: unknown }).input).toMatchObject({
      Bucket: "municipal-documentos", Key: physicalKey,
    });
  });

  it("rejects municipal prefixes or foreign logical keys that could swap a guide", async () => {
    const { client, send } = mockStore();
    for (const badKey of [
      "prefeitura-arquivos/other-process/" + key.replace("/processes/", "/processes/../"),
      "prefeitura-arquivos/" + key.replace("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "ffffffff-ffff-4fff-8fff-ffffffffffff"),
      "prefix//" + key,
    ]) {
      await expect(verifyImmutableDamOriginalAlreadyStored(
        client, "municipal-documentos", badKey, key,
      )).rejects.toThrow("Referência permanente DAM inválida");
    }
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects conflicting content instead of incorrectly claiming an uploaded original", async () => {
    const { client } = mockStore(Buffer.from("%PDF-1.4\nTAMPERED\n%%EOF"));
    await expect(verifyImmutableDamOriginalAlreadyStored(client, "process-documents", key))
      .rejects.toThrow("CONFLITO DE INTEGRIDADE");
  });

  it("rejects files with a valid digest but invalid PDF magic or oversized bodies", async () => {
    const { client: invalidMagic } = mockStore(Buffer.from("not a PDF"));
    await expect(verifyImmutableDamOriginalAlreadyStored(invalidMagic, "process-documents", key))
      .rejects.toThrow("CONFLITO DE INTEGRIDADE");
    const { client: oversized } = mockStore(valid, 25 * 1024 * 1024 + 1);
    await expect(verifyImmutableDamOriginalAlreadyStored(oversized, "process-documents", key))
      .rejects.toThrow("excede o limite");
  });

  it("fails closed when the storage provider cannot return its existing object", async () => {
    const client = { send: vi.fn().mockRejectedValue(new Error("R2 unavailable")) } as unknown as S3Client;
    await expect(verifyImmutableDamOriginalAlreadyStored(client, "process-documents", key))
      .rejects.toThrow("R2 unavailable");
  });

  it("rejects invalid original keys without accessing any storage data", async () => {
    const { client, send } = mockStore();
    for (const invalid of ["", "misc/other.pdf", key.replace("/dam-originals/", "/dam-originals/extras/")]) {
      await expect(verifyImmutableDamOriginalAlreadyStored(client, "process-documents", invalid))
        .rejects.toThrow("Referência permanente DAM inválida");
    }
    expect(send).not.toHaveBeenCalled();
  });
});
