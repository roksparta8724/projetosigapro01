import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("document storage and origin root-cause regression", () => {
  const r2Client = read("src/integrations/r2/client.ts");
  const r2Sign = read("api/r2-sign-get.ts");
  const processDetail = read("src/pages/saas/ProcessDetailPage.tsx");
  const guide = read("src/components/GuiaRecolhimentoOficial.tsx");
  const publicDomain = read("src/lib/publicDomain.ts");
  const entitlements = read("src/hooks/usePlanEntitlements.ts");

  it("cannot leak a localhost R2 base into a production build", () => {
    expect(r2Client).toContain("isLoopbackUrl");
    expect(r2Client).toContain("!isLocalBrowser && isLoopbackUrl(rawApiBase)");
    expect(r2Client).toContain('const apiBase =');
  });

  it("uses official read infrastructure on localhost but keeps write endpoints local", () => {
    expect(r2Client).toContain('const officialReadApiBase = "https://sigapromunicipal.com.br"');
    expect(r2Client).toContain('if (isLocalBrowser) return `${officialReadApiBase}${normalized}`');
    expect(r2Client).toContain('fetch(buildApiUrl("/api/r2-upload")');
    expect(r2Client).toContain('fetch(buildApiUrl("/api/r2-delete")');
  });

  it("normalizes bucket-prefixed Cloudflare R2 endpoints to the account endpoint", () => {
    expect(r2Sign).toContain("function normalizeR2AccountId");
    expect(r2Sign).toContain('labels.indexOf("r2")');
    expect(r2Sign).toContain('labels[r2Index - 1]');
    expect(r2Sign).toContain('https://${accountIdFromEndpoint}.r2.cloudflarestorage.com');
  });

  it("never masks missing R2 server configuration as a generic 500", () => {
    expect(r2Sign).toContain('json(res, 503');
    expect(r2Sign).toContain('"R2_CONFIG_MISSING"');
    expect(r2Sign).toContain('"R2_SIGNATURE_MISMATCH"');
  });

  it("opens viewers with relative routes so the browser keeps its current origin", () => {
    expect(processDetail).toContain('const viewerUrl = `/processos/${process.id}/documentos/${documentId}/visualizar`');
    expect(processDetail).toContain('const analysisUrl = `/processos/${process.id}/documentos/${documentId}/analisar`');
    expect(processDetail).not.toContain("window.location.origin}/processos/");
  });

  it("never builds public municipality links from localhost configuration", () => {
    expect(publicDomain).toContain("isLoopbackHostname");
    expect(publicDomain).toContain("return DEFAULT_PUBLIC_ROOT");
    expect(publicDomain).toContain("custom && !isLoopbackHostname(custom)");
  });

  it("embeds a fresh guide logo before static HTML is produced", () => {
    expect(guide).toContain("getSignedUrlForObjectStrict");
    expect(guide).toContain("objectKey: key");
    expect(guide).toContain("blobToDataUrl");
    expect(guide).toContain("logoUrl: embeddedLogo");
    expect(guide.indexOf("const embeddedLogo = await embedGuideImage")).toBeLessThan(
      guide.indexOf("const html = buildGuiaRecolhimentoOficialHtml"),
    );
  });

  it("does not leave plan access validation indefinitely mounted", () => {
    expect(entitlements).toContain("PLAN_RESOLUTION_TIMEOUT_MS = 6000");
    expect(entitlements).toContain("resolutionStartedAtByIdentity");
    expect(entitlements).toContain("hasCurrentMunicipalityEntitlement");
    expect(entitlements).toContain("!hasCurrentMunicipalityEntitlement");
  });
});
