function getBaseUrl() {
  const baseUrl = import.meta.env.BASE_URL || "/";
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

export function getPublicAssetUrl(path: string) {
  const trimmed = path.trim();
  if (!trimmed) return "";

  const baseUrl = getBaseUrl();
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    return trimmed;
  }

  if (trimmed.startsWith(baseUrl)) {
    return trimmed;
  }

  if (baseUrl !== "/" && trimmed.startsWith(`/${baseUrl.replace(/^\/+/, "")}`)) {
    return trimmed;
  }

  if (trimmed.startsWith("/")) {
    if (baseUrl === "/") return trimmed;
    return `${baseUrl}${trimmed.replace(/^\/+/, "")}`;
  }

  return `${baseUrl}${trimmed.replace(/^\.?\/+/, "")}`;
}

export function isRenderableAssetUrl(value?: string | null) {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  return (
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../")
  );
}

export function resolveAssetUrl(value?: string | null) {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    return trimmed;
  }

  if (trimmed.startsWith("//")) {
    if (typeof window !== "undefined") {
      return `${window.location.protocol}${trimmed}`;
    }
    return `https:${trimmed}`;
  }

  if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
    if (typeof window !== "undefined") {
      return new URL(trimmed, `${window.location.origin}${getBaseUrl()}`).toString();
    }
    return getPublicAssetUrl(trimmed);
  }

  return "";
}
