const DEFAULT_PUBLIC_ROOT = "sigapromunicipal.com.br";

function stripHostname(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return parsed.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return raw
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      .split(":")[0]
      .replace(/\.$/, "");
  }
}

export function isLoopbackHostname(value: string | null | undefined) {
  const hostname = stripHostname(value);
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

export function getPublicRootDomain() {
  const configured =
    (import.meta.env.VITE_PUBLIC_ROOT_DOMAIN as string | undefined)?.trim() ||
    (import.meta.env.VITE_ROOT_DOMAIN as string | undefined)?.trim() ||
    "";
  const normalized = stripHostname(configured);

  // URL pública nunca deve herdar localhost de um .env de desenvolvimento.
  if (!normalized || isLoopbackHostname(normalized)) return DEFAULT_PUBLIC_ROOT;
  return normalized;
}

export function normalizeHostname(value: string | null | undefined) {
  return stripHostname(value);
}

export function buildMunicipalityPortalUrl(params: {
  subdomain?: string | null;
  customDomain?: string | null;
}) {
  const custom = normalizeHostname(params.customDomain);
  if (custom && !isLoopbackHostname(custom)) {
    return `https://${custom}`;
  }

  const subdomain = normalizeHostname(params.subdomain);
  if (!subdomain || isLoopbackHostname(subdomain)) return "";

  const root = getPublicRootDomain();
  return `https://${subdomain}.${root}`;
}
