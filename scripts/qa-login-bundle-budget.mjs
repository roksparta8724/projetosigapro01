import { readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

export const MAX_LOGIN_ENTRY_GZIP_BYTES = 750 * 1024;

/**
 * Enforce a measured, artifact-based entry size budget. This is not a
 * simulated login latency: it catches accidental eager imports of heavy
 * internal dashboards, drawings and finance pages on the public /acesso.
 */
export function inspectLoginEntryBundle(
  distDir = "dist",
  limitBytes = MAX_LOGIN_ENTRY_GZIP_BYTES,
) {
  const dist = resolve(distDir);
  const html = readFileSync(join(dist, "index.html"), "utf8");
  const scripts = Array.from(html.matchAll(/<script\b[^>]*>/gi), match => match[0]);
  const entry = scripts.map(tag => {
    const type = /\btype=["']([^"']+)["']/i.exec(tag)?.[1];
    const src = /\bsrc=["']([^"']+)["']/i.exec(tag)?.[1];
    return type === "module" ? src : null;
  }).filter(Boolean);
  if (entry.length !== 1) {
    throw new Error("SIGAPRO_LOGIN_ENTRY_MISSING: o index precisa declarar um único script module.");
  }

  const path = entry[0];
  if (!/^\/assets\/[a-zA-Z0-9_.-]+\.js$/.test(path)) {
    throw new Error("SIGAPRO_LOGIN_ENTRY_INVALID: script fora de /assets/ ou chave inválida.");
  }
  const asset = resolve(dist, path.slice(1));
  if (!asset.startsWith(dist + sep)) throw new Error("SIGAPRO_LOGIN_ENTRY_OUT_OF_DIST");

  const content = readFileSync(asset);
  const gzipBytes = gzipSync(content, { level: 9 }).byteLength;
  if (gzipBytes > limitBytes) {
    throw new Error(
      "SIGAPRO_LOGIN_BUNDLE_OVER_BUDGET: " +
      Math.ceil(gzipBytes / 1024) + " KiB gzip excede " +
      Math.ceil(limitBytes / 1024) + " KiB. Revise imports eager em src/App.tsx.",
    );
  }
  return { entry: path, rawBytes: content.byteLength, gzipBytes, limitBytes };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = inspectLoginEntryBundle();
  console.log("SIGAPRO_LOGIN_ENTRY_BUDGET_OK " + JSON.stringify({
    entry: result.entry,
    gzipKiB: Math.round(result.gzipBytes / 1024),
    rawKiB: Math.round(result.rawBytes / 1024),
    limitKiB: Math.round(result.limitBytes / 1024),
  }));
}
