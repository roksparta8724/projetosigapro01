import { useEffect, useState } from "react";
import { backendClient } from "@/integrations/backend/databaseClient";

export type EffectiveMunicipalCollection = {
  municipality_id?: string;
  mode: "sigapro" | "municipal_system";
  status: "active" | "not_configured";
  enabled: boolean;
  supplier_code?: string;
  supplier_name?: string;
  integration_type?: "automatic" | "controlled_import";
  version?: number;
};

const inactive: EffectiveMunicipalCollection = {
  mode: "sigapro", status: "not_configured", enabled: false,
};

/**
 * Read-only active version; draft edits in Configurações must not change
 * operational behavior until the municipal administrator activates them.
 * On missing migrations/network errors fail closed: never allow imports.
 */
export function useEffectiveCollectionMode(municipalityId?: string | null) {
  const [configuration, setConfiguration] = useState<EffectiveMunicipalCollection>(inactive);
  const [loading, setLoading] = useState(Boolean(municipalityId));

  useEffect(() => {
    let cancelled = false;
    if (!municipalityId) {
      setConfiguration(inactive);
      setLoading(false);
      return;
    }
    setLoading(true);
    const load = async () => {
      try {
        const session = (await backendClient?.auth?.getSession?.())?.data?.session;
        const token = session?.access_token || session?.accessToken || session?.token || "";
        if (!token) throw new Error("Sessão não autenticada.");
        const response = await fetch("/api/collection-configuration", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ municipalityId, action: "effective" }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body?.enabled || body.status !== "active") {
          throw new Error("Modalidade municipal não ativada.");
        }
        if (!cancelled) setConfiguration({
          mode: body.mode === "municipal_system" ? "municipal_system" : "sigapro",
          status: "active", enabled: true,
          supplier_code: String(body.supplier_code || ""),
          supplier_name: String(body.supplier_name || ""),
          integration_type: body.integration_type === "controlled_import" ? "controlled_import" : "automatic",
          version: Number(body.version) || 0,
        });
      } catch {
        if (!cancelled) setConfiguration(inactive);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [municipalityId]);

  return {
    configuration,
    loading,
    canImportMunicipalGuide: configuration.enabled &&
      configuration.mode === "municipal_system" &&
      configuration.integration_type === "controlled_import",
  };
}
