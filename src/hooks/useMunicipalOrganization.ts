import { useEffect, useMemo, useState } from "react";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import {
  listRemoteMunicipalDepartments,
  listRemotePublicMunicipalDepartments,
  type MunicipalDepartmentRecord,
} from "@/integrations/backend/platform";
import { isInternalRole } from "@/lib/platform";

type CacheEntry = {
  rows: MunicipalDepartmentRecord[];
  loadedAt: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const departmentCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<MunicipalDepartmentRecord[]>>();

type OrganizationAccessMode = "full" | "public";

function cacheKey(municipalityId: string, mode: OrganizationAccessMode) {
  return `${mode}:${municipalityId}`;
}

function sortDepartments(rows: MunicipalDepartmentRecord[]) {
  return rows
    .filter((item) => item.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR"));
}

function loadDepartments(municipalityId: string, mode: OrganizationAccessMode) {
  const key = cacheKey(municipalityId, mode);
  const cached = departmentCache.get(key);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return Promise.resolve(cached.rows);
  }

  const existing = inFlight.get(key);
  if (existing) return existing;

  const loader =
    mode === "full"
      ? listRemoteMunicipalDepartments
      : listRemotePublicMunicipalDepartments;

  const request = loader(municipalityId)
    .then((rows) => {
      const sorted = sortDepartments(rows);
      departmentCache.set(key, { rows: sorted, loadedAt: Date.now() });
      return sorted;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}

export function invalidateMunicipalOrganizationCache(municipalityId?: string | null) {
  if (municipalityId) {
    departmentCache.delete(cacheKey(municipalityId, "full"));
    departmentCache.delete(cacheKey(municipalityId, "public"));
  } else {
    departmentCache.clear();
  }
}

export function useMunicipalOrganization() {
  const { session } = usePlatformSession();
  const { municipality, scopeId } = useMunicipality();

  const municipalityId =
    session.role === "master_admin" || session.role === "master_ops"
      ? municipality?.id ?? scopeId ?? session.municipalityId ?? session.tenantId ?? null
      : session.municipalityId ?? session.tenantId ?? municipality?.id ?? scopeId ?? null;
  const accessMode: OrganizationAccessMode =
    session.role === "master_admin" ||
    session.role === "master_ops" ||
    isInternalRole(session.role)
      ? "full"
      : "public";

  const initial = municipalityId
    ? departmentCache.get(cacheKey(municipalityId, accessMode))?.rows ?? []
    : [];
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

    const cached = departmentCache.get(cacheKey(municipalityId, accessMode));
    if (cached?.rows?.length) {
      setDepartments(cached.rows);
      setLoading(false);
      setError("");
    } else {
      setLoading(true);
    }

    void loadDepartments(municipalityId, accessMode)
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
  }, [accessMode, municipalityId]);

  return useMemo(
    () => ({
      municipalityId,
      departments,
      loading,
      error,
      refresh: async () => {
        if (!municipalityId) return [] as MunicipalDepartmentRecord[];
        invalidateMunicipalOrganizationCache(municipalityId);
        const rows = await loadDepartments(municipalityId, accessMode);
        setDepartments(rows);
        setError("");
        return rows;
      },
    }),
    [accessMode, departments, error, loading, municipalityId],
  );
}
