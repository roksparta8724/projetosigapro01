import type { UploadedFileItem } from "@/components/platform/FileDropZone";

export interface ProtocolDraftForm {
  titulo: string;
  tipo: string;
  endereco: string;
  iptu: string;
  matricula: string;
  proprietario: string;
  documento: string;
  lote: string;
  quadra: string;
  area: string;
  uso: string;
  padraoConstrutivo: string;
  observacoes: string;
  profissional: string;
  registro: string;
  telefone: string;
  email: string;
}

export interface StoredUploadedFileItem {
  id: string;
  fileName: string;
  mimeType: string;
  sizeLabel: string;
  previewUrl?: string;
}

export interface ProtocolDraftPayload {
  draftNumber: string;
  form: ProtocolDraftForm;
  files: Record<string, StoredUploadedFileItem[]>;
  updatedAt: string;
}

const STORAGE_PREFIX = "sigapro-protocol-draft";

export const defaultProtocolDraftForm: ProtocolDraftForm = {
  titulo: "",
  tipo: "",
  endereco: "",
  iptu: "",
  matricula: "",
  proprietario: "",
  documento: "",
  lote: "",
  quadra: "",
  area: "",
  uso: "",
  padraoConstrutivo: "medio",
  observacoes: "",
  profissional: "",
  registro: "",
  telefone: "",
  email: "",
};

function buildDraftStorageKey(sessionId: string, scopeId: string | null) {
  return `${STORAGE_PREFIX}:${scopeId || "sem-tenant"}:${sessionId}`;
}

function buildLegacyDraftStorageKey(sessionId: string, tenantId: string | null) {
  return `${STORAGE_PREFIX}:${tenantId || "sem-tenant"}:${sessionId}`;
}

export function createDraftNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  const d = `${now.getDate()}`.padStart(2, "0");
  const h = `${now.getHours()}`.padStart(2, "0");
  const min = `${now.getMinutes()}`.padStart(2, "0");
  return `PRE-${y}${m}${d}-${h}${min}`;
}

export function readProtocolDraft(sessionId: string, scopeId: string | null, legacyTenantId?: string | null) {
  if (typeof window === "undefined") return null;
  const raw =
    window.localStorage.getItem(buildDraftStorageKey(sessionId, scopeId)) ??
    window.localStorage.getItem(buildLegacyDraftStorageKey(sessionId, legacyTenantId ?? scopeId));
  if (!raw) return null;

  try {
    return JSON.parse(raw) as ProtocolDraftPayload;
  } catch {
    return null;
  }
}

export function saveProtocolDraft(sessionId: string, scopeId: string | null, payload: ProtocolDraftPayload) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(buildDraftStorageKey(sessionId, scopeId), JSON.stringify(payload));
}

export function clearProtocolDraft(sessionId: string, scopeId: string | null, legacyTenantId?: string | null) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(buildDraftStorageKey(sessionId, scopeId));
  if (legacyTenantId && legacyTenantId !== scopeId) {
    window.localStorage.removeItem(buildLegacyDraftStorageKey(sessionId, legacyTenantId));
  }
}

export function toStoredUploadedFiles(files: Record<string, UploadedFileItem[]>) {
  return Object.fromEntries(
    Object.entries(files).map(([label, items]) => [
      label,
      items.map((item) => ({
        id: item.id,
        fileName: item.fileName,
        mimeType: item.mimeType,
        sizeLabel: item.sizeLabel,
        previewUrl: item.previewUrl,
      })),
    ]),
  ) as Record<string, StoredUploadedFileItem[]>;
}

export async function restoreUploadedFiles(
  files: Record<string, StoredUploadedFileItem[]>,
): Promise<Record<string, UploadedFileItem[]>> {
  const entries = await Promise.all(
    Object.entries(files).map(async ([label, items]) => {
      const restoredItems = await Promise.all(
        items.map(async (item) => {
          if (!item.previewUrl?.startsWith("data:")) {
            return { ...item } as UploadedFileItem;
          }

          try {
            const response = await fetch(item.previewUrl);
            const blob = await response.blob();
            const file = new File([blob], item.fileName, { type: item.mimeType });
            return { ...item, file } as UploadedFileItem;
          } catch {
            return { ...item } as UploadedFileItem;
          }
        }),
      );

      return [label, restoredItems] as const;
    }),
  );

  return Object.fromEntries(entries);
}

export function getProtocolFlowBasePath(pathname: string) {
  return pathname.startsWith("/externo") ? "/externo/protocolar" : "/prefeitura/protocolos/novo";
}
