export type CachedProfileAvatar = {
  userId: string;
  email: string;
  fullName: string;
  avatarUrl: string;
  avatarStorageRef: string;
  avatarScale: number;
  avatarOffsetX: number;
  avatarOffsetY: number;
  useAvatarInHeader: boolean;
  cachedAt: number;
};

const PREFIX = "sigapro.profile-avatar.v2:";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

function normalizeEmail(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function safeIdentity(value: string | null | undefined) {
  const normalized = String(value || "").trim();
  return normalized && normalized !== "unknown" ? normalized : "";
}

function keyForUser(userId: string) {
  return `${PREFIX}${userId}`;
}

export function readCachedProfileAvatar(
  userId: string | null | undefined,
  email?: string | null,
): CachedProfileAvatar | null {
  if (typeof window === "undefined") return null;
  const id = safeIdentity(userId);
  if (!id) return null;

  try {
    const raw = window.localStorage.getItem(keyForUser(id));
    if (!raw) return null;

    const cached = JSON.parse(raw) as Partial<CachedProfileAvatar>;
    if (
      cached.userId !== id ||
      !cached.avatarUrl ||
      typeof cached.cachedAt !== "number" ||
      Date.now() - cached.cachedAt > (/[?&]X-Amz-Signature=/i.test(cached.avatarUrl) ? 30 * 60 * 1000 : MAX_AGE_MS)
    ) {
      window.localStorage.removeItem(keyForUser(id));
      return null;
    }

    const requestedEmail = normalizeEmail(email);
    const cachedEmail = normalizeEmail(cached.email);
    if (requestedEmail && cachedEmail && requestedEmail !== cachedEmail) {
      return null;
    }

    return {
      userId: id,
      email: cachedEmail,
      fullName: String(cached.fullName || ""),
      avatarUrl: String(cached.avatarUrl || ""),
      avatarStorageRef: String(cached.avatarStorageRef || ""),
      avatarScale: Number(cached.avatarScale ?? 1),
      avatarOffsetX: Number(cached.avatarOffsetX ?? 0),
      avatarOffsetY: Number(cached.avatarOffsetY ?? 0),
      useAvatarInHeader: Boolean(cached.useAvatarInHeader ?? false),
      cachedAt: cached.cachedAt,
    };
  } catch {
    return null;
  }
}

export function writeCachedProfileAvatar(profile: {
  userId: string;
  email?: string | null;
  fullName?: string | null;
  avatarUrl?: string | null;
  avatarStorageRef?: string | null;
  avatarScale?: number | null;
  avatarOffsetX?: number | null;
  avatarOffsetY?: number | null;
  useAvatarInHeader?: boolean | null;
}) {
  if (typeof window === "undefined") return;
  const id = safeIdentity(profile.userId);
  if (!id) return;

  const avatarUrl = String(profile.avatarUrl || "").trim();
  if (!avatarUrl) {
    window.localStorage.removeItem(keyForUser(id));
    return;
  }

  const payload: CachedProfileAvatar = {
    userId: id,
    email: normalizeEmail(profile.email),
    fullName: String(profile.fullName || "").trim(),
    avatarUrl,
    avatarStorageRef: String(profile.avatarStorageRef || "").trim(),
    avatarScale: Number(profile.avatarScale ?? 1),
    avatarOffsetX: Number(profile.avatarOffsetX ?? 0),
    avatarOffsetY: Number(profile.avatarOffsetY ?? 0),
    useAvatarInHeader: Boolean(profile.useAvatarInHeader ?? false),
    cachedAt: Date.now(),
  };

  try {
    window.localStorage.setItem(keyForUser(id), JSON.stringify(payload));
  } catch {
    // Cache visual é opcional e nunca pode impedir a aplicação.
  }
}

export function removeCachedProfileAvatar(userId: string | null | undefined) {
  if (typeof window === "undefined") return;
  const id = safeIdentity(userId);
  if (!id) return;
  try {
    window.localStorage.removeItem(keyForUser(id));
  } catch {
    // noop
  }
}
