import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";

describe("SIGAPRO: authoritative municipality-wide process registry",()=>{
  const registry=readFileSync("src/pages/saas/MunicipalProcessRegistryPage.tsx","utf8");
  const hook=readFileSync("src/hooks/usePlatformData.tsx","utf8");
  it("prefers the signed-in municipal scope over branding or stale tenant selection",()=>{
    expect(registry).toContain("session.municipalityId ?? session.tenantId ?? municipality?.id ?? scopeId ?? null");
    expect(registry).toContain("matchesOperationalScope(effectiveScopeId, process)");
  });
  it("does not treat an 8-hour warm session cache as current records or totals",()=>{
    expect(registry).toContain("remoteSyncedForCurrentUser ? allProcesses : []");
    expect(hook).toContain('(!expectsRemoteStore || source === "remote")');
    expect(hook).toContain("!dataError");
    expect(hook).toContain("remoteSyncedForCurrentUser,");
  });
  it("makes an unavailable DB explicit and supports authenticated retry instead of empty data",()=>{
    expect(registry).toContain('data-municipal-registry-sync={platformDataError ? "error" : "pending"}');
    expect(registry).toContain("Atualizar do banco");
    expect(registry).toContain("refreshRemoteStore().catch(() => undefined)");
    expect(registry).toContain("os processos não foram excluídos");
  });
});
