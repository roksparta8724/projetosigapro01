import { privateAvatarObjectKey } from "@/lib/privateAvatarRead";
import { DEFAULT_AVATAR_EDITOR_DIAMETER, resolveCircularAvatarGeometry } from "@/lib/avatarCropGeometry";

/**
 * A tiny visual continuity frame for an authenticated user's own avatar on
 * a *same-tab* F5. The full private R2 raster, Bearer token and blob URL are
 * NEVER saved. The short-lived WebP thumbnail lives in sessionStorage only,
 * is scoped by account + exact immutable avatar object key, and is purged
 * at logout, account switch or explicit photo removal.
 *
 * Not an authorization mechanism: the real image is always revalidated via
 * the protected avatar endpoint. Do not use this for process documents.
 */
const PREFIX = "sigapro.tab-avatar.v1:";
const SESSION_MARKER = "sigapro_browser_session_v1=";
const MAX_AGE_MS = 30 * 60 * 1000;
const MAX_DATA_URL_LENGTH = 48_000;
const THUMB_SIZE = 72;
const diameters = { sm: 32, md: 40, lg: 56, xl: 80 } as const;
type AvatarSize = keyof typeof diameters;
type Crop = { scale: number; offsetX: number; offsetY: number; editorSize?: number };

function validOwner(ownerId: string): string {
  const owner = String(ownerId || "").trim();
  return owner && owner !== "unknown" ? owner : "";
}

function sessionIsLive(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split(";").some((part) => part.trim().startsWith(SESSION_MARKER));
}

function storageKey(owner: string): string {
  return PREFIX + owner;
}

export function readAvatarSessionThumbnail(ownerId: string, source: string): string {
  if (typeof window === "undefined" || !sessionIsLive()) return "";
  const owner = validOwner(ownerId);
  const objectKey = privateAvatarObjectKey(source);
  if (!owner || !objectKey) return "";
  try {
    const data = window.sessionStorage.getItem(storageKey(owner));
    if (!data) return "";
    const cached = JSON.parse(data) as {
      owner?: string; source?: string; thumbnail?: string; time?: number;
    };
    if (
      cached.owner !== owner ||
      cached.source !== source ||
      !Number.isFinite(cached.time) ||
      Date.now() - Number(cached.time) < 0 ||
      Date.now() - Number(cached.time) > MAX_AGE_MS ||
      !/^data:image\/(?:webp|jpeg);base64,[a-z0-9+/=]+$/i.test(cached.thumbnail || "") ||
      String(cached.thumbnail).length > MAX_DATA_URL_LENGTH
    ) {
      window.sessionStorage.removeItem(storageKey(owner));
      return "";
    }
    return cached.thumbnail || "";
  } catch {
    return "";
  }
}

export function clearAvatarSessionThumbnailForOwner(ownerId: string): void {
  if (typeof window === "undefined") return;
  const owner = validOwner(ownerId);
  if (!owner) return;
  try { window.sessionStorage.removeItem(storageKey(owner)); } catch { /* optional cache */ }
}

export function clearAvatarSessionThumbnails(): void {
  if (typeof window === "undefined") return;
  try {
    const storage = window.sessionStorage;
    for (let i = storage.length - 1; i >= 0; i -= 1) {
      const key = storage.key(i);
      if (key?.startsWith(PREFIX)) storage.removeItem(key);
    }
  } catch { /* optional cache */ }
}

export function rememberAvatarSessionThumbnail(
  ownerId: string,
  source: string,
  image: HTMLImageElement,
  crop?: Crop,
  size: AvatarSize = "md",
): void {
  if (typeof window === "undefined" || !sessionIsLive()) return;
  const owner = validOwner(ownerId);
  if (!owner || !privateAvatarObjectKey(source)) return;
  if (!image.currentSrc.startsWith("blob:") || image.naturalWidth < 1 || image.naturalHeight < 1) return;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = THUMB_SIZE;
    canvas.height = THUMB_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = image.naturalWidth, h = image.naturalHeight;
    let drawW: number, drawH: number, drawX: number, drawY: number;
    if (crop) {
      const diameter = diameters[size];
      const geometry = resolveCircularAvatarGeometry({
        naturalWidth: w, naturalHeight: h, diameter,
        scale: crop.scale, offsetX: crop.offsetX, offsetY: crop.offsetY,
        editorSize: crop.editorSize ?? DEFAULT_AVATAR_EDITOR_DIAMETER,
      });
      const factor = THUMB_SIZE / diameter;
      drawW = geometry.width * factor;
      drawH = geometry.height * factor;
      drawX = (diameter / 2 - geometry.width / 2 + geometry.offsetX) * factor;
      drawY = (diameter / 2 - geometry.height / 2 + geometry.offsetY) * factor;
    } else {
      const factor = Math.max(THUMB_SIZE / w, THUMB_SIZE / h);
      drawW = w * factor;
      drawH = h * factor;
      drawX = (THUMB_SIZE - drawW) / 2;
      drawY = (THUMB_SIZE - drawH) / 2;
    }
    ctx.drawImage(image, drawX, drawY, drawW, drawH);
    const thumbnail = canvas.toDataURL("image/webp", 0.76);
    if (!/^data:image\/webp;base64,[a-z0-9+/=]+$/i.test(thumbnail) || thumbnail.length > MAX_DATA_URL_LENGTH) return;
    window.sessionStorage.setItem(storageKey(owner), JSON.stringify({
      owner, source, thumbnail, time: Date.now(),
    }));
  } catch {
    // Canvas can refuse legacy cross-origin media; never fall back to saving
    // the complete image or to a public URL.
  }
}
