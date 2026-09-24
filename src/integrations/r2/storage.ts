import { uploadFile } from "@/integrations/r2/client";

type MunicipalityFileBucket = "process-documents" | "profile-assets" | "institutional-branding";

function normalizeUuid(value: string | null | undefined) {
  if (!value) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function normalizeFolder(folder: string, bucket: MunicipalityFileBucket) {
  const normalized = folder
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "files";

  if (bucket === "profile-assets") {
    return normalized === "avatars" ? "profiles/avatars" : `profiles/${normalized}`;
  }

  const aliases: Record<string, string> = {
    protocolos: "protocols",
    protocolo: "protocols",
    analise: "analysis",
    analises: "analysis",
    anexos: "attachments",
    anexo: "attachments",
    documentos: "documents",
    documento: "documents",
    branding: "branding",
    avatar: "profiles/avatars",
    avatars: "profiles/avatars",
  };

  return aliases[normalized] || normalized;
}

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-");
}

export async function uploadFileToStorage(input: {
  bucket: MunicipalityFileBucket;
  tenantId?: string | null;
  userId: string;
  file: File;
  folder: string;
}) {
  const scopeId = normalizeUuid(input.tenantId);
  if (!scopeId) {
    throw new Error("Escopo municipal invalido para upload.");
  }

  const safeUserId = input.userId?.trim();
  if (!safeUserId || safeUserId === "unknown" || !/^[a-zA-Z0-9_-]+$/.test(safeUserId)) {
    throw new Error("Usuario invalido para upload.");
  }

  const safeName = sanitizeFileName(input.file.name);
  const folder = normalizeFolder(input.folder, input.bucket);
  const objectKey = `municipalities/${scopeId}/${folder}/${safeUserId}/${crypto.randomUUID()}-${safeName}`;
  const bucket = input.bucket === "process-documents"
    ? (import.meta.env.VITE_R2_BUCKET_DOCUMENTOS || "sigapro-documentos")
    : (import.meta.env.VITE_R2_BUCKET_LOGOS || "sigapro-logos");

  const uploaded = await uploadFile({ bucket, objectKey, file: input.file });
  return { path: uploaded.objectKey, publicUrl: uploaded.publicUrl };
}
