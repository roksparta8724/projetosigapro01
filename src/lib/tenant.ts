export type TenantResolutionMode = "root" | "tenant";

export interface TenantResolution {
  mode: TenantResolutionMode;
  hostname: string;
  rootDomain: string;
  subdomain: string | null;
  isReserved: boolean;
  isLocalhost: boolean;
  isRootDomain: boolean;
}

const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "admin",
  "api",
  "support",
  "docs",
  "mail",
  "root",
  "status",
  "auth",
]);

const DEFAULT_ROOT_DOMAIN = "sigapromunicipal.com.br";

export function getRootDomain() {
  return (import.meta.env.VITE_ROOT_DOMAIN as string | undefined)?.toLowerCase() || DEFAULT_ROOT_DOMAIN;
}

function normalizeHostname(hostname: string) {
  return hostname.split(":")[0].trim().toLowerCase();
}

function resolveSubdomainFromHostname(hostname: string, rootDomain: string) {
  if (!hostname) return null;
  const normalized = normalizeHostname(hostname);
  if (normalized === rootDomain) return null;
  if (normalized === `www.${rootDomain}`) return null;
  if (normalized.endsWith(`.${rootDomain}`)) {
    const subdomain = normalized.slice(0, normalized.length - rootDomain.length - 1);
    return subdomain || null;
  }
  return null;
}

function resolveDevSubdomain(hostname: string) {
  const normalized = normalizeHostname(hostname);
  if (normalized === "localhost" || normalized === "127.0.0.1") return null;
  if (normalized.endsWith(".localhost")) {
    return normalized.replace(".localhost", "");
  }
  return null;
}

export function isReservedSubdomain(value: string | null | undefined) {
  if (!value) return false;
  return RESERVED_SUBDOMAINS.has(value.toLowerCase());
}

export function resolveTenantFromHostname(hostname: string, search?: string): TenantResolution {
  const rootDomain = getRootDomain();
  const normalized = normalizeHostname(hostname);
  const isLocalhost =
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized.endsWith(".localhost");
  const isRootDomain = normalized === rootDomain || normalized === `www.${rootDomain}`;

  const params = new URLSearchParams(search ?? "");
  const forcedTenant = params.get("tenant") || params.get("subdomain");
  const devSubdomain = resolveDevSubdomain(normalized);
  const inferredSubdomain =
    (forcedTenant ? forcedTenant.toLowerCase() : null) ||
    devSubdomain ||
    resolveSubdomainFromHostname(normalized, rootDomain);

  const subdomain = inferredSubdomain ? inferredSubdomain.trim().toLowerCase() : null;
  const isReserved = isReservedSubdomain(subdomain);
  const mode: TenantResolutionMode = subdomain && !isReserved ? "tenant" : "root";

  console.log("[TenantResolver] Hostname resolvido", {
    hostname: normalized,
    rootDomain,
    isLocalhost,
    isRootDomain,
    subdomain,
    mode,
    isReserved,
  });

  return {
    mode,
    hostname: normalized,
    rootDomain,
    subdomain,
    isReserved,
    isLocalhost,
    isRootDomain,
  };
}

export function resolveTenantFromLocation() {
  if (typeof window === "undefined") {
    return resolveTenantFromHostname("", "");
  }
  return resolveTenantFromHostname(window.location.hostname, window.location.search);
}

export function isRootDomainHost(hostname: string) {
  const rootDomain = getRootDomain();
  const normalized = normalizeHostname(hostname);
  return normalized === rootDomain || normalized === `www.${rootDomain}`;
}
