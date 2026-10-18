import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const backend = read("src/integrations/backend/platformImpl.ts");
const processDetail = read("src/pages/saas/ProcessDetailPage.tsx");
const financeDesk = read("src/pages/saas/FinanceDeskPage.tsx");
const registry = read("src/pages/saas/MunicipalProcessRegistryPage.tsx");
const documentAnalysis = read("src/pages/saas/DocumentAnalysisPage.tsx");
const liveRefresh = read("src/hooks/useLivePlatformRefresh.ts");
const migration = read("neon/migrations/20261018_live_process_party_identity.sql");

describe("live process identity and operational freshness", () => {
  it("uses the linked live profile before historical party display snapshots", () => {
    expect(backend).toContain("externalLeadProfile?.full_name");
    expect(backend).toContain("creatorProfile?.full_name");
    expect(backend).toContain("externalLead?.display_name");
    expect(
      backend.indexOf("externalLeadProfile?.full_name"),
    ).toBeLessThan(backend.indexOf("externalLead?.display_name"));
  });

  it("synchronizes profile edits into linked current process parties without deleting historical payloads", () => {
    expect(migration).toContain("sync_profile_to_linked_process_parties");
    expect(migration).toContain("hydrate_process_party_identity_from_profile");
    expect(migration).toContain("hydrate_process_party_private_from_profile");
    expect(migration).toContain("pp.profile_id=new.id");
    expect(migration).toContain("set updated_at=clock_timestamp()");
    expect(migration).not.toContain("update public.processes\nset preprotocol_payload");
  });

  it("revalidates critical municipal workflow screens silently while they remain open", () => {
    expect(liveRefresh).toContain("document.visibilityState");
    expect(liveRefresh).toContain('window.addEventListener("focus"');
    expect(liveRefresh).toContain('document.addEventListener("visibilitychange"');
    expect(processDetail).toContain("useLivePlatformRefresh(refreshRemoteStore, { intervalMs: 5000 })");
    expect(documentAnalysis).toContain("useLivePlatformRefresh(refreshRemoteStore, { intervalMs: 5000 })");
    expect(financeDesk).toContain("useLivePlatformRefresh(refreshRemoteStore, { intervalMs: 8000 })");
    expect(registry).toContain("useLivePlatformRefresh(refreshRemoteStore, { intervalMs: 8000 })");
  });

  it("keeps the live process authoritative over the visual continuity cache", () => {
    expect(processDetail).toContain("const process = liveProcess ?? cachedProcessVisual");
  });
});
