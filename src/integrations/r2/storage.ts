import { deleteFile, uploadFile } from "@/integrations/r2/client";
import { prepareProfileAvatarForUpload } from "@/lib/profileAvatarUpload";

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
  // Somente o Master autenticado pode solicitar este escopo; o servidor R2
  // confirma novamente is_master antes de aceitar a gravação.
  platformScope?: boolean;
  userId: string;
  file: File;
  folder: string;
}) {
  const scopeId = normalizeUuid(input.tenantId);
  const isPlatformAvatar = input.bucket === "profile-assets" && input.platformScope === true;
  if (!scopeId && !isPlatformAvatar) {
    throw new Error("Escopo municipal invalido para upload.");
  }

  const safeUserId = input.userId?.trim();
  if (!safeUserId || safeUserId === "unknown" || !/^[a-zA-Z0-9_-]+$/.test(safeUserId)) {
    throw new Error("Usuario invalido para upload.");
  }

  // Grandes fotos são otimizadas antes de entrar no payload JSON/base64.
  // Nunca redimensionar documentos e PDFs assinados.
  const uploadSource = input.bucket === "profile-assets"
    ? await prepareProfileAvatarForUpload(input.file)
    : input.file;
  const safeName = sanitizeFileName(uploadSource.name);
  const folder = normalizeFolder(input.folder, input.bucket);
  const objectKey = isPlatformAvatar
    ? `platform/profiles/avatars/${safeUserId}/${crypto.randomUUID()}-${safeName}`
    : `municipalities/${scopeId}/${folder}/${safeUserId}/${crypto.randomUUID()}-${safeName}`;
  const bucket =
    input.bucket === "process-documents"
      ? "process-documents"
      : input.bucket === "profile-assets"
        ? "profile-assets"
        : "institutional-branding";

  const uploaded = await uploadFile({ bucket, objectKey, file: uploadSource });
  if (bucket === "process-documents" &&
      (!/^[a-f0-9]{64}$/i.test(String(uploaded.sha256 || "")) ||
       (uploaded.fileSizeBytes != null && uploaded.fileSizeBytes !== uploadSource.size))) {
    throw new Error("O armazenamento não confirmou o SHA-256 e o tamanho reais do documento. Registro bloqueado.");
  }
  return {
    path: uploaded.objectKey,
    publicUrl: uploaded.publicUrl,
    fileHash: uploaded.sha256,
    fileSizeBytes: uploaded.fileSizeBytes ?? uploadSource.size,
    persistentRef: input.bucket === "profile-assets" ? `r2:${uploaded.objectKey}` : uploaded.publicUrl || `r2:${uploaded.objectKey}`,
  };
}


export async function deleteFileFromStorage(input: {
  bucket: MunicipalityFileBucket;
  objectKey: string;
}) {
  const objectKey = input.objectKey?.trim();
  if (!objectKey) return;

  const bucket =
    input.bucket === "process-documents"
      ? "process-documents"
      : input.bucket === "profile-assets"
        ? "profile-assets"
        : "institutional-branding";

  await deleteFile({ bucket, objectKey });
}
