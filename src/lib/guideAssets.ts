function toAbsoluteUrl(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    if (raw.startsWith("data:") || raw.startsWith("blob:")) return raw;
    const base =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "https://sigapromunicipal.com.br";
    return new URL(raw, base).toString();
  } catch {
    return raw;
  }
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler imagem."));
    reader.readAsDataURL(blob);
  });
}

export async function prepareGuideImageSource(
  value: string | null | undefined,
  timeoutMs = 7000,
) {
  const absolute = toAbsoluteUrl(String(value || ""));
  if (!absolute || absolute.startsWith("data:")) return absolute;

  const controller = new AbortController();
  const timeout =
    typeof window !== "undefined"
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : undefined;

  try {
    const url = new URL(absolute);
    const sameOrigin =
      typeof window !== "undefined" &&
      url.origin === window.location.origin;

    const response = await fetch(absolute, {
      method: "GET",
      cache: "no-store",
      credentials: sameOrigin ? "same-origin" : "omit",
      signal: controller.signal,
    });

    if (!response.ok) return absolute;

    const contentType = String(response.headers.get("content-type") || "");
    if (contentType && !contentType.startsWith("image/")) return absolute;

    const blob = await response.blob();
    if (!blob.size || blob.size > 10 * 1024 * 1024) return absolute;

    const dataUrl = await blobToDataUrl(blob);
    return dataUrl || absolute;
  } catch {
    // O endereço original ainda pode ser carregado diretamente pelo <img>.
    return absolute;
  } finally {
    if (timeout !== undefined && typeof window !== "undefined") {
      window.clearTimeout(timeout);
    }
  }
}
