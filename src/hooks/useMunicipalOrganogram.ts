import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listRemoteInternalMunicipalDepartments,
  listRemoteMunicipalDepartments,
  type MunicipalDepartmentRecord,
} from "@/integrations/backend/platform";

const CACHE_PREFIX = "sigapro:municipal-organogram:v2";
const OVERRIDE_PREFIX = "sigapro:municipal-organogram:local-override:v1";
const EVENT_NAME = "sigapro:municipal-organogram-updated";

type OrganogramOptions = {
  includeInactive?: boolean;
};

function normalize(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ");
}

function sortDepartments(rows: MunicipalDepartmentRecord[]) {
  return [...rows].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR"),
  );
}

function cacheKey(municipalityId: string, includeInactive: boolean) {
  return `${CACHE_PREFIX}:${municipalityId}:${includeInactive ? "full" : "active"}`;
}

function overrideKey(municipalityId: string) {
  return `${OVERRIDE_PREFIX}:${municipalityId}`;
}

function readStored(key: string) {
  if (typeof window === "undefined") return [] as MunicipalDepartmentRecord[];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return sortDepartments(
      parsed.filter(
        (item): item is MunicipalDepartmentRecord =>
          Boolean(item && typeof item === "object" && "id" in item && "name" in item),
      ),
    );
  } catch {
    return [];
  }
}

function writeStored(key: string, departments: MunicipalDepartmentRecord[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(sortDepartments(departments)));
  } catch {
    // Persistência visual nunca pode quebrar a navegação.
  }
}

function readOverride(municipalityId: string | null | undefined) {
  if (!municipalityId) return [] as MunicipalDepartmentRecord[];
  return readStored(overrideKey(municipalityId));
}

function resolveVisible(
  departments: MunicipalDepartmentRecord[],
  includeInactive: boolean,
) {
  const sorted = sortDepartments(departments);
  return includeInactive ? sorted : sorted.filter((item) => item.isActive);
}

export function resolveOrganogramDepartment(
  departments: MunicipalDepartmentRecord[],
  hint: string | null | undefined,
) {
  const target = normalize(hint);
  if (!target) return null;

  const exact = departments.find((item) => {
    const name = normalize(item.name);
    const code = normalize(item.code);
    return name === target || code === target;
  });
  if (exact) return exact;

  const byContainment = departments.find((item) => {
    const name = normalize(item.name);
    return name.includes(target) || target.includes(name);
  });
  if (byContainment) return byContainment;

  if (/urban|analise|obra|engenharia/.test(target)) {
    return (
      departments.find((item) => /analise urbanistica/.test(normalize(item.name))) ??
      departments.find((item) => /urbanismo e obras/.test(normalize(item.name))) ??
      null
    );
  }
  if (/protocol|triagem|recep/.test(target)) {
    return departments.find((item) => /protocolo/.test(normalize(item.name))) ?? null;
  }
  if (/financ|tesour|arrecad/.test(target)) {
    return departments.find((item) => /financeiro/.test(normalize(item.name))) ?? null;
  }
  if (/tribut/.test(target)) {
    return departments.find((item) => /tribut/.test(normalize(item.name))) ?? null;
  }
  if (/iptu|cadastro imobiliario/.test(target)) {
    return departments.find((item) => /iptu|cadastro imobiliario/.test(normalize(item.name))) ?? null;
  }
  if (/fisc/.test(target)) {
    return departments.find((item) => /fiscal/.test(normalize(item.name))) ?? null;
  }

  return null;
}

export function buildOrganogramPathRecords(
  departments: MunicipalDepartmentRecord[],
  department: MunicipalDepartmentRecord | null | undefined,
) {
  if (!department) return [];

  const byId = new Map(departments.map((item) => [item.id, item]));
  const chain: MunicipalDepartmentRecord[] = [];
  const visited = new Set<string>();
  let current: MunicipalDepartmentRecord | undefined = department;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.unshift(current);
    current = current.parentDepartmentId
      ? byId.get(current.parentDepartmentId)
      : undefined;
  }

  return chain;
}

export function formatOrganogramPath(
  departments: MunicipalDepartmentRecord[],
  hint: string | null | undefined,
) {
  const matched = resolveOrganogramDepartment(departments, hint);
  const chain = buildOrganogramPathRecords(departments, matched);
  if (chain.length === 0) return String(hint || "").trim();

  return chain
    .map((item) => (item.code?.trim() ? `${item.code.trim()} — ${item.name}` : item.name))
    .join(" › ");
}

export function useMunicipalOrganogram(
  municipalityId: string | null | undefined,
  options: OrganogramOptions = {},
) {
  const includeInactive = options.includeInactive ?? false;
  const [departments, setDepartments] = useState<MunicipalDepartmentRecord[]>(() => {
    if (!municipalityId) return [];
    const override = readOverride(municipalityId);
    if (override.length > 0) return resolveVisible(override, includeInactive);
    return readStored(cacheKey(municipalityId, includeInactive));
  });
  const [status, setStatus] = useState("");
  const [hasLocalOverride, setHasLocalOverride] = useState(() =>
    Boolean(municipalityId && readOverride(municipalityId).length > 0),
  );

  useEffect(() => {
    let active = true;

    if (!municipalityId) {
      setDepartments([]);
      setStatus("");
      setHasLocalOverride(false);
      return () => {
        active = false;
      };
    }

    const localOverride = readOverride(municipalityId);
    if (localOverride.length > 0) {
      setDepartments(resolveVisible(localOverride, includeInactive));
      setStatus("");
      setHasLocalOverride(true);
    } else {
      const cached = readStored(cacheKey(municipalityId, includeInactive));
      if (cached.length > 0) {
        setDepartments(cached);
        setStatus("");
      } else {
        setStatus("Carregando organograma municipal...");
      }
      setHasLocalOverride(false);
    }

    const loader = includeInactive
      ? listRemoteInternalMunicipalDepartments
      : listRemoteMunicipalDepartments;

    void loader(municipalityId)
      .then((rows) => {
        if (!active) return;
        const next = resolveVisible(rows, includeInactive);
        writeStored(cacheKey(municipalityId, includeInactive), next);

        const latestOverride = readOverride(municipalityId);
        if (latestOverride.length > 0) {
          setDepartments(resolveVisible(latestOverride, includeInactive));
          setHasLocalOverride(true);
        } else {
          setDepartments(next);
          setHasLocalOverride(false);
        }
        setStatus("");
      })
      .catch((error) => {
        if (!active) return;
        const latestOverride = readOverride(municipalityId);
        const cached = readStored(cacheKey(municipalityId, includeInactive));

        if (latestOverride.length > 0) {
          setDepartments(resolveVisible(latestOverride, includeInactive));
          setHasLocalOverride(true);
          setStatus("");
          return;
        }
        if (cached.length > 0) {
          setDepartments(cached);
          setStatus("");
          return;
        }

        setDepartments([]);
        setStatus(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar o organograma municipal.",
        );
      });

    return () => {
      active = false;
    };
  }, [includeInactive, municipalityId]);

  useEffect(() => {
    if (typeof window === "undefined" || !municipalityId) return;

    const sync = () => {
      const localOverride = readOverride(municipalityId);
      setHasLocalOverride(localOverride.length > 0);
      if (localOverride.length > 0) {
        setDepartments(resolveVisible(localOverride, includeInactive));
        setStatus("");
        return;
      }

      const cached = readStored(cacheKey(municipalityId, includeInactive));
      setDepartments(cached);
    };

    const handleCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ municipalityId?: string }>).detail;
      if (detail?.municipalityId !== municipalityId) return;
      sync();
    };
    const handleStorage = (event: StorageEvent) => {
      if (
        event.key !== overrideKey(municipalityId) &&
        event.key !== cacheKey(municipalityId, includeInactive)
      ) {
        return;
      }
      sync();
    };

    window.addEventListener(EVENT_NAME, handleCustom as EventListener);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, handleCustom as EventListener);
      window.removeEventListener("storage", handleStorage);
    };
  }, [includeInactive, municipalityId]);

  const saveLocalDepartments = useCallback(
    (nextDepartments: MunicipalDepartmentRecord[]) => {
      if (!municipalityId || typeof window === "undefined") return;
      const normalized = sortDepartments(
        nextDepartments.map((item) => ({
          ...item,
          municipalityId,
        })),
      );
      writeStored(overrideKey(municipalityId), normalized);
      setDepartments(resolveVisible(normalized, includeInactive));
      setHasLocalOverride(true);
      setStatus("");
      window.dispatchEvent(
        new CustomEvent(EVENT_NAME, {
          detail: { municipalityId },
        }),
      );
    },
    [includeInactive, municipalityId],
  );

  const clearLocalOverride = useCallback(() => {
    if (!municipalityId || typeof window === "undefined") return;
    window.localStorage.removeItem(overrideKey(municipalityId));
    setHasLocalOverride(false);
    setDepartments(readStored(cacheKey(municipalityId, includeInactive)));
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, {
        detail: { municipalityId },
      }),
    );
  }, [includeInactive, municipalityId]);

  const getPath = useCallback(
    (hint: string | null | undefined) => formatOrganogramPath(departments, hint),
    [departments],
  );

  const getPathRecords = useCallback(
    (hint: string | null | undefined) => {
      const matched = resolveOrganogramDepartment(departments, hint);
      return buildOrganogramPathRecords(departments, matched);
    },
    [departments],
  );

  const roots = useMemo(
    () => departments.filter((item) => !item.parentDepartmentId),
    [departments],
  );

  return {
    departments,
    roots,
    status,
    getPath,
    getPathRecords,
    hasLocalOverride,
    saveLocalDepartments,
    clearLocalOverride,
  };
}
