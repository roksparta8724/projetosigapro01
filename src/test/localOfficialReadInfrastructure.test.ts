import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("local official read infrastructure", () => {
  const r2Client = read("src/integrations/r2/client.ts");
  const vite = read("vite.config.ts");
  const logoApi = read("api/r2-master-logo-source.ts");
  const guide = read("src/components/GuiaRecolhimentoOficial.tsx");
  const processDetail = read("src/pages/saas/ProcessDetailPage.tsx");
  const plan = read("src/hooks/usePlanEntitlements.ts");

  it("keeps localhost document reads same-origin and proxies only read APIs", () => {
    expect(r2Client).toContain("if (isLocalBrowser) return normalized");
    expect(r2Client).not.toContain("if (isLocalBrowser) return `${officialReadApiBase}${normalized}`");
    expect(vite).toContain('"/api/r2-sign-get"');
    expect(vite).toContain('"/api/r2-list-user-files"');
    expect(vite).toContain("proxyOfficialReadApi");
    expect(vite).toContain("OFFICIAL_READ_API_BASE");
    expect(vite).toContain("Nenhuma rota de escrita é encaminhada para produção");
    expect(vite).not.toContain('READ_ONLY_R2_ROUTES = [\n  "/api/r2-upload"');
    expect(vite).not.toContain('READ_ONLY_R2_ROUTES = [\n  "/api/r2-delete"');
  });

  it("returns a precise local document error instead of a raw Failed to fetch", () => {
    expect(r2Client).toContain("Falha ao alcançar o proxy local de leitura do armazenamento");
    expect(r2Client).toContain("A API oficial não retornou a URL segura do documento");
  });

  it("supports municipality-scoped branding object keys for official guide logos", () => {
    expect(logoApi).toContain("isMunicipalBranding");
    expect(logoApi).toContain("municipalities\\/[0-9a-f-]{36}\\/branding");
    expect(vite).toContain("proxyOfficialLogoSource");
    expect(vite).toContain("isSafeBrandingObjectKey");
    expect(guide).toContain("logoObjectKey?: string");
    expect(guide).toContain('fetch("/api/r2-master-logo-source"');
    expect(guide).toContain("blobToDataUrl");
    expect(processDetail).toContain("municipalityBranding?.headerLogoObjectKey");
  });

  it("does not let stale visual municipality context trap plan validation", () => {
    expect(plan).not.toContain("municipalityMatchesSession");
    expect(plan).toContain("const municipalityId = isMaster");
    expect(plan).toContain("const municipalityMatchesAuth");
    expect(plan).toContain("!sessionMunicipalityId");
  });
});
