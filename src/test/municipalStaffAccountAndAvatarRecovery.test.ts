import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("municipal staff account and avatar recovery regressions", () => {
  const admin = read("src/pages/saas/TenantAdminPage.tsx");
  const dataHook = read("src/hooks/usePlatformData.tsx");
  const backend = read("src/integrations/backend/platformImpl.ts");
  const avatar = read("src/components/platform/UserAvatar.tsx");
  const profilePage = read("src/pages/saas/PerfilPage.tsx");
  const r2Client = read("src/integrations/r2/client.ts");
  const r2Storage = read("src/integrations/r2/storage.ts");
  const r2Router = read("api/r2.ts");
  const legacyAvatar = read("server/api/profile-avatar-open.ts");
  const appBootstrap = read("src/hooks/useAppBootstrap.tsx");
  const avatarCache = read("src/lib/profileAvatarCache.ts");
  const portalFrame = read("src/components/platform/PortalFrame.tsx");
  const serviceWorker = read("public/sigapro-sw.js");
  const indexHtml = read("index.html");
  const viteConfig = read("vite.config.ts");
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

  it("keeps avatar upload/removal isolated from personal and professional form saves", () => {
    expect(profilePage).toContain("const saveAvatar = options.saveAvatar === true");
    expect(profilePage).toContain("const avatarUploadFile = saveAvatar");
    expect(profilePage).toContain("if (saveAvatar) {");
    expect(profilePage).toContain("Dados pessoais salvos com sucesso no banco oficial.");
    expect(profilePage).toContain("Dados profissionais salvos com sucesso no banco oficial.");
    expect(profilePage).toContain("{ saveAvatar: true }");
  });

  it("keeps a selected avatar as preview-only until the explicit save action", () => {
    expect(profilePage).toContain("Pré-visualização pronta. A foto ainda não foi salva");
    expect(profilePage).toContain('data-avatar-save-state="pending"');
    expect(profilePage).toContain("disabled={saving || !avatarDraftDirty}");
    expect(profilePage).toContain("Salvar foto no perfil");
  });

  it("only reports avatar success after the backend confirms the stable storage reference", () => {
    expect(profilePage).toContain("expectedAvatarStorageRef");
    expect(profilePage).toContain("persistedAvatarStorageRef");
    expect(profilePage).toContain("confirmedAvatarStorageRef !== expectedAvatarStorageRef");
    expect(profilePage).toContain("Foto confirmada e gravada permanentemente no banco oficial.");
  });

  it("clears the persistent avatar reference when the user explicitly removes the photo", () => {
    expect(profilePage).toContain("const removingAvatar =");
    expect(profilePage).toContain('removingAvatar\n        ? ""');
  });

  it("persists profile avatars by stable R2 reference instead of a public URL", () => {
    expect(r2Storage).toContain('input.bucket === "profile-assets"');
    expect(r2Storage).toContain('`r2:${uploaded.objectKey}`');
    expect(r2Storage).not.toContain('persistentRef: uploaded.publicUrl || `r2:${uploaded.objectKey}`');
  });

  it("re-opens already persisted R2 public avatar URLs through the same-origin route", () => {
    expect(backend).toContain("getObjectKeyFromPublicUrl");
    expect(backend).toContain("isProfileObjectKey");
    expect(backend).toContain('/api/profile-avatar-open?objectKey=');
  });

  it("uses a non-white premium fallback with dark initials in dark mode", () => {
    expect(avatar).toContain("dark:bg-[linear-gradient(180deg,#cbd5e1_0%,#94a3b8_100%)]");
    expect(avatar).toContain("dark:!text-[#0f172a]");
  });

  it("serves persisted R2 profile avatars in localhost exactly like production", () => {
    expect(viteConfig).toContain('req.url.startsWith("/api/profile-avatar-open")');
    expect(viteConfig).toContain('requestUrl.searchParams.get("objectKey")');
    expect(viteConfig).toContain('Bucket: readEnvValue("R2_BUCKET_LOGOS")');
    expect(viteConfig).toContain('new GetObjectCommand({');
    expect(viteConfig).toContain("profiles\\/avatars");
  });

  it("keeps dark initials visible while a profile image is loading or fails", () => {
    expect(avatar).toContain("!text-[#0f172a]");
    expect(avatar).toContain("dark:!text-[#0f172a]");
    expect(avatar).toContain("bg-transparent object-cover object-center");
    expect(avatar).not.toContain("sig-user-avatar-image absolute inset-0 block h-full w-full max-w-none bg-white");
  });

  it("resolves persisted R2 avatars through the same logical bucket used by upload", () => {
    expect(backend).toContain("getSignedUrlForObjectStrict");
    expect(backend).toContain('bucket: "profile-assets"');
    expect(backend).toContain("expiresIn: 21600");
    expect(backend).toContain("/api/profile-avatar-open?objectKey=");
  });

  it("serves current R2 profile photos through the same-origin avatar route", () => {
    expect(backend).toContain('/api/profile-avatar-open?objectKey=');
    expect(backend).not.toContain("getSignedUrlForObjectStrict({ bucket, objectKey })");
    expect(legacyAvatar).toContain('request.kind === "r2"');
    expect(legacyAvatar).toContain("profiles\\/avatars");
    expect(legacyAvatar).toContain("Foto de perfil não encontrada.");
  });

  it("uses the public legacy avatar directly and keeps a same-origin fallback", () => {
    expect(r2Client).toContain("return raw;");
    expect(avatar).toContain("alternateLegacyAvatarUrl");
    expect(avatar).toContain("recoveryImageUrl");
    expect(avatar).toContain('current.pathname === "/api/profile-avatar-open"');
    expect(avatar).toContain('current.pathname.startsWith("/storage/v1/object/public/avatars/")');
    expect(avatar).toContain("const recovery = new Image()");
  });

  it("hydrates the topbar avatar from an identity-bound persistent cache on F5", () => {
    expect(avatarCache).toContain('const PREFIX = "sigapro.profile-avatar.v2:"');
    expect(avatarCache).toContain("requestedEmail !== cachedEmail");
    expect(portalFrame).toContain("readCachedProfileAvatar(session.id, session.email)");
    expect(portalFrame).toContain("cachedTopbarAvatar?.avatarUrl");
    expect(dataHook).toContain("writeCachedProfileAvatar(profile)");
  });

  it("caches same-origin R2 avatars in the service worker for repeat F5", () => {
    expect(serviceWorker).toContain('CACHE_VERSION = "sigapro-enterprise-v5"');
    expect(serviceWorker).toContain("AVATAR_CACHE");
    expect(serviceWorker).toContain('url.pathname === "/api/profile-avatar-open"');
    expect(serviceWorker).toContain("cacheFirst(request, AVATAR_CACHE)");
  });

  it("avoids a fully blank white document during authenticated internal refresh", () => {
    expect(indexHtml).toContain("data-sigapro-cached-internal");
    expect(indexHtml).toContain("--sig-initial-topbar");
    expect(indexHtml).toContain("#root:empty");
  });

  it("recovers old Supabase avatars and caches them in the current R2 storage", () => {
    expect(backend).toContain("getLegacyProfileAvatarOpenUrl");
    expect(avatar).toContain("/api/profile-avatar-open?source=");
    expect(r2Router).toContain('action === "profile-avatar-open"');
    expect(legacyAvatar).toContain("legacy-profile-avatars/");
    expect(legacyAvatar).toContain("PutObjectCommand");
    expect(legacyAvatar).toContain("/storage/v1/object/public/avatars/");
    expect(vite).toContain("/api/profile-avatar-open");
    expect(vite).toContain("resolveRequestedR2Bucket");
  });
});
