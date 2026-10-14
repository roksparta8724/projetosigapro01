import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("local runtime parity regressions", () => {
  const r2Client = read("src/integrations/r2/client.ts");
  const entitlements = read("src/hooks/usePlanEntitlements.ts");
  const portal = read("src/components/platform/PortalFrame.tsx");
  const viewer = read("src/pages/saas/DocumentViewerPage.tsx");
  const analysis = read("src/pages/saas/DocumentAnalysisPage.tsx");

  it("always reads existing documents through the official read API on localhost", () => {
    expect(r2Client).toContain("if (isLocalBrowser) return `${officialReadApiBase}${normalized}`");
    expect(r2Client).toContain("https://sigapromunicipal.com.br");
    expect(r2Client).toContain("getSignedUrlForObjectStrict");
    const readUrlBlock = r2Client.slice(
      r2Client.indexOf("function buildReadApiUrl"),
      r2Client.indexOf("async function getAuthorizationHeaders"),
    );
    expect(readUrlBlock.indexOf("if (isLocalBrowser)")).toBeLessThan(readUrlBlock.indexOf("if (apiBase)"));
  });

  it("does not keep plan access stuck on secondary loading states after auth is stable", () => {
    expect(entitlements).toContain("loading: platformDataLoading");
    expect(entitlements).toContain("authenticatedEmail");
    expect(entitlements).toContain("normalizedAuthenticatedEmail");
    expect(entitlements).toContain("normalizedSessionEmail");
    expect(entitlements).not.toContain("platformDataLoading ||");
    expect(entitlements).not.toContain("municipalityLoading ||");
    expect(entitlements).toContain("planDataPending");
  });

  it("only shows the official-data outage banner when current user data is actually unavailable", () => {
    expect(portal).toContain("dataReadyForCurrentUser");
    expect(portal).toContain("dataError && !loading && !dataReadyForCurrentUser");
  });

  it("keeps document workspaces scoped to the authenticated municipality", () => {
    const expected =
      "session.municipalityId ?? session.tenantId ?? municipality?.id ?? scopeId ?? null";
    expect(viewer).toContain(expected);
    expect(analysis).toContain(expected);
  });
});
