type ReqLike = import("http").IncomingMessage & {
  headers: import("http").IncomingHttpHeaders;
};

function readEnv(key: string) {
  const raw = process.env[key];
  if (!raw) return "";
  return String(raw).replace(/^['"]|['"]$/g, "").trim();
}

export function isR2AuthRequired() {
  return readEnv("R2_REQUIRE_AUTH").toLowerCase() === "true";
}

function readBearer(req: ReqLike) {
  const raw = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(raw);
  return match?.[1]?.trim() || "";
}

function resolveNeonDataApiUrl() {
  return (
    readEnv("R2_AUTH_DATA_API_URL") ||
    readEnv("VITE_NEON_DATA_API_URL")
  ).replace(/\/+$/, "");
}

export async function requireR2AuthenticatedProfile(req: ReqLike) {
  if (!isR2AuthRequired()) {
    return { ok: true as const, profileId: null as string | null };
  }

  const token = readBearer(req);
  if (!token) {
    return { ok: false as const, status: 401, error: "Autenticação necessária." };
  }

  const dataApiUrl = resolveNeonDataApiUrl();
  if (!dataApiUrl) {
    return { ok: false as const, status: 503, error: "Validação de autenticação indisponível." };
  }

  const response = await fetch(`${dataApiUrl}/rpc/current_profile_id`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: "{}",
  });

  const payload = await response.json().catch(() => null);
  const profileId =
    typeof payload === "string"
      ? payload
      : payload && typeof payload === "object"
        ? (payload.id || payload.profile_id || null)
        : null;

  if (!response.ok || !profileId) {
    return { ok: false as const, status: 401, error: "Sessão inválida ou expirada." };
  }

  return { ok: true as const, profileId: String(profileId) };
}
