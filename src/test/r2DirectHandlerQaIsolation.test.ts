import { afterEach, describe, expect, it, vi } from "vitest";
import upload from "../../server/api/r2-upload";
import remove from "../../server/api/r2-delete";

afterEach(() => vi.unstubAllEnvs());

describe("SIGAPRO QA R2 direct serverless entrypoints", () => {
  it.each([["upload", upload], ["delete", remove]])("blocks %s before storage work", async (_name, handler) => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
    const res = {
      statusCode: 200,
      body: "",
      headers: {} as Record<string, string>,
      setHeader(k: string, v: string) { this.headers[k] = v; },
      end(value: string) { this.body = value; },
    };
    await handler({method: "POST",headers:{},url:"/api/r2"} as never,res as never);
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).code).toBe("QA_R2_WRITE_DISABLED");
  });
});
