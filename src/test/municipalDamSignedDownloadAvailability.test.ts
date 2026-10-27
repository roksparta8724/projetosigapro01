import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";

vi.mock("../../server/municipal-storage", () => ({
  callDataApiRpc: vi.fn(),
  resolveMunicipalDocumentTarget: vi.fn(),
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(),
}));

import { HeadObjectCommand } from "@aws-sdk/client-s3";
import handler from "../../server/api/r2-sign-get";
import { callDataApiRpc, resolveMunicipalDocumentTarget } from "../../server/municipal-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const municipality = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const processId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const guideId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const pdfHash = "a".repeat(64);
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
    const send = vi.fn().mockResolvedValue({ ContentLength: 960 });
    vi.mocked(resolveMunicipalDocumentTarget).mockResolvedValue({
      client: { send }, bucket: "municipal-documents",
      objectKey: `prefeitura-objects/${logicalKey}`,
    } as never);
    vi.mocked(getSignedUrl).mockResolvedValue("https://example.test/private-signed-pdf");
    const { res, body } = response();
    await handler(request(), res);
    expect(res.statusCode).toBe(200);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
    expect((send.mock.calls[0][0] as HeadObjectCommand).input).toMatchObject({
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

  it("does not contact municipal storage when guide authorization fails", async () => {
    vi.mocked(callDataApiRpc).mockResolvedValue({ ok: false, status: 403, payload: false, error: "" });
    const { res, body } = response();
    await handler(request(), res);
    expect(res.statusCode).toBe(403);
    expect(body().signedUrl).toBeUndefined();
    expect(resolveMunicipalDocumentTarget).not.toHaveBeenCalled();
  });
});
