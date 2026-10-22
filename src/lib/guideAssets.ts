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

export function getRenderedMunicipalityLogoDataUrl() {
  const renderedImages = renderedMunicipalityLogoElements();

  for (const image of renderedImages) {
    const embedded = imageElementToDataUrl(image);
    if (embedded) return embedded;
  }

  return "";
}

/**
 * Crop only substantial empty outer margins from a guide logo.
 * Coordinates remain at the original source resolution: no resizing and no
 * stretching of a municipal coat of arms. If artwork fills its source,
 * preserve the source untouched.
 */
export function institutionalLogoVisibleBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } | null {
  if (width < 12 || height < 12 || pixels.length !== width * height * 4) return null;
  let minX = width; let maxX = -1; let minY = height; let maxY = -1;
  let occupied = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      const alpha = pixels[at + 3];
      if (alpha < 25) continue;
      const visiblyPainted = alpha < 247 ||
        pixels[at] < 247 || pixels[at + 1] < 247 || pixels[at + 2] < 247;
      if (!visiblyPainted) continue;
      occupied++;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  // Keep transparent/white-only images unchanged; avoid magnifying noise.
  if (maxX < 0 || occupied < width * height * 0.005) return null;
  const margin = Math.max(2, Math.round(Math.min(width, height) * 0.04));
  const x = Math.max(0, minX - margin);
  const y = Math.max(0, minY - margin);
  const right = Math.min(width, maxX + 1 + margin);
  const bottom = Math.min(height, maxY + 1 + margin);
  const cropped = { x, y, width: right - x, height: bottom - y };
  // Do not crop for insignificant padding, to preserve the original quality.
  if (cropped.width / width > 0.88 && cropped.height / height > 0.88) return null;
  if (cropped.width < 8 || cropped.height < 8) return null;
  return cropped;
}

async function fitInstitutionalLogoToPrintCard(source: string): Promise<string> {
  if (!source.startsWith("data:image/") || typeof document === "undefined") return source;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Não foi possível preparar o brasão."));
      image.src = source;
    });
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (width < 12 || height < 12 || width * height > 4_000_000) return source;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return source;
    ctx.drawImage(img, 0, 0);
    const bounds = institutionalLogoVisibleBounds(
      ctx.getImageData(0, 0, width, height).data, width, height,
    );
    if (!bounds) return source;
    const cropped = document.createElement("canvas");
    cropped.width = bounds.width;
    cropped.height = bounds.height;
    const output = cropped.getContext("2d");
    if (!output) return source;
    output.drawImage(img, bounds.x, bounds.y, bounds.width, bounds.height,
      0, 0, bounds.width, bounds.height);
    return cropped.toDataURL("image/png");
  } catch {
    return source; // Never break a guide because its official logo cannot be cropped.
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
    if (prepared) return fitInstitutionalLogoToPrintCard(prepared);
  }

  const renderedSnapshot = getRenderedMunicipalityLogoDataUrl();
  if (renderedSnapshot) return fitInstitutionalLogoToPrintCard(renderedSnapshot);

  const renderedImages = renderedMunicipalityLogoElements();
  for (const image of renderedImages) {
    const prepared = await prepareStrictGuideImageSource(
      image.currentSrc || image.src,
    );
    if (prepared) return fitInstitutionalLogoToPrintCard(prepared);
  }

  // Último fallback: reutiliza apenas uma URL que o navegador já comprovou
  // estar carregada (naturalWidth > 0). Assim evitamos ressuscitar URL quebrada.
  const alreadyLoaded = renderedImages
    .map((image) => image.currentSrc || image.src)
    .find(Boolean);
  return alreadyLoaded ? toAbsoluteUrl(alreadyLoaded) : "";
}
