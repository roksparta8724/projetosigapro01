import { backendClient } from "@/integrations/backend/databaseClient";

export type R2UploadResult = {
  bucket: string;
  objectKey: string;
  publicUrl: string;
};

const apiBase = (import.meta.env.VITE_R2_API_BASE || "").toString().replace(/\/+$/, "");
const isolatedQa = import.meta.env.VITE_SIGAPRO_NEON_ISOLATED === "true";

function buildApiUrl(path: string) {
  if (isolatedQa) return path.startsWith("/") ? path : `/${path}`;
  if (!apiBase) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${apiBase}${normalized}`;
}

function buildApiCandidates(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (isolatedQa) return [normalized]; // QA must NEVER fall back to a Vercel/R2 production API.
  if (!apiBase) return [normalized];

  const remote = `${apiBase}${normalized}`;
  const isLocalBrowser =
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

  return Array.from(
    new Set(isLocalBrowser ? [remote, normalized] : [normalized, remote]),
  );
}

function normalizeClientBucket(value: string) {
  const normalized = String(value || "").trim();
  const configuredDocuments = String(
    import.meta.env.VITE_R2_BUCKET_DOCUMENTOS || "",
  ).trim();
  const configuredLogos = String(
    import.meta.env.VITE_R2_BUCKET_LOGOS || "",
  ).trim();

  if (
    normalized === "process-documents" ||
    normalized === "sigapro-documentos" ||
    (configuredDocuments && normalized === configuredDocuments)
  ) {
    return "process-documents";
  }

  if (
    normalized === "institutional-branding" ||
    normalized === "profile-assets" ||
    normalized === "sigapro-logos" ||
    (configuredLogos && normalized === configuredLogos)
  ) {
    return "institutional-branding";
  }

  return normalized;
}

async function getAuthorizationHeaders() {
  try {
    const sessionResult = await backendClient?.auth?.getSession?.();
    const session = sessionResult?.data?.session ?? null;
    const token =
      session?.access_token ||
      session?.accessToken ||
      session?.token ||
      "";
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

export function getPublicUrl(objectKey: string, baseOverride?: string) {
  const base = (baseOverride || import.meta.env.VITE_R2_PUBLIC_BASE_URL || "").toString();
  if (!base) return "";
  return `${base.replace(/\/+$/, "")}/${objectKey.replace(/^\/+/, "")}`;
}

/** Recover a stable R2 object reference from older short-lived signed URLs.
 * Accept ONLY the requesting municipality's legislation keys hosted by R2.
 * Avoid using an arbitrary external URL as the source of a storage object key.
 */
export function getStableMunicipalLegislationReference(
  reference: string | null | undefined,
  municipalityId?: string | null,
): string {
  const raw = String(reference || "").trim();
  if (!raw || raw.startsWith("r2:")) return raw;
  const id = String(municipalityId || "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !/(^|\.)r2\.cloudflarestorage\.com$/i.test(url.hostname)) return raw;
    const path = decodeURIComponent(url.pathname);
    const prefix = `/municipalities/${id}/legislation`;
    const start = path.toLowerCase().indexOf(prefix);
    if (start < 0) return raw;
    const objectKey = path.slice(start + 1);
    if (!/^municipalities\/[0-9a-f-]{36}\/legislation(?:[-/]|$)/i.test(objectKey)) return raw;
    return `r2:${objectKey}`;
  } catch {
    return raw;
  }
}

export function getLegislationOpenUrl(reference: string) {
  const raw = String(reference || "").trim();
  if (!raw) return "";
  if (!raw.startsWith("r2:")) return raw;

  const objectKey = raw.slice(3).trim().replace(/^\/+/, "");
  if (!objectKey) return "";

  return buildApiUrl(
    `/api/legislation-open?objectKey=${encodeURIComponent(objectKey)}`,
  );
}

export function getLegacyProfileAvatarOpenUrl(sourceUrl: string | null | undefined) {
  const raw = String(sourceUrl || "").trim();
  if (!raw) return "";

  try {
    const source = new URL(raw);
    const allowedHost = /(^|\.)supabase\.co$/i.test(source.hostname);
    const allowedPath = source.pathname.startsWith("/storage/v1/object/public/avatars/");
    if (source.protocol !== "https:" || !allowedHost || !allowedPath) return raw;
  } catch {
    return raw;
  }

  // O bucket legado "avatars" é público. Para a primeira pintura do perfil
  // usamos a própria URL pública, evitando uma função serverless no caminho
  // crítico do F5. UserAvatar mantém /api/profile-avatar-open como fallback
  // caso a origem legada fique temporariamente indisponível.
  return raw;
}

export function getMunicipalityLogoOpenUrl(objectKey: string | null | undefined) {
  const normalized = String(objectKey || "").trim().replace(/^\/+/, "");
  if (!normalized) return "";

  return buildApiUrl(
    `/api/municipality-logo-open?objectKey=${encodeURIComponent(normalized)}`,
  );
}

export function getObjectKeyFromPublicUrl(publicUrl: string) {
  if (!publicUrl) return "";
  const base = (import.meta.env.VITE_R2_PUBLIC_BASE_URL || "").toString().replace(/\/+$/, "");
  try {
    if (base && publicUrl.startsWith(base)) {
      return publicUrl.slice(base.length).replace(/^\/+/, "");
    }
    const url = new URL(publicUrl);
    return url.pathname.replace(/^\/+/, "");
  } catch {
    return "";
  }
}

async function requestSignedUrl(path: string, input: { bucket: string; objectKey: string; expiresIn?: number }) {
  const bucket = normalizeClientBucket(input.bucket);
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await getAuthorizationHeaders()),
    },
    body: JSON.stringify({
      bucket,
      objectKey: input.objectKey,
      expiresIn: input.expiresIn,
    }),
  });

  return response;
}

async function requestSignedUrlWithFallback(input: {
  bucket: string;
  objectKey: string;
  expiresIn?: number;
}) {
  const candidates = buildApiCandidates("/api/r2-sign-get");
  let lastResponse: Response | null = null;
  let lastMessage = "";

  for (const candidate of candidates) {
    try {
      const response = await requestSignedUrl(candidate, input);
      if (response.ok) return response;

      lastResponse = response;
      const payload = await response.clone().json().catch(() => null) as
        | { error?: string }
        | null;
      lastMessage =
        payload?.error ||
        `Falha ao gerar URL assinada (HTTP ${response.status}).`;
    } catch (error) {
      lastMessage =
        error instanceof Error
          ? error.message
          : "Falha de comunicação ao gerar URL assinada.";
    }
  }

  if (lastResponse) {
    const synthetic = new Response(
      JSON.stringify({ error: lastMessage || "Falha ao gerar URL assinada." }),
      {
        status: lastResponse.status || 500,
        headers: { "Content-Type": "application/json" },
      },
    );
    return synthetic;
  }

  throw new Error(lastMessage || "Falha ao gerar URL assinada.");
}

export async function getSignedUrlForObject(input: {
  bucket: string;
  objectKey: string;
  expiresIn?: number;
}) {
  // Public fallback is only for municipal legislation explicitly intended for public access.
  // Never turn an auth/RLS failure for a private process PDF (or profile assets)
  // into a public bucket URL even when the compatibility flag is enabled.
  const publicLegislationKey =
    /^municipalities\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/legislation(?:[-/]|$)/i.test(input.objectKey);
  const allowPublicFallback =
    String(import.meta.env.VITE_R2_PUBLIC_FALLBACK || "").toLowerCase() === "true" &&
    normalizeClientBucket(input.bucket) === "process-documents" &&
    publicLegislationKey;
  const expiresIn = typeof input.expiresIn === "number" && Number.isFinite(input.expiresIn)
    ? input.expiresIn
    : 21600;
  const response = await requestSignedUrlWithFallback({ ...input, expiresIn });

  if (!response.ok) {
    if (allowPublicFallback) {
      const publicUrl = getPublicUrl(input.objectKey);
      if (publicUrl) {
        return publicUrl;
      }
    }
    const payload = await response.json().catch(() => ({}));
    const message = payload?.error || "Falha ao gerar URL assinada.";
    throw new Error(message);
  }

  const payload = (await response.json().catch(() => ({}))) as {
    signedUrl?: string;
  };

  return payload.signedUrl || "";
}

export async function getSignedUrlForObjectStrict(input: {
  bucket: string;
  objectKey: string;
  expiresIn?: number;
}) {
  const expiresIn = typeof input.expiresIn === "number" && Number.isFinite(input.expiresIn)
    ? input.expiresIn
    : 21600;
  const response = await requestSignedUrlWithFallback({ ...input, expiresIn });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload?.error || "Falha ao gerar URL assinada.";
    throw new Error(message);
  }

  const payload = (await response.json().catch(() => ({}))) as {
    signedUrl?: string;
  };

  return payload.signedUrl || "";
}

const LARGE_LEGAL_PDF_THRESHOLD = 2 * 1024 * 1024;
const LEGAL_PDF_KEY = /^municipalities\/[0-9a-f-]{36}\/legislation-(?:plano-diretor|uso-solo|zoneamento|leis-complementares)\//i;

/** PDFs above ~2 MiB cannot reliably transit Vercel as Base64 JSON. */
export function isDirectLegalPdfUpload(bucket: string, objectKey: string, file: { name: string; size: number }) {
  return normalizeClientBucket(bucket) === "process-documents" &&
    LEGAL_PDF_KEY.test(objectKey) &&
    /\.pdf$/i.test(file.name) && file.size > LARGE_LEGAL_PDF_THRESHOLD;
}

async function uploadLargeLegalPdf(input: {bucket: string; objectKey: string; file: File}) {
  const tokenHeaders = await getAuthorizationHeaders();
  if (!("Authorization" in tokenHeaders)) throw new Error("Faça login novamente para enviar a legislação.");
  if (input.file.size > 100 * 1024 * 1024) throw new Error(
    "O PDF oficial excede 100 MB. Otimize o arquivo original ou solicite um plano específico de armazenamento.",
  );
  const signature = await input.file.slice(0, 5).arrayBuffer();
  const pdfMarker = String.fromCharCode(...new Uint8Array(signature));
  if (pdfMarker !== "%PDF-") throw new Error("O arquivo não possui cabeçalho PDF válido.");

  const request = {
    bucket: "process-documents", objectKey: input.objectKey,
    contentType: "application/pdf", fileSize: input.file.size,
  };
  async function send(action: "sign" | "verify") {
    const response = await fetch(buildApiUrl("/api/r2-legal-sign-put"), {
      method:"POST",
      headers: {"Content-Type":"application/json", ...tokenHeaders},
      credentials:"same-origin",
      body:JSON.stringify({ ...request, action }),
    });
    const result = await response.json().catch(() => ({})) as {
      error?: string; uploadUrl?: string; requiredHeaders?: Record<string,string>;
      objectKey?: string; publicUrl?: string; ok?: boolean;
    };
    if (!response.ok) throw new Error(result.error || "Não foi possível autorizar o PDF no armazenamento.");
    return result;
  }
  const signed = await send("sign");
  if (!signed.uploadUrl || !signed.requiredHeaders ||
    signed.objectKey !== input.objectKey) throw new Error("Assinatura de upload inválida.");
  const target = new URL(signed.uploadUrl);
  if (target.protocol !== "https:" || target.username || target.password)
    throw new Error("URL de upload insegura.");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7 * 60_000);
  try {
    let uploaded: Response;
    try {
      uploaded = await fetch(target.toString(), {
        method:"PUT",
        headers:signed.requiredHeaders,
        body:input.file,
        mode:"cors",
        redirect:"error",
        signal:controller.signal,
      });
    } catch {
      throw new Error(
        "Não foi possível enviar o PDF diretamente ao armazenamento. Verifique a conexão e o CORS do bucket R2 (origem deste subdomínio, método PUT, cabeçalhos Content-Type e If-None-Match). O PDF anterior não foi substituído.",
      );
    }
    if (!uploaded.ok) {
      throw new Error(uploaded.status === 412
        ? "Esta versão do PDF já existe no R2. Reenvie como uma nova revisão."
        : \`Falha de envio direto do PDF ao armazenamento (HTTP \${uploaded.status}).\`);
    }
    const verified = await send("verify");
    if (!verified.ok || verified.objectKey !== input.objectKey) {
      throw new Error("O armazenamento não confirmou a integridade do PDF enviado.");
    }
    return { bucket:"process-documents", objectKey: input.objectKey, publicUrl:"" } satisfies R2UploadResult;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fileToBase64(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo."));
    reader.readAsDataURL(file);
  });
  const [, base64] = dataUrl.split(",");
  return base64 || "";
}

export async function uploadFile(input: {
  bucket: string;
  objectKey: string;
  file: File;
}) {
  if (isDirectLegalPdfUpload(input.bucket, input.objectKey, input.file)) {
    return uploadLargeLegalPdf(input);
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => {
    controller.abort();
  }, 30000);

  try {
    const base64 = await fileToBase64(input.file);
    if (!base64) {
      throw new Error("Arquivo inválido para upload.");
    }

    console.warn("[SIGAPRO][R2] upload iniciado", {
      endpoint: "/api/r2-upload",
      bucket: normalizeClientBucket(input.bucket),
      objectKey: input.objectKey,
      fileName: input.file.name,
      fileSize: input.file.size,
      mimeType: input.file.type || "application/octet-stream",
    });

    const response = await fetch(buildApiUrl("/api/r2-upload"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(await getAuthorizationHeaders()),
      },
      body: JSON.stringify({
        bucket: normalizeClientBucket(input.bucket),
        objectKey: input.objectKey,
        contentType: input.file.type || "application/octet-stream",
        fileName: input.file.name,
        base64,
      }),
      signal: controller.signal,
    });

    const payload = (await response.json().catch(() => ({}))) as {
      bucket: string;
      objectKey: string;
      publicUrl: string;
      error?: string;
    };

    console.warn("[SIGAPRO][R2] resposta upload", {
      status: response.status,
      ok: response.ok,
      payload,
    });

    if (!response.ok) {
      const message = payload?.error || "Falha ao enviar o arquivo.";
      throw new Error(message);
    }

    return {
      bucket: payload.bucket,
      objectKey: payload.objectKey,
      publicUrl: payload.publicUrl,
    } satisfies R2UploadResult;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Tempo limite no upload para o R2.");
    }
    console.error("[SIGAPRO][R2] falha no upload", error);
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export type RecoverableProcessFile = {
  objectKey: string;
  fileName: string;
  size: number;
  lastModified: string | null;
};

export async function listRecoverableProcessFiles(input?: { since?: string; processId?: string }) {
  const response = await fetch(buildApiUrl("/api/r2-list-user-files"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await getAuthorizationHeaders()),
    },
    body: JSON.stringify({ since: input?.since, processId: input?.processId }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    files?: RecoverableProcessFile[];
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || "Falha ao localizar uploads anteriores.");
  }

  return Array.isArray(payload.files) ? payload.files : [];
}

export async function deleteFile(input: { bucket: string; objectKey: string }) {
  const response = await fetch(buildApiUrl("/api/r2-delete"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await getAuthorizationHeaders()),
    },
    body: JSON.stringify({
      ...input,
      bucket: normalizeClientBucket(input.bucket),
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload?.error || "Falha ao remover o arquivo.";
    throw new Error(message);
  }

  return response.json() as Promise<{ ok: boolean; bucket: string; objectKey: string }>;
}
