import { useCallback, useEffect, useMemo, useState } from "react";
import { hasBackendEnv } from "@/integrations/backend/databaseClient";
import {
  listRemoteZoningRules,
  saveRemoteZoningRule,
  updateRemoteZoningRuleStatus,
} from "@/integrations/backend/zoning";
import { type ZoningRule, type ZoningRuleStatus } from "@/lib/zoning";

const ZONING_STORAGE_KEY = "sigapro-zoning-rules-store";

type ZoningRuleInput = Omit<ZoningRule, "createdAt"> & { createdAt?: string };
type DataSource = "local" | "remote";

function isLocalDevelopment() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".local") ||
    host.startsWith("192.168.") ||
    host.startsWith("10.")
  );
}

function readLocalRules() {
  if (typeof window === "undefined") return [] as ZoningRule[];

  try {
    const raw = window.localStorage.getItem(ZONING_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ZoningRule[]) : [];
  } catch {
    return [];
  }
}

function writeLocalRules(rules: ZoningRule[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ZONING_STORAGE_KEY, JSON.stringify(rules));
}

function upsertLocalRule(rule: ZoningRule) {
  const current = readLocalRules();
  const next = current.some((item) => item.id === rule.id)
    ? current.map((item) => (item.id === rule.id ? rule : item))
    : [rule, ...current];
  writeLocalRules(next);
  return next;
}

function normalizeRemoteError(error: unknown) {
  if (!error || typeof error !== "object") return "Nao foi possivel carregar o zoneamento.";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const details = "details" in error && typeof error.details === "string" ? error.details : "";
  return [message, details].filter(Boolean).join(" | ") || "Nao foi possivel carregar o zoneamento.";
}

export function useZoningRules(municipalityId: string | null) {
  const [rules, setRules] = useState<ZoningRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState<DataSource>("local");
  const [error, setError] = useState<string | null>(null);

  const loadLocal = useCallback((fallbackError?: string | null) => {
    if (!municipalityId) {
      setRules([]);
      setSource("local");
      setError(fallbackError ?? null);
      setLoading(false);
      return;
    }

    const localRules = readLocalRules()
      .filter((item) => item.municipalityId === municipalityId)
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    setRules(localRules);
    setSource("local");
    setError(fallbackError ?? null);
    setLoading(false);
  }, [municipalityId]);

  const refresh = useCallback(async () => {
    if (!municipalityId) {
      setRules([]);
      setSource("local");
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    if (!hasBackendEnv) {
      if (isLocalDevelopment()) {
        loadLocal();
        return;
      }
      setRules([]);
      setSource("remote");
      setError("Banco oficial indisponível. O zoneamento não será carregado de dados locais.");
      setLoading(false);
      return;
    }

    try {
      const remoteRules = await listRemoteZoningRules(municipalityId);
      setRules(remoteRules);
      setSource("remote");
      setError(null);
    } catch (remoteError) {
      if (isLocalDevelopment()) {
        loadLocal(normalizeRemoteError(remoteError));
        return;
      }
      setRules([]);
      setSource("remote");
      setError(normalizeRemoteError(remoteError));
      return;
    } finally {
      setLoading(false);
    }
  }, [loadLocal, municipalityId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveRule = useCallback(
    async (input: ZoningRuleInput) => {
      if (!municipalityId) {
        throw new Error("Prefeitura nao identificada.");
      }

      setSaving(true);
      const payload: ZoningRule = {
        ...input,
        municipalityId,
        createdAt: input.createdAt ?? new Date().toISOString(),
      };

      try {
        if (hasBackendEnv) {
          const saved = await saveRemoteZoningRule(payload);
          setRules((current) =>
            [...current.filter((item) => item.id !== saved.id), saved].sort((a, b) =>
              a.nome.localeCompare(b.nome, "pt-BR"),
            ),
          );
          setSource("remote");
          setError(null);
          return saved;
        }

        if (!isLocalDevelopment()) {
          throw new Error("Banco oficial indisponível. A regra não foi salva.");
        }
      } catch (error) {
        if (!isLocalDevelopment()) {
          setError(normalizeRemoteError(error));
          throw error;
        }
      } finally {
        setSaving(false);
      }

      const savedLocal = payload.id ? payload : { ...payload, id: `zoning-${crypto.randomUUID()}` };
      const next = upsertLocalRule(savedLocal).filter((item) => item.municipalityId === municipalityId);
      setRules(next.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
      setSource("local");
      return savedLocal;
    },
    [municipalityId, source],
  );

  const updateStatus = useCallback(
    async (id: string, status: ZoningRuleStatus) => {
      if (!municipalityId) {
        throw new Error("Prefeitura nao identificada.");
      }

      setSaving(true);

      try {
        if (hasBackendEnv) {
          const updated = await updateRemoteZoningRuleStatus({ id, municipalityId, status });
          setRules((current) =>
            current
              .map((item) => (item.id === updated.id ? updated : item))
              .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
          );
          setSource("remote");
          setError(null);
          return updated;
        }

        if (!isLocalDevelopment()) {
          throw new Error("Banco oficial indisponível. O status não foi alterado.");
        }
      } catch (error) {
        if (!isLocalDevelopment()) {
          setError(normalizeRemoteError(error));
          throw error;
        }
      } finally {
        setSaving(false);
      }

      const allLocal = readLocalRules();
      const nextAll = allLocal.map((item) =>
        item.id === id && item.municipalityId === municipalityId ? { ...item, status } : item,
      );
      writeLocalRules(nextAll);

      const updatedLocal = nextAll.find((item) => item.id === id && item.municipalityId === municipalityId) ?? null;
      const nextScoped = nextAll
        .filter((item) => item.municipalityId === municipalityId)
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      setRules(nextScoped);
      setSource("local");
      return updatedLocal;
    },
    [municipalityId, source],
  );

  return useMemo(
    () => ({
      rules,
      loading,
      saving,
      source,
      error,
      refresh,
      saveRule,
      updateStatus,
    }),
    [error, loading, refresh, rules, saveRule, saving, source, updateStatus],
  );
}
