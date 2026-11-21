import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import {
  buildPrivateAvatarThumbnail, privateAvatarThumbnailKey,
  safeAvatarMime,
} from "../../server/api/profile-avatar-open";

const tenant = "49dac0b6-6352-4744-9aab-9ff91c59d970";
const profile = "2244ccaa-1111-4111-8111-123456abcdef";
const original = "municipalities/" + tenant + "/profiles/avatars/" + profile + "/uuid-portrait.png";
const read = (path: string) => readFileSync(path, "utf8");

describe("SIGAPRO — perfil rápido com miniatura privada e original preservado", () => {
  it("gera derivado privado no mesmo escopo de foto sem alterar a chave original", () => {
    const mini = privateAvatarThumbnailKey(original);
    expect(mini).toMatch(/^municipalities\/[a-f0-9-]+\/profiles\/avatars\/[a-f0-9-]+\/\.thumb-v1-[a-f0-9]{32}\.webp$/);
    expect(mini).not.toBe(original);
    expect(privateAvatarThumbnailKey(original)).toBe(mini);
    expect(privateAvatarThumbnailKey(original.replace("portrait", "another"))).not.toBe(mini);
    expect(privateAvatarThumbnailKey("platform/profiles/avatars/" + profile + "/avatar.jpg"))
      .toMatch(/^platform\/profiles\/avatars\/[a-f0-9-]+\/\.thumb-v1-/);
  });

  it("reduz a imagem de exemplo para dimensão de avatar WebP validada", async () => {
    const input = await sharp({
      create: { width: 1600, height: 1200, channels: 3, background: { r: 40, g: 120, b: 175 } },
    }).png().toBuffer();
    const mini = await buildPrivateAvatarThumbnail(input);
    expect(mini).not.toBeNull();
    expect(safeAvatarMime(mini!)).toBe("image/webp");
    const metadata = await sharp(mini!).metadata();
    expect(metadata.width).toBeLessThanOrEqual(384);
    expect(metadata.height).toBeLessThanOrEqual(384);
    expect(mini!.length).toBeLessThan(input.length);
  });

  it("falha fechado para imagem inválida, sem gerar dado privado", async () => {
    expect(await buildPrivateAvatarThumbnail(Buffer.from("not-an-image"))).toBeNull();
  });

  it("o avatar usa versão compacta, mas o editor continua solicitando original", () => {
    const component = read("src/components/platform/UserAvatar.tsx");
    const hook = read("src/hooks/useAuthorizedAvatarUrl.ts");
    const browser = read("src/lib/privateAvatarRead.ts");
    const cache = read("src/lib/authorizedAvatarRuntimeCache.ts");
    const profile = read("src/pages/saas/PerfilPage.tsx");
    expect(component).toContain('useAuthorizedAvatarUrl(props.imageUrl, props.authenticatedOwnerId, "thumbnail")');
    expect(hook).toContain('variant: "original" | "thumbnail" = "original"');
    expect(browser).toContain('requestedVariant === "thumbnail" ? "&variant=thumb" : ""');
    expect(browser).toContain('response = await getPrivateImage("original")');
    expect(cache).toContain("JSON.stringify([owner, source, variant])");
    expect(profile).toContain("useAuthorizedAvatarUrl(avatarPreviewSourceUrl, authenticatedUserId || authenticatedProfileId)");
    expect(browser).toContain('Authorization: "Bearer " + token');
  });

  it("a proteção original por sessão e município antecede qualquer cache derivado", () => {
    const server = read("server/api/profile-avatar-open.ts");
    const grant = server.indexOf("authorizePrivateAvatarRead(req, request.objectKey)");
    const variant = server.indexOf('variant === "thumb"');
    expect(grant).toBeGreaterThan(0);
    expect(variant).toBeGreaterThan(grant);
    expect(server).toContain("streamAvatarFromAnyClient(clients, bucket, thumbnailKey, res)");
    expect(server).toContain('CacheControl: "private, no-store"');
    expect(server).toContain("respondWithAvatar(res, original.bytes, original.mime)");
    expect(server).toContain("for (const client of clients) client.destroy()");
    expect(read("server/api/r2-sign-get.ts")).toContain("isAvatarStoragePath(key)");
  });

  it("login espera autorização, não o bundle grande da próxima tela", () => {
    const login = read("src/pages/saas/AcessoPage.tsx");
    expect(login).toContain("const decision = await verifyLoginLandingAccess(");
    expect(login).not.toContain("preloadLoginLanding(landingPath)");
    expect(login).toContain("navigate(decision.path, { replace: true })");
  });
});
