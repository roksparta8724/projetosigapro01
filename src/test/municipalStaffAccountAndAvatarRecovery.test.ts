import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("municipal staff account and avatar recovery regressions", () => {
  const admin = read("src/pages/saas/TenantAdminPage.tsx");
  const dataHook = read("src/hooks/usePlatformData.tsx");
  const backend = read("src/integrations/backend/platformImpl.ts");
  const avatar = read("src/components/platform/UserAvatar.tsx");
  const r2Client = read("src/integrations/r2/client.ts");
  const avatarStorage = read("src/integrations/r2/storage.ts");
  const profilePage = read("src/pages/saas/PerfilPage.tsx");
  const r2Router = read("api/r2.ts");
  const legacyAvatar = read("server/api/profile-avatar-open.ts");
  const appBootstrap = read("src/hooks/useAppBootstrap.tsx");
  const vite = read("vite.config.ts");
  const migration = read("neon/migrations/20261017_municipal_admin_create_staff_accounts.sql");

  it("creates internal municipal server accounts instead of requiring a pre-existing profile", () => {
    expect(admin).toContain("Criar conta de servidor");
    expect(admin).toContain("Senha provisória");
    expect(admin).toContain("Departamento / unidade");
    expect(admin).toContain("temporaryPassword");
    expect(admin).toContain("Salvo com sucesso.");
    expect(admin).toContain('aria-live="polite"');
    expect(dataHook).toContain("temporaryPassword: input.temporaryPassword");
    expect(backend).toContain('db.rpc("link_municipal_user_by_email"');
    expect(backend).toContain('credentials: "omit"');
    expect(backend).toContain("/sign-up/email");
  });

  it("keeps the administrator inside the own municipality and protects master accounts", () => {
    expect(admin).toContain('user.role !== "master_admin"');
    expect(admin).toContain('user.role !== "master_ops"');
    expect(migration).toContain("_actor_municipality_id is distinct from _municipality_id");
    expect(migration).toContain("Papeis Master nao podem ser criados");
    expect(migration).toContain("A conta pertence a outra Prefeitura");
    expect(migration).toContain("Este cadastro e exclusivo para servidores internos");
  });

  it("shows the saved photo with crop and the user's initials until a photo exists", () => {
    expect(admin).toContain("profile.avatarScale ?? 1");
    expect(admin).toContain("profile.avatarOffsetX ?? 0");
    expect(admin).toContain("profile.avatarOffsetY ?? 0");
    expect(avatar).toContain("sig-user-avatar-fallback");
    expect(avatar).toContain("function userInitials");
    expect(avatar).toContain("{initials}");
    expect(avatar).not.toContain("sig-user-avatar-icon");
  });

  it("does not duplicate Director between profile and cargo labels", () => {
    expect(admin).toContain("sameMunicipalLabel");
    expect(admin).toContain("roleSuggestedTitles[role]");
    const permit = read("src/lib/constructionPermit.ts");
    expect(permit).toContain("resolveAuthorityRoleLabel");
    expect(permit).toContain('resolveAuthorityRoleLabel(user, "Diretor")');
  });

  it("exposes official coat-of-arms management directly from Prefeitura administration", () => {
    expect(admin).toContain('title="Brasão oficial"');
    expect(admin).toContain("coatOfArmsPreviewUrl");
    expect(admin).toContain("Alterar ou salvar brasão");
    expect(admin).toContain('navigate("/configuracoes?secao=branding")');
  });

  it("tries every valid R2 endpoint when reading a profile photo", () => {
    expect(legacyAvatar).toContain("function resolveR2Clients()");
    expect(legacyAvatar).toContain("streamAvatarFromAnyClient");
    expect(legacyAvatar).toContain("for (const client of clients)");
    expect(legacyAvatar).not.toContain("function resolveR2Client()");
  });

  it("keeps login critical path compact on Neon", () => {
    expect(appBootstrap).toContain('backendClient.rpc("get_current_profile_context")');
    expect(appBootstrap).toContain("const retryDelays = [0, 80, 180, 350]");
    expect(appBootstrap).toContain("void markCurrentProfileAccess()");
    expect(appBootstrap).toContain("void loadMunicipalityBundleById(municipalityId)");
    expect(appBootstrap).not.toContain("const currentSession = (await backendClient.auth.getSession()).data.session");
  });

  it("serves current R2 profile photos through the same-origin avatar route", () => {
    expect(backend).toContain('/api/profile-avatar-open?objectKey=');
    expect(backend).not.toContain("getSignedUrlForObjectStrict({ bucket, objectKey })");
    expect(legacyAvatar).toContain('request.kind === "r2"');
    expect(legacyAvatar).toContain("profiles\\/avatars");
    expect(legacyAvatar).toContain("Foto de perfil não encontrada.");
  });

  it("keeps production avatar recovery on the same origin and falls back both ways", () => {
    expect(r2Client).toContain("return raw;");
    expect(r2Client).toContain("UserAvatar mantém /api/profile-avatar-open como fallback");
    expect(avatar).toContain("return `/api/profile-avatar-open?source=${encodeURIComponent(current.toString())}`;");
    expect(r2Client).not.toContain("return isLocalBrowser ? route : buildApiUrl(route)");
    expect(avatar).toContain("alternateLegacyAvatarUrl");
    expect(avatar).toContain("recoveryImageUrl");
    expect(avatar).toContain('current.pathname === "/api/profile-avatar-open"');
    expect(avatar).toContain('current.pathname.startsWith("/storage/v1/object/public/avatars/")');
  });


  it("opens stored R2 profile photos through the same handler on localhost and production", () => {
    expect(vite).toContain('import handleProfileAvatarOpen from "./server/api/profile-avatar-open"');
    expect(vite).toContain('req.url.startsWith("/api/profile-avatar-open")');
    expect(vite).toContain("await handleProfileAvatarOpen(req, res)");
    expect(legacyAvatar).toContain('request.kind === "r2"');
    expect(legacyAvatar).toContain("request.objectKey");
    expect(legacyAvatar).toContain('readEnv("R2_BUCKET_LOGOS")');
    expect(legacyAvatar).toContain("const MAX_AVATAR_BYTES = 12 * 1024 * 1024");
    expect(backend).toContain('/api/profile-avatar-open?objectKey=');
  });

  it("persists permanent R2 avatar keys and confirms their image response before success", () => {
    expect(avatarStorage).toContain('input.bucket === "profile-assets" ? `r2:${uploaded.objectKey}`');
    expect(profilePage).toContain("confirmSavedAvatarReadable(savedAvatarUrl)");
    expect(profilePage).toContain("image.onload = () => complete(image.naturalWidth > 0");
    expect(profilePage).toContain("image.onerror = () => complete(false)");
    expect(profilePage).toContain("avatarReadConfirmed");
    expect(profilePage).toContain("não confirmou sua leitura após o upload");
    expect(avatar).toContain("recoveryImageUrl");
  });

  it("recovers old Supabase avatars and caches them in the current R2 storage", () => {
    expect(backend).toContain("getLegacyProfileAvatarOpenUrl");
    expect(r2Client).toContain("getLegacyProfileAvatarOpenUrl");
    expect(avatar).toContain("/api/profile-avatar-open?source=");
    expect(r2Router).toContain('action === "profile-avatar-open"');
    expect(legacyAvatar).toContain("legacy-profile-avatars/");
    expect(legacyAvatar).toContain("PutObjectCommand");
    expect(legacyAvatar).toContain("/storage/v1/object/public/avatars/");
    expect(vite).toContain("/api/profile-avatar-open");
    expect(vite).toContain("resolveRequestedR2Bucket");
  });
});
