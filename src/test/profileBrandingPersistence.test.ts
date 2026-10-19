import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
const logo = readFileSync(resolve(process.cwd(), "src/components/platform/InstitutionalLogo.tsx"), "utf8");
const config = readFileSync(resolve(process.cwd(), "src/pages/saas/ConfiguracoesPage.tsx"), "utf8");
const dataHook = readFileSync(resolve(process.cwd(), "src/hooks/usePlatformData.tsx"), "utf8");
const backend = readFileSync(resolve(process.cwd(), "src/integrations/backend/platformImpl.ts"), "utf8");
const profilePage = readFileSync(resolve(process.cwd(), "src/pages/saas/PerfilPage.tsx"), "utf8");
const storage = readFileSync(resolve(process.cwd(), "src/integrations/r2/storage.ts"), "utf8");
const userAvatar = readFileSync(resolve(process.cwd(), "src/components/platform/UserAvatar.tsx"), "utf8");
const imageFrameEditor = readFileSync(resolve(process.cwd(), "src/components/platform/ImageFrameEditor.tsx"), "utf8");

describe("profile and branding persistence regressions", () => {
  it("keeps search text legible and the magnifier white on both surfaces", () => {
    expect(css).toContain('data-search-surface="dark"');
    expect(css).toContain('data-search-surface="light"');
    expect(css).toContain('background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%) !important');
    expect(css).toContain('stroke: #ffffff !important');
    expect(css).toContain('color: #0f172a !important');
    expect(css).toContain("Production search guard");
    expect(css).not.toContain("Search must read as a neutral light control");
    expect(css).not.toContain("Final topbar search treatment");
  });

  it("keeps municipal header, footer and preview logos whole while preserving master framing", () => {
    expect(logo).toContain("const showCrop =");
    expect(logo).toContain("isMaster &&");
    expect(logo).toContain('(variant === "header" || variant === "footer" || variant === "preview")');
    expect(logo).toContain("const configuredScale = Number.isFinite(branding.logoScale)");
    expect(logo).toContain("Math.max(0.35, Math.min(5, configuredScale))");
    expect(logo).toContain("Math.max(1, Math.min(5, configuredScale))");
    expect(logo).toContain('transformOrigin: "center center"');
    // A moldura municipal usa todo o espaço sem padding antigo que cortava o logo.
    expect(logo).toContain('header: "h-[112px] w-[188px] p-0');
    expect(logo).toContain('object-contain object-center');
    expect(logo).toContain('"block h-full w-full max-w-full select-none object-contain object-center"');
    expect(logo).not.toContain("showMasterCrop");
  });

  it("persists logo framing in municipality settings and verifies the round trip", () => {
    expect(config).toContain("skipMunicipalitySettings: false");
    expect(config).toContain('.from("municipality_settings")');
    expect(config).toContain("footer_logo_scale");
    expect(config).toContain("footer_logo_offset_x");
    expect(config).toContain("footer_logo_offset_y");
    expect(config).toContain("O banco não confirmou o enquadramento do logo");
  });

  it("saves authenticated profiles through the secure Neon RPC", () => {
    expect(backend).toContain('db.rpc("update_current_profile"');
    expect(backend).toContain("_payload: profileFields");
    expect(backend).not.toContain('.from("profiles")\n      .update({ ...profileFields');
    expect(dataHook).toContain("const confirmedProfile = (await saveRemoteProfile(normalizedProfile))");
    expect(dataHook).toContain("sigapro-profile-updated");
    expect(dataHook).toContain("persistedProfile");
  });

  it("renders a professional crop stage with a bright final circle and dimmed outer image", () => {
    expect(userAvatar).toContain("sig-user-avatar-root relative aspect-square shrink-0 overflow-hidden rounded-full");
    expect(userAvatar).toContain("sig-user-avatar-image absolute inset-0 block h-full w-full max-w-none bg-transparent object-cover object-center");
    expect(imageFrameEditor).toContain("sig-image-frame-stage");
    expect(imageFrameEditor).toContain('width: "min(360px, 100%)"');
    expect(imageFrameEditor).toContain('aspectRatio: "1 / 1"');
    expect(imageFrameEditor).toContain("0 0 0 999px rgba(2, 6, 23, 0.58)")
    expect(imageFrameEditor).toContain('inset-[8%]');
    expect(imageFrameEditor).toContain("sig-image-frame-background");
    expect(imageFrameEditor).toContain("sig-image-frame-final-surface");
    expect(imageFrameEditor).toContain("opacity-45");
    expect(imageFrameEditor).toContain("cropFrameSize");
    expect(imageFrameEditor).not.toContain('crossOrigin = "anonymous"');
    expect(css).toContain(".sig-image-frame-stage");
    expect(profilePage).toContain('fitMode="cover"');
    expect(profilePage).toContain("preenche todo o círculo");
    expect(profilePage).toContain("Enquadramento alterado. Clique em “Salvar ajustes da foto” para confirmar.");
    expect(profilePage).toContain("updateAvatarHeaderVisibility");
    expect(profilePage).toContain("border-rose-200 bg-rose-50 text-rose-700");
  });

  it("keeps the last valid avatar visible while remote profile data revalidates", () => {
    expect(dataHook).toContain("PROFILE_VISUAL_CACHE_KEY");
    expect(dataHook).toContain("window.sessionStorage.setItem");
    expect(dataHook).toContain("readProfileVisualCache");
    expect(dataHook).toContain("mergeUserProfiles([cachedVisualProfile], sanitized.userProfiles)");
    expect(dataHook).toContain("avatarStorageRef");
    expect(userAvatar).toContain("stableImageUrl");
    expect(userAvatar).toContain("resolvedImageUrl");
    expect(userAvatar).toContain("const preload = new Image()");
    expect(userAvatar).toContain("preload.onload");
    expect(userAvatar).toContain("emptyClearTimerRef");
    expect(userAvatar).toContain("1200");
    expect(imageFrameEditor).toContain("Stale-while-revalidate visual");
    expect(imageFrameEditor).not.toContain("setNaturalSize({ width: 0, height: 0 })");
    expect(userAvatar).toContain("const resolvedImageUrl = recoveryImageUrl || stableImageUrl || imageUrl ||");
  });

  it("keeps private R2 avatars persistent across F5 and saves new photos only on explicit confirmation", () => {
    expect(storage).toContain('input.bucket === "profile-assets"');
    expect(storage).toContain('`r2:${uploaded.objectKey}`');
    expect(backend).toContain("PROFILE_ASSET_REF_PREFIX");
    expect(backend).toContain("resolveStoredProfileAvatar");
    expect(backend).toContain("avatarStorageRef");
    expect(profilePage).toContain("A foto ainda não foi salva; clique em “Salvar ajustes da foto”.");
    expect(profilePage).not.toContain("Salvando foto automaticamente...");
    expect(profilePage).not.toContain("void handleSubmit({ preventDefault: () => {} } as FormEvent, selectedFiles)");
    expect(profilePage).toContain("uploaded.persistentRef");
    expect(profilePage).not.toContain("Configure a URL publica do R2 antes de salvar a foto.");
  });
});
