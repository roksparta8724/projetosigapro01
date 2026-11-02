import { useEffect, useState } from "react";
import { backendClient, hasBackendEnv } from "@/integrations/backend/databaseClient";
import { parsePlanUsageDashboard, type PlanUsageSnapshot } from "@/lib/planUsageDashboard";

export type PlanCapacityState = {
  rows: PlanUsageSnapshot[];
  loaded: boolean;
  error: string | null;
};

export async function fetchPlanCapacityDashboard(municipalityId: string | null): Promise<PlanUsageSnapshot[]> {
  if (!hasBackendEnv || !backendClient) throw new Error("Banco de planos indisponível.");
  const { data, error } = await backendClient.rpc("list_plan_usage_dashboard_v1", {
    _municipality_id: municipalityId,
  });
  if (error) throw new Error(error.message || "Não foi possível consultar os limites do plano.");
  return parsePlanUsageDashboard(data);
}

/** Refreshes in visible sessions and on focus, so a Master plan change propagates across logins. */
export function usePlanCapacityLive(
  municipalityId: string | null,
  options: { enabled?: boolean; intervalMs?: number } = {},
): PlanCapacityState {
  const enabled = options.enabled !== false;
  const intervalMs = Math.max(5000, options.intervalMs ?? 8000);
  const key = municipalityId || "__master_all__";
  const [snapshot, setSnapshot] = useState<PlanCapacityState & { key: string }>({
    key, rows: [], loaded: false, error: null,
  });
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let disposed = false;
    let inFlight = false;
    const load = async () => {
      if (disposed || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const rows = await fetchPlanCapacityDashboard(municipalityId);
        if (!disposed) setSnapshot({ key, rows, loaded: true, error: null });
      } catch (err) {
        // Keep the last value only for the same tenant. Never show prior tenant data.
        if (!disposed) setSnapshot((current) => ({
          key, rows: current.key === key ? current.rows : [],
          loaded: current.key === key && current.loaded,
          error: err instanceof Error ? err.message : "Consumo do plano indisponível.",
        }));
      } finally { inFlight = false; }
    };
    const refresh = () => { void load(); };
    refresh();
    const timer = window.setInterval(refresh, intervalMs);
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("sigapro:data-changed", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("sigapro:data-changed", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [enabled, intervalMs, key, municipalityId]);
  // Keep the hook call stable across account switching, but never expose stale tenants.
  return snapshot.key === key ? snapshot : { rows: [], loaded: false, error: null };
}
