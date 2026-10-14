import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("local and official read infrastructure", () => {
  const r2Client = read("src/integrations/r2/client.ts");
  const r2Sign = read("api/r2-sign-get.ts");
  const vite = read("vite.config.ts");
  const guide = read("src/components/GuiaRecolhimentoOficial.tsx");
  const processDetail = read("src/pages/saas/ProcessDetailPage.tsx");
  const plan = read("src/hooks/usePlanEntitlements.ts");
  const publicDomain = read("src/lib/publicDomain.ts");

  it("reads existing documents from the official API on localhost without sending writes to production", () => {
    expect(r2Client).toContain('const officialReadApiBase = "https://sigapromunicipal.com.br"');
    expect(r2Client).toContain('if (isLocalBrowser) return `${officialReadApiBase}${normalized}`');
    expect(r2Client).toContain("buildApiUrl(\"/api/r2-upload\")");
    expect(r2Client).toContain("buildApiUrl(\"/api/r2-delete\")");
    expect(vite).toContain("Nenhuma rota de escrita é encaminhada para produção");
  });

  it("never allows a production API base or public portal link to point at localhost", () => {
    expect(r2Client).toContain("isLoopbackUrl");
    expect(r2Client).toContain('!isLocalBrowser && isLoopbackUrl(rawApiBase)');
    expect(publicDomain).toContain("isLoopbackHostname");
    expect(publicDomain).toContain("if (!normalized || isLoopbackHostname(normalized)) return DEFAULT_PUBLIC_ROOT");
    expect(publicDomain).toContain("custom && !isLoopbackHostname(custom)");
  });

  it("normalizes the R2 account endpoint and reports missing server configuration explicitly", () => {
    expect(r2Sign).toContain("normalizeR2AccountId");
    expect(r2Sign).toContain("r2.cloudflarestorage.com");
    expect(r2Sign).toContain("R2_CONFIG_MISSING");
    expect(r2Sign).toContain("Armazenamento R2 oficial não configurado neste ambiente.");
    expect(r2Sign).toContain("R2_SIGNATURE_MISMATCH");
  });

  it("opens document viewers on the current origin using relative routes", () => {
    expect(processDetail).toContain('const viewerUrl = `/processos/${process.id}/documentos/${documentId}/visualizar`');
    expect(processDetail).toContain('const analysisUrl = `/processos/${process.id}/documentos/${documentId}/analisar`');
    expect(processDetail).not.toContain("window.location.origin}/processos/");
  });

  it("uses permanent municipal branding object keys and fresh signed reads for guide logos", () => {
    expect(guide).toContain("deriveBrandingObjectKey");
    expect(guide).toContain("getSignedUrlForObjectStrict");
    expect(guide).toContain("objectKey: key");
    expect(guide).toContain("blobToDataUrl");
    expect(guide).toContain("Nunca reaproveita URL assinada antiga");
    expect(processDetail).toContain("municipalityBranding?.headerLogoObjectKey");
  });

  it("does not let stale visual municipality context trap plan validation", () => {
    expect(plan).not.toContain("municipalityMatchesSession");
    expect(plan).toContain("const municipalityId = isMaster");
    expect(plan).toContain("const municipalityMatchesAuth");
    expect(plan).toContain("PLAN_RESOLUTION_TIMEOUT_MS");
    expect(plan).toContain("resolutionStartedAtByIdentity");
  });
});
