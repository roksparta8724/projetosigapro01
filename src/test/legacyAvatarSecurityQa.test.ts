import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  legacyAvatarNetworkAllowed,
  parseAvatarRequest,
  safeAvatarMime,
} from "../../server/api/profile-avatar-open";

const legacySource = new URL("https://historic-project.supabase.co/storage/v1/object/public/avatars/user/photo.png");
const request = (source: string) => ({
  url: "/api/profile-avatar-open?source=" + encodeURIComponent(source),
}) as Parameters<typeof parseAvatarRequest>[0];

describe("SIGAPRO QA — recuperação de avatar legado sem SSRF nem imagem ativa", () => {
  it("não realiza consultas de legado sem allowlist explícita do domínio HTTPS exato", () => {
    expect(legacyAvatarNetworkAllowed(legacySource, "")).toBe(false);
    expect(legacyAvatarNetworkAllowed(legacySource, "https://historic-project.supabase.co")).toBe(true);
    expect(legacyAvatarNetworkAllowed(legacySource, "https://other.supabase.co")).toBe(false);
    expect(legacyAvatarNetworkAllowed(legacySource, "http://historic-project.supabase.co")).toBe(false);
    expect(legacyAvatarNetworkAllowed(legacySource, "https://historic-project.supabase.co:8443")).toBe(false);
    expect(legacyAvatarNetworkAllowed(legacySource, "https://historic-project.supabase.co/storage")).toBe(false);
    expect(legacyAvatarNetworkAllowed(legacySource, "not-an-origin")).toBe(false);
    expect(legacyAvatarNetworkAllowed(new URL("https://evil.supabase.co/storage/v1/object/public/avatars/a.png"),
      "https://historic-project.supabase.co")).toBe(false);
  });

  it("autoriza apenas caminho público de avatar em domínio legítimo, sem porta ou credenciais", () => {
    expect(parseAvatarRequest(request(legacySource.toString()))).toMatchObject({
      kind: "legacy",
    });
    for (const source of [
      "http://historic-project.supabase.co/storage/v1/object/public/avatars/a.png",
      "https://historic-project.supabase.co:8443/storage/v1/object/public/avatars/a.png",
      "https://localhost/storage/v1/object/public/avatars/a.png",
      "https://historic-project.supabase.co.evil.com/storage/v1/object/public/avatars/a.png",
      "https://user:pass@historic-project.supabase.co/storage/v1/object/public/avatars/a.png",
      "https://historic-project.supabase.co/storage/v1/object/public/private/a.png",
    ]) {
      expect(() => parseAvatarRequest(request(source))).toThrow();
    }
  });

  it("reconhece somente assinaturas de imagens raster seguras, não SVG ou HTML", () => {
    expect(safeAvatarMime(Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]))).toBe("image/png");
    expect(safeAvatarMime(Buffer.from([255,216,255,224,0,16,74,70,73,70,0,0]))).toBe("image/jpeg");
    expect(safeAvatarMime(Buffer.from("GIF89a000000","ascii"))).toBe("image/gif");
    expect(safeAvatarMime(Buffer.from("RIFF0000WEBP","ascii"))).toBe("image/webp");
    expect(safeAvatarMime(Buffer.from("\u0000\u0000\u0000\u0010ftypavif","latin1"))).toBe("image/avif");
    expect(safeAvatarMime(Buffer.from("<svg onload='alert(1)'>"))).toBeNull();
    expect(safeAvatarMime(Buffer.from("<html><script>alert(1)</script>"))).toBeNull();
    expect(safeAvatarMime(Buffer.alloc(0))).toBeNull();
  });

  it("busca cache R2 antes de permitir rede; impede redirects e respostas enormes", () => {
    const code = readFileSync("server/api/profile-avatar-open.ts","utf8");
    expect(code.indexOf("streamAvatarFromAnyClient(clients, bucket, cacheKey, res)"))
      .toBeLessThan(code.indexOf("if (!legacyAvatarNetworkAllowed(source"));
    expect(code).toContain('readEnv("SIGAPRO_LEGACY_AVATAR_SOURCE_ORIGIN")');
    expect(code).toContain('redirect: "error"');
    expect(code).not.toContain('redirect: "follow"');
    expect(code).toContain("totalBytes > MAX_AVATAR_BYTES");
    expect(code.lastIndexOf("clearTimeout(timeout);")).toBeGreaterThan(code.lastIndexOf("res.end(bytes);"));
    expect(code).toContain('res.setHeader("X-Content-Type-Options", "nosniff")');
    expect(code).not.toContain('console.error("[SIGAPRO][AvatarLegacy] Falha ao recuperar foto antiga."');
  });
});
