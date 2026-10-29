import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import handler from "../../api/municipality-logo-open";

const cityPrefix = "municipalities/49dac0b6-6352-4744-9aab-9ff91c59d970/branding/";

async function request(key: string, method = "GET") {
  const res = {
    statusCode: 200,
    setHeader: vi.fn(),
    end: vi.fn(),
  };
  const req = {
    method,
    url: "/api/municipality-logo-open?objectKey=" + encodeURIComponent(key),
  };
  await handler(req as never, res as never);
  return {
    code: res.statusCode,
    location: res.setHeader.mock.calls.find(([name]) => name === "Location")?.[1],
    body: res.end.mock.calls[0]?.[0] as string | undefined,
  };
}

describe("SIGAPRO QA municipal logo — real civic crest without accessing official R2", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "qa/sigapro-ia-logo-integrado-20261023");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("serves only the uploaded Campo Limpo header and footer through static QA artwork", async () => {
    for (const type of ["header-logo.jpg", "footer-logo.jpg"]) {
      const result = await request(cityPrefix + type);
      expect(result.code).toBe(302);
      expect(result.location).toBe("/qa-branding/campo-limpo-paulista.webp");
    }
  });
  it("does not read inherited official R2 for a different municipality", async () => {
    const result = await request("municipalities/c334d39c-3a77-464c-abd6-a3a539cceba1/branding/header-logo.jpg");
    expect(result.code).toBe(503);
    expect(result.body).toContain("QA_R2_ACCESS_DISABLED");
  });
  it("denies unexpected branding keys and non-GET requests even for allowed municipality", async () => {
    const unexpected = await request(cityPrefix + "unknown-logo.jpg");
    const post = await request(cityPrefix + "header-logo.jpg", "POST");
    expect(unexpected.code).toBe(503);
    expect(post.code).toBe(503);
    expect(unexpected.location).toBeUndefined();
  });
  it("packages the real user-provided QA artwork with a valid WebP signature", () => {
    const bytes = readFileSync("public/qa-branding/campo-limpo-paulista.webp");
    expect(bytes.byteLength).toBe(4106);
    expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
    expect(bytes.toString("ascii", 8, 12)).toBe("WEBP");
  });
});
