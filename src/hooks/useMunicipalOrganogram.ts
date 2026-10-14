import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listRemoteMunicipalDepartments,
  type MunicipalDepartmentRecord,
} from "@/integrations/backend/platform";

const CACHE_PREFIX = "sigapro:municipal-organogram:v1";

function normalize(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ");
}

function readCache(municipalityId: string | null | undefined) {
  if (typeof window === "undefined" || !municipalityId) return [];
  try {
    const raw = window.sessionStorage.getItem(`${CACHE_PREFIX}:${municipalityId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MunicipalDepartmentRecord[];
    return Array.isArray(parsed) ? parsed.filter((item) => item?.id && item?.name) : [];
  } catch {
    return [];
  }
}

function writeCache(municipalityId: string, departments: MunicipalDepartmentRecord[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      `${CACHE_PREFIX}:${municipalityId}`,
      JSON.stringify(departments),
    );
  } catch {
    // Cache visual não pode bloquear o organograma oficial.
  }
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

export function useMunicipalOrganogram(municipalityId: string | null | undefined) {
  const [departments, setDepartments] = useState<MunicipalDepartmentRecord[]>(() =>
    readCache(municipalityId),
  );
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;

    if (!municipalityId) {
      setDepartments([]);
      setStatus("");
      return () => {
        active = false;
      };
    }

    const cached = readCache(municipalityId);
    if (cached.length > 0) {
      setDepartments(cached);
    }
    setStatus(cached.length > 0 ? "" : "Carregando organograma municipal...");

    void listRemoteMunicipalDepartments(municipalityId)
      .then((rows) => {
        if (!active) return;
        const next = rows
          .filter((item) => item.isActive)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR"));
        setDepartments(next);
        setStatus(next.length > 0 ? "" : "Nenhuma unidade ativa foi encontrada no organograma.");
        writeCache(municipalityId, next);
      })
      .catch((error) => {
        if (!active) return;
        const fallback = readCache(municipalityId);
        if (fallback.length > 0) {
          setDepartments(fallback);
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
  }, [municipalityId]);

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
  };
}
