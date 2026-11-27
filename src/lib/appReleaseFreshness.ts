/** Compare only the public, fingerprinted Vite boot assets. No user data is cached. */
export function readAppReleaseSignature(doc: Document, origin: string): string {
  if (!doc.querySelector('meta[name="sigapro-static-app-document"]') || !doc.getElementById("root")) return "";
  const assets = Array.from(doc.querySelectorAll('script[type="module"][src],link[rel="stylesheet"][href]'))
    .flatMap(node => {
      try {
        const url = new URL(node.getAttribute("src") || node.getAttribute("href") || "", origin);
        return url.origin === origin && /^\/assets\/[^/]+\.(?:m?js|css)$/.test(url.pathname) ? [url.pathname] : [];
      } catch { return []; }
    });
  if (!assets.some(path => /\.m?js$/.test(path))) return "";
  return [...new Set(assets)].sort().join("|");
}
export async function hasNewPublishedAppRelease(
  currentDocument: Document,
  origin: string,
  request: typeof fetch = fetch,
): Promise<boolean> {
  const current = readAppReleaseSignature(currentDocument, origin);
  if (!current) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await request(new URL("/index.html", origin).href, {
      cache: "no-store", credentials: "same-origin", signal: controller.signal,
    });
    if (!response.ok || response.redirected || !response.headers.get("content-type")?.includes("text/html")) return false;
    const published = readAppReleaseSignature(new DOMParser().parseFromString(await response.text(), "text/html"), origin);
    return Boolean(published && published !== current);
  } catch { return false; }
  finally { clearTimeout(timer); }
}
