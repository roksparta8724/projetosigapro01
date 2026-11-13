import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("login remote-store regression", () => {
  it("retries the real remote platform loader instead of recursing into itself", () => {
    const platformData = read("src/hooks/usePlatformData.tsx");
    const start = platformData.indexOf("async function loadRemotePlatformStoreWithRetry");
    const end = platformData.indexOf("export function PlatformDataProvider", start);
    const retryBlock = platformData.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(retryBlock).toContain("return await loadRemotePlatformStore(focusProcessRouteKey);");
    expect(retryBlock).not.toContain("return await loadRemotePlatformStoreWithRetry();");
  });

  it("libera o acesso com vínculo e contrato ao vivo, sem esperar o store completo", () => {
    const access = read("src/pages/saas/AcessoPage.tsx");
    const gate = read("src/lib/loginLandingAccess.ts");
    const platformData = read("src/hooks/usePlatformData.tsx");
    const permission = read("src/components/platform/PermissionRoute.tsx");

    expect(access).toContain("verifyLoginLandingAccess(role, result.municipalityId ?? null");
    expect(access).toContain("preloadLoginLanding(landingPath)");
    expect(access).not.toContain("dataReadyForCurrentUser");
    // Authorization is still checked against the current authenticated
    // membership and the bank's official contract module, never localStorage.
    expect(gate).toContain('"has_tenant_access"');
    expect(gate).toContain('"assert_municipality_entitlement_v1"');
    expect(gate).toContain("membership.data !== true");
    expect(gate).toContain("if (contract.error)");
    expect(permission).toContain("isTenantMismatch");
    // The heavy store remains strictly scoped to this authenticated identity,
    // but it is no longer an artificial prerequisite for password login.
    expect(platformData).toContain("isConfirmedStoreIdentity(remoteContextUserId, authenticatedUserId, authenticatedProfileId)");
    expect(platformData).toContain('source === "remote"');
  });
  it("does not show the global blocking-data banner when usable scoped data is already loaded", () => {
    const portal = read("src/components/platform/PortalFrame.tsx");

    expect(portal).toContain("hasUsableScopedData");
    expect(portal).toContain('source !== "remote"');
    expect(portal).toContain('source !== "warm"');
    expect(portal).toContain("!hasUsableScopedData");
  });

});
