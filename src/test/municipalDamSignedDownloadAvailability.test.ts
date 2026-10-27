import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

vi.mock("../../server/municipal-storage", () => ({
  callDataApiRpc: vi.fn(),
  resolveMunicipalDocumentTarget: vi.fn(),
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(),
}));

import { GetObjectCommand } from "@aws-sdk/client-s3";
import handler from "../../server/api/r2-sign-get";
import { callDataApiRpc, resolveMunicipalDocumentTarget } from "../../server/municipal-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const municipality = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const processId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const guideId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const originalPdf = Buffer.from("%PDF-1.4\\n1 0 obj\\n<<>>\\nendobj\\n%%EOF\\n".replace(/\\n/g, "\n"));
const pdfHash = createHash("sha256").update(originalPdf).digest("hex");
function originalResponse(bytes: Uint8Array = originalPdf) {
  return { ContentLength: bytes.byteLength, Body: { transformToByteArray: async () => new Uint8Array(bytes) } };
}
const logicalKey = `municipalities/${municipality}/processes/${processId}/dam-originals/${guideId}/${pdfHash}.pdf`;

function request() {
  return {
    method: "POST",
    headers: { authorization: "Bearer synthetic-test" },
    body: { bucket: "process-documents", objectKey: logicalKey },
  } as unknown as IncomingMessage;
}
function response() {
  let body = "";
  const res = {
    statusCode: 200,
    setHeader: vi.fn(),
    end: vi.fn((chunk = "") => { body = String(chunk); }),
  } as unknown as ServerResponse;
  return { res, body: () => JSON.parse(body) as Record<string, unknown> };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(callDataApiRpc).mockResolvedValue({ ok: true, status: 200, payload: true, error: "" });
});

describe("SIGAPRO municipal S3 original PDF download availability", () => {
  it("checks physical S3 existence before signing access to an existing immutable guide", async () => {
    const send = vi.fn().mockResolvedValue(originalResponse());
    vi.mocked(resolveMunicipalDocumentTarget).mockResolvedValue({
      client: { send }, bucket: "municipal-documents",
      objectKey: `prefeitura-objects/${logicalKey}`,
    } as never);
    vi.mocked(getSignedUrl).mockResolvedValue("https://example.test/private-signed-pdf");
    const { res, body } = response();
    await handler(request(), res);
    expect(res.statusCode).toBe(200);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
    expect((send.mock.calls[0][0] as GetObjectCommand).input).toMatchObject({
      Bucket: "municipal-documents", Key: `prefeitura-objects/${logicalKey}`,
    });
    expect(getSignedUrl).toHaveBeenCalledOnce();
    expect(body().signedUrl).toBe("https://example.test/private-signed-pdf");
  });

  it("never generates a misleading signed link when the municipal PDF is absent", async () => {
    const send = vi.fn().mockRejectedValue(new Error("NoSuchKey"));
    vi.mocked(resolveMunicipalDocumentTarget).mockResolvedValue({
      client: { send }, bucket: "municipal-documents", objectKey: logicalKey,
    } as never);
    const { res, body } = response();
    await handler(request(), res);
    expect(res.statusCode).toBe(500);
    expect(body().signedUrl).toBeUndefined();
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects a replaced municipal original when bytes differ from the Neon SHA-256", async () => {
    const tampered = Buffer.from("%PDF-1.4\\nREPLACED\\n%%EOF".replace(/\\n/g, "\n"));
    const send = vi.fn().mockResolvedValue(originalResponse(tampered));
    vi.mocked(resolveMunicipalDocumentTarget).mockResolvedValue({
      client: { send }, bucket: "municipal-documents", objectKey: logicalKey,
    } as never);
    const { res, body } = response();
    await handler(request(), res);
    expect(res.statusCode).toBe(500);
    expect(String(body().error)).toMatch(/CONFLITO DE INTEGRIDADE/);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it("does not contact municipal storage when guide authorization fails", async () => {
    vi.mocked(callDataApiRpc).mockResolvedValue({ ok: false, status: 403, payload: false, error: "" });
    const { res, body } = response();
    await handler(request(), res);
    expect(res.statusCode).toBe(403);
    expect(body().signedUrl).toBeUndefined();
    expect(resolveMunicipalDocumentTarget).not.toHaveBeenCalled();
  });
});
