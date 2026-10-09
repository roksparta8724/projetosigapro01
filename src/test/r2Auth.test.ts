import { afterEach, beforeEach, describe, expect, it } from "vitest";
import deleteHandler from "../../api/r2-delete";
import uploadHandler from "../../api/r2-upload";
import signGetHandler from "../../api/r2-sign-get";

function makeReq(body: Record<string, unknown> = {}, authorization?: string) {
  return {
    method: "POST",
    body,
    headers: authorization ? { authorization } : {},
  } as any;
}

function makeRes() {
  let payload = "";
  const headers = new Map<string, unknown>();
  const res = {
    statusCode: 200,
    setHeader(name: string, value: unknown) {
      headers.set(name.toLowerCase(), value);
    },
    end(value?: unknown) {
      payload = value == null ? "" : String(value);
    },
  } as any;

  return {
    res,
    read() {
      return {
        status: res.statusCode,
        body: payload ? JSON.parse(payload) : null,
        headers,
      };
    },
  };
}

describe("R2 production handler auth contract", () => {
  const previousVercelEnv = process.env.VERCEL_ENV;
  const previousRequireAuth = process.env.R2_REQUIRE_AUTH;
  const previousEndpoint = process.env.R2_ENDPOINT;
  const previousAccessKey = process.env.R2_ACCESS_KEY_ID;
  const previousSecret = process.env.R2_SECRET_ACCESS_KEY;

  beforeEach(() => {
    process.env.VERCEL_ENV = "production";
    delete process.env.R2_REQUIRE_AUTH;
  });

  afterEach(() => {
    if (previousVercelEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = previousVercelEnv;
    if (previousRequireAuth === undefined) delete process.env.R2_REQUIRE_AUTH;
    else process.env.R2_REQUIRE_AUTH = previousRequireAuth;
    if (previousEndpoint === undefined) delete process.env.R2_ENDPOINT;
    else process.env.R2_ENDPOINT = previousEndpoint;
    if (previousAccessKey === undefined) delete process.env.R2_ACCESS_KEY_ID;
    else process.env.R2_ACCESS_KEY_ID = previousAccessKey;
    if (previousSecret === undefined) delete process.env.R2_SECRET_ACCESS_KEY;
    else process.env.R2_SECRET_ACCESS_KEY = previousSecret;
  });

  for (const [name, handler] of [
    ["upload", uploadHandler],
    ["delete", deleteHandler],
  ] as const) {
    it(`blocks anonymous ${name} in Vercel production`, async () => {
      const response = makeRes();
      await handler(makeReq(), response.res);
      expect(response.read()).toMatchObject({
        status: 401,
        body: { error: "Autenticação necessária." },
      });
    });
  }

  it("keeps signed reads public without invoking authenticated-profile validation", async () => {
    process.env.R2_ENDPOINT = "https://r2.invalid.example";
    process.env.R2_ACCESS_KEY_ID = "0123456789abcdef0123456789abcdef";
    process.env.R2_SECRET_ACCESS_KEY = "test-secret";
    const response = makeRes();

    await signGetHandler(
      makeReq({ bucket: "not-an-allowed-bucket", objectKey: "x" }),
      response.res,
    );

    expect(response.read()).toMatchObject({
      status: 400,
      body: { error: "Bucket inválido." },
    });
  });
});
