import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/legislation-open";

const signUrl = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: signUrl }));

const QA_PDF = "/api/legislation-open?objectKey=municipalities/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/legislation/zoneamento.pdf";

function response() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: "",
    setHeader(name: string, value: string) { this.headers[name] = value; },
    end(value?: string) { this.body = value || ""; },
  };
}

afterEach(() => { vi.unstubAllEnvs(); signUrl.mockReset(); });

describe("SIGAPRO isolated QA must never sign official legislation R2 objects", () => {
  it.each(["GET", "POST"])("blocks %s before R2 signing in preview QA", async method => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
    vi.stubEnv("R2_ENDPOINT", "https://official-r2.example.invalid");
    vi.stubEnv("R2_ACCESS_KEY_ID", "never-used-qa");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "never-used-qa");
    const res = response();
    await handler({ method, url: QA_PDF } as never, res as never);
    expect(res.statusCode).toBe(503);
    expect(res.headers["Cache-Control"]).toBe("no-store");
    expect(res.body).toContain("Acervo isolado de QA");
    expect(res.headers.Location).toBeUndefined();
    expect(signUrl).not.toHaveBeenCalled();
  });

  it("preserves production's normal validation behavior", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
    const res = response();
    await handler({ method: "GET", url: "/api/legislation-open?objectKey=invalid" } as never, res as never);
    expect(res.statusCode).toBe(400);
    expect(signUrl).not.toHaveBeenCalled();
  });

  it("preserves the regular nonisolated preview validation behavior", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "false");
    const res = response();
    await handler({ method: "GET", url: "/api/legislation-open?objectKey=invalid" } as never, res as never);
    expect(res.statusCode).toBe(400);
    expect(signUrl).not.toHaveBeenCalled();
  });
});
