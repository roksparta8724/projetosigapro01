import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/backend/databaseClient", () => ({
  backendClient: { auth: { getSession: vi.fn(async () => ({ data: { session: null } })) } },
}));

import { getSignedUrlForObject } from "@/integrations/r2/client";

const municipality = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function configurePublicFallback() {
  vi.stubEnv("VITE_R2_PUBLIC_FALLBACK", "true");
  vi.stubEnv("VITE_R2_PUBLIC_BASE_URL", "https://assets.example.invalid");
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ error: "Sem acesso ao documento." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    }),
  ));
}

describe("R2 browser fallback: only public municipal legislation", () => {
  it("never transforms a private document authorization denial into a public URL", async () => {
    configurePublicFallback();
    for (const objectKey of [
      `municipalities/${municipality}/protocols/owner/secret.pdf`,
      `municipalities/${municipality}/analysis-signed-fiches/staff/official.pdf`,
      `municipalities/${municipality}/dam-originals/private.pdf`,
      `municipalities/${municipality}/profiles/avatars/user.png`,
    ]) {
      await expect(getSignedUrlForObject({ bucket: "process-documents", objectKey }))
        .rejects.toThrow("Sem acesso ao documento.");
    }
    await expect(getSignedUrlForObject({
      bucket: "institutional-branding",
      objectKey: `municipalities/${municipality}/profiles/avatars/user.png`,
    })).rejects.toThrow("Sem acesso ao documento.");
  });

  it("preserves public fallback only for an explicitly scoped municipal legal asset", async () => {
    configurePublicFallback();
    const objectKey = `municipalities/${municipality}/legislation/zoneamento.pdf`;
    await expect(getSignedUrlForObject({ bucket: "process-documents", objectKey }))
      .resolves.toBe(`https://assets.example.invalid/${objectKey}`);
    await expect(getSignedUrlForObject({ bucket: "profile-assets", objectKey }))
      .rejects.toThrow("Sem acesso ao documento.");
    await expect(getSignedUrlForObject({ bucket: "process-documents", objectKey: "legislation/zoneamento.pdf" }))
      .rejects.toThrow("Sem acesso ao documento.");
  });

  it("fails closed when public fallback is disabled even for legislation", async () => {
    configurePublicFallback();
    vi.stubEnv("VITE_R2_PUBLIC_FALLBACK", "false");
    await expect(getSignedUrlForObject({
      bucket: "process-documents",
      objectKey: `municipalities/${municipality}/legislation/norma.pdf`,
    })).rejects.toThrow("Sem acesso ao documento.");
  });
});
