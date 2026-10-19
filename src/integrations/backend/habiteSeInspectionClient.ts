import { backendClient, neonDataApiUrl } from "@/integrations/backend/databaseClient";
import {
  deleteFile,
  getSignedUrlForObjectStrict,
  uploadFile,
} from "@/integrations/r2/client";

export type HabiteSeInspectionChecklistStatus =
  | ""
  | "conforme"
  | "pendencia"
  | "nao_aplica";

export type HabiteSeInspectionChecklist = Record<
  string,
  HabiteSeInspectionChecklistStatus
>;

export type HabiteSeInspectionPhotoCategory =
  | "fachada"
  | "implantacao"
  | "habitabilidade"
  | "acessibilidade"
  | "externa"
  | "divergencia"
  | "outros";

export type HabiteSeInspectionPhoto = {
  id: string;
  category: HabiteSeInspectionPhotoCategory;
  objectKey: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number | null;
  caption: string;
  createdAt: string;
  url: string;
};

export type HabiteSeInspectionRecord = {
  id: string;
  processId: string;
  status: "rascunho" | "conforme" | "pendencias";
  checklist: HabiteSeInspectionChecklist;
  notes: string;
  photoEvidenceWaived: boolean;
  photoWaiverReason: string;
  inspectorProfileId: string | null;
  inspectorName: string;
  inspectedAt: string;
  completedAt: string | null;
  updatedAt: string;
};

export type HabiteSeInspectionSnapshot = {
  inspection: HabiteSeInspectionRecord | null;
  photos: HabiteSeInspectionPhoto[];
  canManage: boolean;
};

function dbOrThrow() {
  if (!backendClient) {
    throw new Error("Banco oficial indisponível para a vistoria.");
  }
  return backendClient;
}

function databaseErrorMessage(error: unknown) {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== "object") return "Erro desconhecido do banco oficial.";

  const record = error as Record<string, unknown>;
  const nested =
    record.error && typeof record.error === "object"
      ? databaseErrorMessage(record.error)
      : "";
  const parts = [
    typeof record.message === "string" ? record.message : "",
    typeof record.details === "string" ? record.details : "",
    typeof record.hint === "string" ? record.hint : "",
    typeof record.code === "string" ? record.code : "",
    nested,
  ].filter(Boolean);

  return parts.join(" | ") || "Erro desconhecido do banco oficial.";
}

function isInspectionSchemaCacheError(value: unknown) {
  const message = databaseErrorMessage(value);
  return /PGRST20[245]|schema cache|could not find the function|could not find the table/i.test(
    message,
  );
}

function normalizeInspectionDatabaseError(value: unknown) {
  const message = databaseErrorMessage(value);
  if (isInspectionSchemaCacheError(message)) {
    return "O serviço de dados da vistoria ainda não reconheceu a atualização do banco. O SIGAPRO tentou sincronizar automaticamente; atualize a página uma vez e tente novamente. Código técnico: PGRST202.";
  }
  return message;
}

async function ensureAuthenticatedDatabaseSession() {
  const db = dbOrThrow();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await db.auth?.getSession?.();
    const session = result?.data?.session ?? null;
    const token =
      session?.access_token ||
      session?.accessToken ||
      session?.token ||
      "";

    if (session) {
      return {
        db,
        session,
        token: String(token || "").trim(),
      };
    }

    if (attempt < 7) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 180));
    }
  }

  throw new Error(
    "A sessão segura da Prefeitura não foi restaurada. Saia e entre novamente somente se o aviso persistir após atualizar a página.",
  );
}

async function readInspectionApiPayload(response: Response) {
  const raw = await response.text();
  if (!raw) return null;

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

async function callInspectionRpc<T = unknown>(
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { db, token } = await ensureAuthenticatedDatabaseSession();

  // No Neon, enviamos o RPC diretamente para a Data API com JSON explícito.
  // Isso evita qualquer adaptação do SDK que possa descartar argumentos e
  // transformar a chamada em uma função "sem parâmetros" (PGRST202).
  if (neonDataApiUrl && token) {
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const response = await fetch(
          `${neonDataApiUrl}/rpc/${encodeURIComponent(fn)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
            body: JSON.stringify(args),
          },
        );
        const payload = await readInspectionApiPayload(response);

        if (response.ok) {
          return payload as T;
        }

        lastError = payload;
        if (isInspectionSchemaCacheError(payload) && attempt < 4) {
          await new Promise((resolve) =>
            globalThis.setTimeout(resolve, 350 * (attempt + 1)),
          );
          continue;
        }

        throw new Error(normalizeInspectionDatabaseError(payload));
      } catch (error) {
        lastError = error;
        if (isInspectionSchemaCacheError(error) && attempt < 4) {
          await new Promise((resolve) =>
            globalThis.setTimeout(resolve, 350 * (attempt + 1)),
          );
          continue;
        }
        if (error instanceof TypeError && attempt < 2) {
          await new Promise((resolve) =>
            globalThis.setTimeout(resolve, 300 * (attempt + 1)),
          );
          continue;
        }
        throw error;
      }
    }

    throw new Error(normalizeInspectionDatabaseError(lastError));
  }

  // Compatibilidade do rollback Supabase/ambientes antigos.
  const { data, error } = await db.rpc(fn, args);
  if (error) {
    throw new Error(normalizeInspectionDatabaseError(error));
  }
  return data as T;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function booleanValue(value: unknown) {
  return value === true;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mapInspection(value: unknown): HabiteSeInspectionRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = asRecord(value);
  const id = stringValue(row.id);
  if (!id) return null;

  return {
    id,
    processId: stringValue(row.process_id),
    status:
      row.status === "conforme" || row.status === "pendencias"
        ? row.status
        : "rascunho",
    checklist:
      row.checklist && typeof row.checklist === "object"
        ? (row.checklist as HabiteSeInspectionChecklist)
        : {},
    notes: stringValue(row.notes),
    photoEvidenceWaived: booleanValue(row.photo_evidence_waived),
    photoWaiverReason: stringValue(row.photo_waiver_reason),
    inspectorProfileId: stringValue(row.inspector_profile_id) || null,
    inspectorName: stringValue(row.inspector_name),
    inspectedAt: stringValue(row.inspected_at),
    completedAt: stringValue(row.completed_at) || null,
    updatedAt: stringValue(row.updated_at),
  };
}

function mapPhoto(value: unknown): Omit<HabiteSeInspectionPhoto, "url"> | null {
  if (!value || typeof value !== "object") return null;
  const row = asRecord(value);
  const id = stringValue(row.id);
  const objectKey = stringValue(row.object_key);
  if (!id || !objectKey) return null;

  const category = stringValue(row.category) as HabiteSeInspectionPhotoCategory;
  return {
    id,
    category,
    objectKey,
    fileName: stringValue(row.file_name),
    mimeType: stringValue(row.mime_type),
    fileSizeBytes: numberValue(row.file_size_bytes),
    caption: stringValue(row.caption),
    createdAt: stringValue(row.created_at),
  };
}

async function resolvePhotoUrl(objectKey: string) {
  try {
    return await getSignedUrlForObjectStrict({
      bucket:
        (import.meta.env.VITE_R2_BUCKET_DOCUMENTOS as string | undefined) ||
        "sigapro-documentos",
      objectKey,
      expiresIn: 21600,
    });
  } catch {
    return "";
  }
}

export async function getHabiteSeInspection(
  processId: string,
): Promise<HabiteSeInspectionSnapshot> {
  const normalizedProcessId = processId.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalizedProcessId)) {
    throw new Error("Processo inválido para carregar o termo de vistoria.");
  }

  const data = await callInspectionRpc("get_habite_se_inspection_v1", {
    _process_id: normalizedProcessId,
  });

  const payload = asRecord(data);
  const rawPhotos = Array.isArray(payload.photos) ? payload.photos : [];
  const mappedPhotos = rawPhotos
    .map(mapPhoto)
    .filter((photo): photo is NonNullable<typeof photo> => Boolean(photo));

  const photos = await Promise.all(
    mappedPhotos.map(async (photo) => ({
      ...photo,
      url: await resolvePhotoUrl(photo.objectKey),
    })),
  );

  return {
    inspection: mapInspection(payload.inspection),
    photos,
    canManage: booleanValue(payload.can_manage),
  };
}

export async function saveHabiteSeInspectionDraft(input: {
  processId: string;
  checklist: HabiteSeInspectionChecklist;
  notes: string;
  photoEvidenceWaived: boolean;
  photoWaiverReason: string;
}) {
  const data = await callInspectionRpc("upsert_habite_se_inspection_v1", {
    _process_id: input.processId,
    _checklist: input.checklist,
    _notes: input.notes || null,
    _photo_evidence_waived: input.photoEvidenceWaived,
    _photo_waiver_reason: input.photoWaiverReason || null,
  });

  const payload = asRecord(data);
  const inspection = mapInspection(payload.inspection);
  if (!inspection) throw new Error("O banco não retornou o termo de vistoria salvo.");
  return inspection;
}

export async function uploadHabiteSeInspectionPhoto(input: {
  processId: string;
  municipalityId: string;
  inspectionId: string;
  file: File;
  category: HabiteSeInspectionPhotoCategory;
  caption: string;
}) {
  if (!input.file.type.startsWith("image/")) {
    throw new Error("A evidência da vistoria deve ser uma imagem.");
  }
  if (input.file.size > 12 * 1024 * 1024) {
    throw new Error("Cada foto da vistoria pode ter no máximo 12 MB.");
  }

  const extension =
    input.file.name.split(".").pop()?.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]/g, "") ||
    "jpg";
  const objectKey =
    `municipalities/${input.municipalityId}/processes/${input.processId}/habite-se-inspection/${input.inspectionId}/${crypto.randomUUID()}.${extension}`;

  const uploaded = await uploadFile({
    bucket:
      (import.meta.env.VITE_R2_BUCKET_DOCUMENTOS as string | undefined) ||
      "sigapro-documentos",
    objectKey,
    file: input.file,
  });

  try {
    const data = await callInspectionRpc("add_habite_se_inspection_photo_v1", {
      _process_id: input.processId,
      _inspection_id: input.inspectionId,
      _category: input.category,
      _object_key: uploaded.objectKey,
      _file_name: input.file.name,
      _mime_type: input.file.type || null,
      _file_size_bytes: input.file.size,
      _caption: input.caption || null,
    });

    const payload = asRecord(data);
    const photo = mapPhoto(payload.photo);
    if (!photo) throw new Error("O banco não retornou a evidência fotográfica.");

    return {
      ...photo,
      url: await resolvePhotoUrl(photo.objectKey),
    } satisfies HabiteSeInspectionPhoto;
  } catch (error) {
    await deleteFile({
      bucket:
        (import.meta.env.VITE_R2_BUCKET_DOCUMENTOS as string | undefined) ||
        "sigapro-documentos",
      objectKey: uploaded.objectKey,
    }).catch(() => undefined);
    throw error;
  }
}

export async function removeHabiteSeInspectionPhoto(input: {
  processId: string;
  photoId: string;
}) {
  const data = await callInspectionRpc("remove_habite_se_inspection_photo_v1", {
    _process_id: input.processId,
    _photo_id: input.photoId,
  });

  const payload = asRecord(data);
  const photo = mapPhoto(payload.photo);
  if (photo?.objectKey) {
    await deleteFile({
      bucket:
        (import.meta.env.VITE_R2_BUCKET_DOCUMENTOS as string | undefined) ||
        "sigapro-documentos",
      objectKey: photo.objectKey,
    }).catch(() => undefined);
  }
}

export async function completeHabiteSeInspection(input: {
  processId: string;
  result: "conforme" | "pendencias";
  checklist: HabiteSeInspectionChecklist;
  notes: string;
  photoEvidenceWaived: boolean;
  photoWaiverReason: string;
}) {
  const data = await callInspectionRpc("complete_habite_se_inspection_v1", {
    _process_id: input.processId,
    _result: input.result,
    _checklist: input.checklist,
    _notes: input.notes || null,
    _photo_evidence_waived: input.photoEvidenceWaived,
    _photo_waiver_reason: input.photoWaiverReason || null,
  });
  const payload = asRecord(data);
  return {
    ...payload,
    inspection: mapInspection(payload.inspection),
  };
}
