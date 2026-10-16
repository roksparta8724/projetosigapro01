import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("critical localhost x production parity", () => {
  const branding = read("src/hooks/useInstitutionBranding.ts");
  const storage = read("server/municipal-storage.ts");
  const permitPage = read("src/pages/saas/ProcessDetailPage.tsx");
  const sw = read("public/sigapro-sw.js");
  const main = read("src/main.tsx");

  it("never keeps an expired signed municipal logo as the visible branding", () => {
    expect(branding).toContain("isUsableBrandingUrl");
    expect(branding).toContain("X-Amz-Date");
    expect(branding).toContain("X-Amz-Expires");
    expect(branding).toContain("municipalityLogoFallback");
    expect(branding).toContain("campo limpo paulista");
    expect(branding).toContain("Brasao-campo-limpo-paulista2.png");
  });

  it("allows public municipal legislation to fall back to SIGAPRO R2 without BYOS auth", () => {
    expect(storage).toContain("isPublicMunicipalLegislationObject");
    expect(storage).toContain("publicLegislation && !readBearer(req)");
    expect(storage).toContain("return null");
    expect(storage).toContain("resolve_municipal_storage_secret_v1");
  });

  it("shows the real persisted permit stage instead of telling users to fill an existing permit again", () => {
    expect(permitPage).toContain('constructionPermit?.status === "assinatura_manual"');
    expect(permitPage).toContain("Alvará preenchido e preparado para assinatura manual");
    expect(permitPage).toContain('constructionPermit?.status === "aguardando_diretor"');
    expect(permitPage).toContain("Alvará preenchido e encaminhado para assinatura da Diretoria");
    expect(permitPage).toContain("Abrir / conferir Alvará");
    expect(permitPage).toContain("permitReachedIssuanceStage");
    expect(permitPage).toContain('constructionPermit?.status !== "rascunho"');
    expect(permitPage).toContain("currentFlowIndex = 4");
  });

  it("invalidates the old production asset cache and actively checks service-worker updates", () => {
    expect(sw).toContain('const CACHE_VERSION = "sigapro-enterprise-v3"');
    expect(main).toContain(".then((registration) => registration.update())");
  });
});
