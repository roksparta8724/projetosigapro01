const DEFAULT_PUBLIC_ROOT = "sigapromunicipal.com.br";

export function getPublicRootDomain() {
  const root =
    (import.meta.env.VITE_PUBLIC_ROOT_DOMAIN as string | undefined)?.trim() ||
    "";
  const normalized = root.toLowerCase();
  return normalized || DEFAULT_PUBLIC_ROOT;
}

export function normalizeHostname(value: string | null | undefined) {
  return (value || "").trim().toLowerCase().replace(/^https?:\/\//, "");
}

export function buildMunicipalityPortalUrl(params: {
  subdomain?: string | null;
  customDomain?: string | null;
}) {
  const custom = normalizeHostname(params.customDomain);
  if (custom) {
    const url = `https://${custom}`;
    console.log("[PortalUrl] Usando custom_domain", { custom, url });
    return url;
  }
  const subdomain = normalizeHostname(params.subdomain);
  if (!subdomain) return "";
  const root = getPublicRootDomain();
  const url = `https://${subdomain}.${root}`;
  console.log("[PublicDomain] Portal por subdominio", { subdomain, root, url });
  return url;
}
