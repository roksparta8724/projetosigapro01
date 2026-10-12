import type { UploadedFileItem } from "@/components/platform/FileDropZone";
import { getSignedUrlForObjectStrict } from "@/integrations/r2/client";

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
  storagePath?: string;
  fileSizeBytes?: number;
}

export interface ProtocolDraftPayload {
  draftNumber: string;
  form: ProtocolDraftForm;
  files: Record<string, StoredUploadedFileItem[]>;
  updatedAt: string;
}

const STORAGE_PREFIX = "sigapro-protocol-draft";
const COLLECTION_PREFIX = "sigapro-protocol-drafts-v3";
const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_INLINE_PREVIEW_CHARS = 350_000;

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

function buildDraftCollectionKey(sessionId: string, scopeId: string | null) {
  return `${COLLECTION_PREFIX}:${scopeId || "sem-tenant"}:${sessionId}`;
}

function isValidDraft(payload: ProtocolDraftPayload) {
  const updatedAt = Date.parse(payload.updatedAt);
  return Number.isFinite(updatedAt) && Date.now() - updatedAt <= DRAFT_TTL_MS;
}

function compactDraft(payload: ProtocolDraftPayload): ProtocolDraftPayload {
  return {
    ...payload,
    files: Object.fromEntries(
      Object.entries(payload.files).map(([label, items]) => [
        label,
        items.map((item) => ({
          ...item,
          previewUrl:
            item.previewUrl &&
            !item.previewUrl.startsWith("blob:") &&
            item.previewUrl.length <= MAX_INLINE_PREVIEW_CHARS
              ? item.previewUrl
              : undefined,
        })),
      ]),
    ),
  };
}

function writeDraftCollection(
  sessionId: string,
  scopeId: string | null,
  drafts: ProtocolDraftPayload[],
) {
  const key = buildDraftCollectionKey(sessionId, scopeId);
  const normalized = drafts
    .filter(isValidDraft)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  try {
    window.localStorage.setItem(key, JSON.stringify(normalized));
    return true;
  } catch (error) {
    try {
      window.localStorage.setItem(key, JSON.stringify(normalized.map(compactDraft)));
      return true;
    } catch (compactError) {
      console.warn("[SIGAPRO][Rascunho] Não foi possível persistir a coleção de rascunhos.", {
        error,
        compactError,
      });
      return false;
    }
  }
}

export function createDraftNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = `${now.getMonth() + 1}`.padStart(2, "0");
  const d = `${now.getDate()}`.padStart(2, "0");
  const h = `${now.getHours()}`.padStart(2, "0");
  const min = `${now.getMinutes()}`.padStart(2, "0");
  const sec = `${now.getSeconds()}`.padStart(2, "0");
  return `PRE-${y}${m}${d}-${h}${min}${sec}`;
}

export function listProtocolDrafts(
  sessionId: string,
  scopeId: string | null,
  legacyTenantId?: string | null,
) {
  if (typeof window === "undefined") return [] as ProtocolDraftPayload[];

  const collectionKey = buildDraftCollectionKey(sessionId, scopeId);
  let drafts: ProtocolDraftPayload[] = [];

  try {
    const rawCollection = window.localStorage.getItem(collectionKey);
    if (rawCollection) {
      const parsed = JSON.parse(rawCollection);
      if (Array.isArray(parsed)) {
        drafts = parsed as ProtocolDraftPayload[];
      }
    }
  } catch {
    drafts = [];
  }

  // Migração transparente do formato antigo de rascunho único.
  const legacyKeys = Array.from(
    new Set([
      buildDraftStorageKey(sessionId, scopeId),
      buildLegacyDraftStorageKey(sessionId, legacyTenantId ?? scopeId),
    ]),
  );

  for (const legacyKey of legacyKeys) {
    const rawLegacy = window.localStorage.getItem(legacyKey);
    if (!rawLegacy) continue;

    try {
      const legacyDraft = JSON.parse(rawLegacy) as ProtocolDraftPayload;
      if (
        legacyDraft?.draftNumber &&
        isValidDraft(legacyDraft) &&
        !drafts.some((item) => item.draftNumber === legacyDraft.draftNumber)
      ) {
        drafts.push(legacyDraft);
      }
    } catch {
      // Ignora rascunho legado inválido.
    }
  }

  const validDrafts = drafts
    .filter((draft) => draft?.draftNumber && isValidDraft(draft))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));

  if (validDrafts.length !== drafts.length || legacyKeys.some((key) => window.localStorage.getItem(key))) {
    if (writeDraftCollection(sessionId, scopeId, validDrafts)) {
      legacyKeys.forEach((key) => window.localStorage.removeItem(key));
    }
  }

  return validDrafts;
}

export function readProtocolDraft(
  sessionId: string,
  scopeId: string | null,
  legacyTenantId?: string | null,
  draftNumber?: string | null,
) {
  const drafts = listProtocolDrafts(sessionId, scopeId, legacyTenantId);
  if (!draftNumber) return drafts[0] ?? null;
  return drafts.find((draft) => draft.draftNumber === draftNumber) ?? null;
}

export function saveProtocolDraft(
  sessionId: string,
  scopeId: string | null,
  payload: ProtocolDraftPayload,
) {
  if (typeof window === "undefined") return false;

  const drafts = listProtocolDrafts(sessionId, scopeId);
  const next = [
    payload,
    ...drafts.filter((draft) => draft.draftNumber !== payload.draftNumber),
  ];

  return writeDraftCollection(sessionId, scopeId, next);
}

export function clearProtocolDraft(
  sessionId: string,
  scopeId: string | null,
  legacyTenantId?: string | null,
  draftNumber?: string | null,
) {
  if (typeof window === "undefined") return;

  if (draftNumber) {
    const drafts = listProtocolDrafts(sessionId, scopeId, legacyTenantId).filter(
      (draft) => draft.draftNumber !== draftNumber,
    );
    writeDraftCollection(sessionId, scopeId, drafts);
    return;
  }

  window.localStorage.removeItem(buildDraftCollectionKey(sessionId, scopeId));
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
        previewUrl:
          item.previewUrl &&
          !item.previewUrl.startsWith("blob:") &&
          item.previewUrl.length <= MAX_INLINE_PREVIEW_CHARS
            ? item.previewUrl
            : undefined,
        storagePath: item.storagePath,
        fileSizeBytes: item.fileSizeBytes ?? item.file?.size,
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
          if (item.storagePath) {
            try {
              const bucket =
                (import.meta.env.VITE_R2_BUCKET_DOCUMENTOS as string | undefined) ||
                "sigapro-documentos";
              const previewUrl = await getSignedUrlForObjectStrict({
                bucket,
                objectKey: item.storagePath,
                expiresIn: 3600,
              });
              return { ...item, previewUrl } as UploadedFileItem;
            } catch {
              return { ...item, previewUrl: undefined } as UploadedFileItem;
            }
          }

          if (!item.previewUrl?.startsWith("data:")) {
            return { ...item } as UploadedFileItem;
          }

          try {
            const response = await fetch(item.previewUrl);
            const blob = await response.blob();
            const file = new File([blob], item.fileName, { type: item.mimeType });
            return {
              ...item,
              file,
              fileSizeBytes: blob.size,
            } as UploadedFileItem;
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
