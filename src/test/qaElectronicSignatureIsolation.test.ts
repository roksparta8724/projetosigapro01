import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/e-sign-artifact";

function response() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: "",
    setHeader(name: string, value: string) { this.headers[name] = value; },
    end(value?: string) { this.body = value || ""; },
  };
}

afterEach(() => vi.unstubAllEnvs());

describe("SIGAPRO QA electronic signing isolation", () => {
  it.each(["GET", "POST"])("rejects %s before signing logic in isolated preview", async method => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
    const out = response();
    await handler({ method, url: "/api/e-sign-artifact" } as never, out as never);
    expect(out.statusCode).toBe(503);
    const payload = JSON.parse(out.body);
    expect(payload.code).toBe("QA_E_SIGNATURE_DISABLED");
    expect(payload.ok).toBe(false);
  });

  it("keeps production unsupported-method semantics", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
    const out = response();
    await handler({ method: "DELETE", url: "/api/e-sign-artifact" } as never, out as never);
    expect(out.statusCode).toBe(405);
    expect(JSON.parse(out.body).code).toBe("METHOD_NOT_ALLOWED");
  });
});
