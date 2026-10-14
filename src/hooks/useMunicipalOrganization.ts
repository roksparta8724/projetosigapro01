import { useEffect, useMemo, useState } from "react";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import {
  listRemoteMunicipalDepartments,
  type MunicipalDepartmentRecord,
} from "@/integrations/backend/platform";

type CacheEntry = {
  rows: MunicipalDepartmentRecord[];
  loadedAt: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const departmentCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<MunicipalDepartmentRecord[]>>();

function sortDepartments(rows: MunicipalDepartmentRecord[]) {
  return rows
    .filter((item) => item.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR"));
}

function loadDepartments(municipalityId: string) {
  const cached = departmentCache.get(municipalityId);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return Promise.resolve(cached.rows);
  }

  const existing = inFlight.get(municipalityId);
  if (existing) return existing;

  const request = listRemoteMunicipalDepartments(municipalityId)
    .then((rows) => {
      const sorted = sortDepartments(rows);
      departmentCache.set(municipalityId, { rows: sorted, loadedAt: Date.now() });
      return sorted;
    })
    .finally(() => {
      inFlight.delete(municipalityId);
    });

  inFlight.set(municipalityId, request);
  return request;
}

export function invalidateMunicipalOrganizationCache(municipalityId?: string | null) {
  if (municipalityId) departmentCache.delete(municipalityId);
  else departmentCache.clear();
}

export function useMunicipalOrganization() {
  const { session } = usePlatformSession();
  const { municipality, scopeId } = useMunicipality();

  const municipalityId =
    session.role === "master_admin" || session.role === "master_ops"
      ? municipality?.id ?? scopeId ?? session.municipalityId ?? session.tenantId ?? null
      : session.municipalityId ?? session.tenantId ?? municipality?.id ?? scopeId ?? null;

  const initial = municipalityId ? departmentCache.get(municipalityId)?.rows ?? [] : [];
  const [departments, setDepartments] = useState<MunicipalDepartmentRecord[]>(initial);
  const [loading, setLoading] = useState(Boolean(municipalityId && initial.length === 0));
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!municipalityId) {
      setDepartments([]);
      setLoading(false);
      setError("");
      return () => {
        active = false;
      };
    }

    const cached = departmentCache.get(municipalityId);
    if (cached?.rows?.length) {
      setDepartments(cached.rows);
      setLoading(false);
      setError("");
    } else {
      setLoading(true);
    }

    void loadDepartments(municipalityId)
      .then((rows) => {
        if (!active) return;
        setDepartments(rows);
        setError("");
      })
      .catch((cause) => {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar o organograma municipal.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [municipalityId]);

  return useMemo(
    () => ({
      municipalityId,
      departments,
      loading,
      error,
      refresh: async () => {
        if (!municipalityId) return [] as MunicipalDepartmentRecord[];
        invalidateMunicipalOrganizationCache(municipalityId);
        const rows = await loadDepartments(municipalityId);
        setDepartments(rows);
        setError("");
        return rows;
      },
    }),
    [departments, error, loading, municipalityId],
  );
}
