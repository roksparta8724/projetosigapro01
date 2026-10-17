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


function renderedMunicipalityLogoElements() {
  if (typeof document === "undefined") return [] as HTMLImageElement[];
  return Array.from(
    document.querySelectorAll<HTMLImageElement>(
      '[data-logo-context="municipality"][data-logo-variant="header"] img, [data-logo-context="municipality"] img',
    ),
  ).filter((img) => img.complete && img.naturalWidth > 0 && img.naturalHeight > 0);
}

function imageElementToDataUrl(img: HTMLImageElement) {
  try {
    const width = Math.min(1600, Math.max(1, img.naturalWidth || img.width));
    const ratio = width / Math.max(1, img.naturalWidth || img.width);
    const height = Math.max(
      1,
      Math.round((img.naturalHeight || img.height || 1) * ratio),
    );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return "";
    context.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  } catch {
    // Imagens de outra origem podem contaminar o canvas. Nessa situação,
    // seguimos para o próximo candidato e nunca usamos uma imagem quebrada.
    return "";
  }
}

async function prepareStrictGuideImageSource(
  value: string | null | undefined,
  timeoutMs = 7000,
) {
  const absolute = toAbsoluteUrl(String(value || ""));
  if (!absolute) return "";
  if (absolute.startsWith("data:")) return absolute;

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

    if (!response.ok) return "";

    const contentType = String(response.headers.get("content-type") || "");
    if (contentType && !contentType.startsWith("image/")) return "";

    const blob = await response.blob();
    if (!blob.size || blob.size > 10 * 1024 * 1024) return "";

    return (await blobToDataUrl(blob)) || "";
  } catch {
    return "";
  } finally {
    if (timeout !== undefined && typeof window !== "undefined") {
      window.clearTimeout(timeout);
    }
  }
}

export async function prepareGuideInstitutionalLogo(
  ...values: Array<string | null | undefined>
) {
  const uniqueCandidates = Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean)),
  );

  for (const candidate of uniqueCandidates) {
    const prepared = await prepareStrictGuideImageSource(candidate);
    if (prepared) return prepared;
  }

  for (const image of renderedMunicipalityLogoElements()) {
    const embedded = imageElementToDataUrl(image);
    if (embedded) return embedded;

    const prepared = await prepareStrictGuideImageSource(
      image.currentSrc || image.src,
    );
    if (prepared) return prepared;
  }

  return "";
}
