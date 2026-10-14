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
  const vite = read("vite.config.ts");

  it("cannot leak a localhost R2 base into a production build", () => {
    expect(r2Client).toContain("isLoopbackUrl");
    expect(r2Client).toContain("!isLocalBrowser && isLoopbackUrl(rawApiBase)");
    expect(r2Client).toContain('const apiBase =');
  });

  it("keeps localhost reads same-origin, with official fallback only when local R2 is unavailable", () => {
    expect(r2Client).toContain("if (isLocalBrowser) return normalized");
    expect(r2Client).toContain('const officialReadApiBase = "https://sigapromunicipal.com.br"');
    expect(r2Client).toContain("localInfrastructureFailure");
    expect(r2Client).toContain('fetch(buildApiUrl("/api/r2-upload")');
    expect(r2Client).toContain('fetch(buildApiUrl("/api/r2-delete")');
  });

  it("lets Vite use local R2 credentials before falling back to official reads", () => {
    expect(vite).toContain("hasCompleteLocalR2Env");
    expect(vite).toContain("normalizeR2AccountId");
    expect(vite).toContain("const localR2Ready = hasCompleteLocalR2Env()");
    expect(vite).toContain('req.url.startsWith("/api/r2-sign-get") && !localR2Ready');
    expect(vite).toContain("Upload/delete nunca são encaminhados para produção");
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

  it("opens secured documents directly and keeps analysis on the current origin", () => {
    expect(processDetail).toContain("getSignedUrlForObjectStrict");
    expect(processDetail).toContain('const popup = window.open("", "_blank")');
    expect(processDetail).toContain("popup.location.replace(accessUrl)");
    expect(processDetail).not.toContain("window.open(viewerUrl");
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
