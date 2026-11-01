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

  it("distinguishes successful authentication from slow synchronization without bypassing the role gate", () => {
    const access = read("src/pages/saas/AcessoPage.tsx");
    const bootstrap = read("src/hooks/useAppBootstrap.tsx");
    const platformData = read("src/hooks/usePlatformData.tsx");
    expect(access).toContain('data-sigapro-login-sync="true"');
    expect(access).toContain('disabled={submitting || Boolean(pendingRedirect)}');
    expect(access).toContain('window.setTimeout(() => setSyncSlow(true), 15000)');
    expect(access).toContain("Revalidar esta sessão");
    expect(access).toContain("!dataReadyForCurrentUser");
    expect(access).toContain("entitlements.isResolving");
    expect(bootstrap).toContain('measure("resposta_do_provedor_de_autenticacao")');
    expect(bootstrap).toContain('measure("perfil_e_vinculo_municipal_resolvidos")');
    expect(platformData).toContain('"[SIGAPRO][QA][Sincronizacao]"');
  });
  it("only releases the access redirect after the current authenticated user has synchronized remote data", () => {
    const access = read("src/pages/saas/AcessoPage.tsx");
    const platformData = read("src/hooks/usePlatformData.tsx");

    expect(access).toContain("dataReadyForCurrentUser");
    expect(access).toContain("dataError && !dataReadyForCurrentUser");
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
