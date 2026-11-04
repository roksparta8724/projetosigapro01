import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildPlanCapacityMetrics, parsePlanUsageDashboard } from "@/lib/planUsageDashboard";

const sample = (limits: Record<string, number | null>) => ({
  municipalityId: "municipality-qa", configured: true, contractActive: true,
  planId: "plan-basic", planName: "Basic", contractReason: "",
  contractStatus: "ativo", limits,
  usage: { users: 9, processes: 75, departments: 2, storageBytes: 1073741824 },
});
describe("real plan quotas and dashboard percentage", () => {
  it("renders actual usage and 75% occupancy with pt-BR display", () => {
    const [row] = parsePlanUsageDashboard([sample({
      users: 12, processes: 100, departments: 4, storageGb: 2,
    })]);
    const metrics = buildPlanCapacityMetrics(row);
    expect(metrics.map((m) => m.percentage)).toEqual([75, 75, 50, 50]);
    expect(metrics[0].usedLabel).toBe("9");
    expect(metrics[0].limitLabel).toBe("12");
    expect(metrics[0]).toMatchObject({ remaining: 3, remainingLabel: "3 vagas disponíveis" });
    expect(metrics[1]).toMatchObject({ remaining: 25, remainingLabel: "25 restantes" });
    expect(metrics[3].usedLabel).toBe("1 GB");
  });
  it("changes all percentages immediately when the Master changes plan limits", () => {
    const old = parsePlanUsageDashboard([sample({ users: 12, processes: 100, departments: 4, storageGb: 2 })])[0];
    const changed = parsePlanUsageDashboard([sample({ users: 18, processes: 150, departments: 8, storageGb: 4 })])[0];
    expect(buildPlanCapacityMetrics(old)[0].percentage).toBe(75);
    expect(buildPlanCapacityMetrics(old)[0].remaining).toBe(3);
    expect(buildPlanCapacityMetrics(changed)[0].remaining).toBe(9);
    expect(buildPlanCapacityMetrics(changed)[0].percentage).toBe(50);
    expect(buildPlanCapacityMetrics(changed)[1].percentage).toBe(50);
  });
  it("does not invent a percentage for unlimited or missing contracts", () => {
    const [unlimited] = parsePlanUsageDashboard([sample({ users: null, processes: null, departments: null, storageGb: null })]);
    expect(buildPlanCapacityMetrics(unlimited).every((metric) => metric.percentage === null)).toBe(true);
    expect(buildPlanCapacityMetrics(unlimited).every((metric) => metric.remaining === null && metric.remainingLabel === null)).toBe(true);
  });
  it("flags an over-limit count even if the progress bar must be visually capped", () => {
    const [row] = parsePlanUsageDashboard([sample({ users: 5, processes: 100, departments: 4, storageGb: 2 })]);
    expect(buildPlanCapacityMetrics(row)[0]).toMatchObject({ percentage: 180, overLimit: true, remaining: 0, remainingLabel: "0 vagas disponíveis" });
  });
  it("shows remaining slots on the dashboard instead of only the used percentage", () => {
    const card = readFileSync("src/components/platform/PlanCapacityCard.tsx", "utf8");
    expect(card).toContain("metric.remainingLabel");
    expect(card).toContain("data-plan-remaining={metric.key}");
    expect(card).toContain("data-plan-remaining-percent={metric.key}");
  });
  it("rejects malformed server envelopes", () => {
    expect(() => parsePlanUsageDashboard({ users: 2 })).toThrow("inválida");
    expect(parsePlanUsageDashboard([null, {}, sample({ users: 10, processes: 100, departments: 3, storageGb: 1 })])).toHaveLength(1);
  });
  it("refreshes cross-session entitlement state without requiring a new login", () => {
    const portal = readFileSync("src/components/platform/PortalFrame.tsx", "utf8");
    const live = readFileSync("src/hooks/usePlanCapacityLive.ts", "utf8");
    const store = readFileSync("src/hooks/usePlatformData.tsx", "utf8");
    expect(portal).toContain("useLivePlatformRefresh(refreshRemoteStore");
    expect(portal).toContain("refreshOnMount: false");
    expect(live).toContain('window.addEventListener("focus"');
    expect(live).toContain("JSON.stringify(current.rows) === JSON.stringify(rows)");
    expect(live).toContain('window.addEventListener("sigapro:data-changed"');
    expect(store).toContain('window.dispatchEvent(new Event("sigapro:data-changed"))');
  });

  it("restricts the authoritative RPC to admin roles and the current tenant", () => {
    const sql = readFileSync("neon/migrations/20261102_plan_usage_dashboard_v1.sql", "utf8");
    expect(sql).toContain("public.current_profile_id()");
    expect(sql).toContain("public.has_tenant_access(_municipality_id)");
    expect(sql).toContain("prefeitura_admin");
    expect(sql).toContain("p.archived_at IS NULL");
  });
});
