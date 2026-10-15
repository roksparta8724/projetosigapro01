import { backendClient } from "@/integrations/backend/databaseClient";

export type R2UploadResult = {
  bucket: string;
  objectKey: string;
  publicUrl: string;
};

const rawApiBase = (import.meta.env.VITE_R2_API_BASE || "").toString().trim().replace(/\/+$/, "");
const isLocalBrowser =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname.toLowerCase());
const officialReadApiBase = "https://sigapromunicipal.com.br";

function isLoopbackUrl(value: string) {
  if (!value) return false;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase());
  } catch {
    return /(^|\/\/)(localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(value);
  }
}

// Nunca permita que uma build oficial carregue uma API-base de desenvolvimento.
// Isso elimina redirects/leitura apontando para localhost em produção.
const apiBase =
  !isLocalBrowser && isLoopbackUrl(rawApiBase)
    ? ""
    : rawApiBase;

function buildApiUrl(path: string) {
  if (!apiBase) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${apiBase}${normalized}`;
}

function buildReadApiUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;

  // Em localhost a chamada permanece same-origin. O middleware do Vite decide:
  // usa credenciais R2 locais quando existem; caso contrário, encaminha SOMENTE
  // a leitura para a API oficial. Escritas nunca recebem esse fallback.
  if (isLocalBrowser) return normalized;

  if (apiBase) return `${apiBase}${normalized}`;
  return normalized;
}

export async function resolveR2BearerToken(auth: any) {
  try {
    // Neon Auth exposes the JWT specifically for authenticated API calls.
    // Prefer it over inferring a bearer token from the session object shape.
    const directJwt = await auth?.getJWTToken?.();
    const normalizedDirectJwt =
      typeof directJwt === "string"
        ? directJwt
        : typeof directJwt?.data === "string"
          ? directJwt.data
          : typeof directJwt?.token === "string"
            ? directJwt.token
            : typeof directJwt?.data?.token === "string"
              ? directJwt.data.token
              : "";

    if (normalizedDirectJwt) return normalizedDirectJwt;

    const sessionResult = await auth?.getSession?.();
    const session =
      sessionResult?.data?.session ??
      sessionResult?.data ??
      null;

    return (
      session?.access_token ||
      session?.accessToken ||
      session?.jwt ||
      session?.token ||
      session?.session?.access_token ||
      session?.session?.accessToken ||
      session?.session?.jwt ||
      session?.session?.token ||
      ""
    );
  } catch {
    return "";
  }
}

async function getAuthorizationHeaders() {
  const token = await resolveR2BearerToken(backendClient?.auth);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getPublicUrl(objectKey: string, baseOverride?: string) {
  const base = (baseOverride || import.meta.env.VITE_R2_PUBLIC_BASE_URL || "").toString();
  if (!base) return "";
  return `${base.replace(/\/+$/, "")}/${objectKey.replace(/^\/+/, "")}`;
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
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await getAuthorizationHeaders()),
    },
    body: JSON.stringify({
      bucket: input.bucket,
      objectKey: input.objectKey,
      expiresIn: input.expiresIn,
    }),
  });

  return response;
}

function isLocalBrowserRuntime() {
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1"].includes(window.location.hostname.toLowerCase());
}

async function requestSignedUrlWithLocalReadFallback(
  path: string,
  input: { bucket: string; objectKey: string; expiresIn?: number },
) {
  const primaryUrl = buildReadApiUrl(path);
  const officialUrl = `${officialReadApiBase}${path.startsWith("/") ? path : `/${path}`}`;

  try {
    const response = await requestSignedUrl(primaryUrl, input);

    if (isLocalBrowser && !response.ok) {
      const payload = await response.clone().json().catch(() => ({})) as {
        error?: string;
        code?: string;
      };
      const diagnostic = `${payload.code || ""} ${payload.error || ""}`;
      const localInfrastructureFailure =
        /R2_CONFIG_MISSING|Variáveis R2 ausentes|Endpoint R2 não configurado|R2_READ_PROXY_ERROR|proxy local|credenciais.*R2/i.test(
          diagnostic,
        );

      if (localInfrastructureFailure) {
        return requestSignedUrl(officialUrl, input);
      }
    }

    return response;
  } catch (error) {
    if (!isLocalBrowser) throw error;

    const message = error instanceof Error ? error.message : String(error || "");
    const localInfrastructureFailure =
      /R2_CONFIG_MISSING|Variáveis R2 ausentes|Endpoint R2 não configurado|R2_READ_PROXY_ERROR|Falha ao alcançar o proxy local/i.test(
        message,
      );
    if (!localInfrastructureFailure) throw error;

    return requestSignedUrl(officialUrl, input);
  }
}

export async function getSignedUrlForObject(input: {
  bucket: string;
  objectKey: string;
  expiresIn?: number;
}) {
  const allowPublicFallback =
    String(import.meta.env.VITE_R2_PUBLIC_FALLBACK || "").toLowerCase() === "true";
  const primaryUrl = buildReadApiUrl("/api/r2-sign-get");
  const expiresIn = typeof input.expiresIn === "number" && Number.isFinite(input.expiresIn)
    ? input.expiresIn
    : 21600;
  let response = await requestSignedUrlWithLocalReadFallback(primaryUrl, { ...input, expiresIn });

  if (response.status === 404 && apiBase) {
    // fallback local quando VITE_R2_API_BASE aponta para outro host sem a rota
    response = await requestSignedUrlWithLocalReadFallback("/api/r2-sign-get", input);
  }

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
  const primaryUrl = buildReadApiUrl("/api/r2-sign-get");
  const expiresIn = typeof input.expiresIn === "number" && Number.isFinite(input.expiresIn)
    ? input.expiresIn
    : 21600;
  let response: Response;

  try {
    response = await requestSignedUrlWithLocalReadFallback(primaryUrl, { ...input, expiresIn });
  } catch (error) {
    throw new Error(
      isLocalBrowserRuntime()
        ? "Falha ao alcançar o proxy local de leitura do armazenamento. Reinicie o Vite e tente novamente."
        : error instanceof Error
          ? error.message
          : "Falha ao gerar URL assinada.",
    );
  }

  if (response.status === 404 && apiBase && !isLocalBrowserRuntime()) {
    response = await requestSignedUrl("/api/r2-sign-get", input);
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const upstreamMessage =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error?: unknown }).error || "")
        : "";
    const message =
      upstreamMessage ||
      (response.status === 401 || response.status === 403
        ? "Sua sessão não autorizou a leitura segura deste documento. Entre novamente na conta e tente abrir o arquivo."
        : `Falha ao gerar URL assinada (HTTP ${response.status}).`);
    throw new Error(message);
  }

  const payload = (await response.json().catch(() => ({}))) as {
    signedUrl?: string;
  };

  if (!payload.signedUrl) {
    throw new Error("A API oficial não retornou a URL segura do documento.");
  }

  return payload.signedUrl;
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
      bucket: input.bucket,
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
        bucket: input.bucket,
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
  const response = await fetch(buildReadApiUrl("/api/r2-list-user-files"), {
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
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload?.error || "Falha ao remover o arquivo.";
    throw new Error(message);
  }

  return response.json() as Promise<{ ok: boolean; bucket: string; objectKey: string }>;
}
