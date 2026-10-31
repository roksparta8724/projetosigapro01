import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolveProfileAvatarDisplayUrl } from "../lib/profileAvatarDisplay";

const storage=readFileSync("src/integrations/r2/storage.ts","utf8");
const profile=readFileSync("src/pages/saas/PerfilPage.tsx","utf8");
const server=readFileSync("server/api/profile-avatar-open.ts","utf8");
const r2Upload=readFileSync("server/api/r2-upload.ts","utf8");
const branding=readFileSync("src/hooks/useInstitutionBranding.ts","utf8");
const logo=readFileSync("src/components/platform/InstitutionalLogo.tsx","utf8");

describe("SIGAPRO: perfil Master independente de prefeituras",()=>{
 it("separa as chaves de armazenamento globais e exige autorização Master no backend",()=>{
   expect(storage).toContain('input.masterProfile ? "platform" :');
   expect(storage).toContain('input.bucket !== "profile-assets" || input.folder !== "avatars"');
   expect(profile).toContain('masterProfile: isMasterRole');
   expect(profile).toContain('tenantId: isMasterRole ? null : activeInstitutionId');
   expect(r2Upload).toContain('const platformPermission = await callDataApiRpc(req, "is_master", {})');
   expect(server).toContain('|platform)\\/profiles\\/avatars');
 });
 it("nunca grava uma URL blob temporária em vez da referência R2",()=>{
   expect(profile).toContain("avatarUrl = uploaded.persistentRef");
   expect(profile).toContain("const savedAvatarUrl = resolveProfileAvatarDisplayUrl(savedProfile)");
   expect(profile).toContain("const persistedAvatarUrl = resolveProfileAvatarDisplayUrl(profile)");
 });
 it("recupera avatar global e rejeita caminhos manipulados",()=>{
   const key="platform/profiles/avatars/4c72f8e0-241c-471c-8a6d-42b0bc832eff/photo.png";
   expect(resolveProfileAvatarDisplayUrl({avatarStorageRef:"r2:"+key}))
     .toBe("/api/profile-avatar-open?objectKey="+encodeURIComponent(key));
   expect(resolveProfileAvatarDisplayUrl({avatarStorageRef:"r2:platform/profiles/avatars/../../sensitive"})).toBe("");
 });
});

describe("SIGAPRO: logo Master estável na navegação",()=>{
 it("reutiliza configuração e URL do R2 sem repetir carregamento em cada página",()=>{
   expect(branding).toContain("let sharedPlatformBranding:");
   expect(branding).toContain("Date.now() - sharedPlatformBrandingCheckedAt < 120_000");
   expect(branding).toContain("cachedMasterHeaderSource");
   expect(branding).toContain("headerRaw === cachedMasterHeaderSource && getCachedMasterHeaderUrl()");
   expect(branding).toContain("return () => {active = false;}");
   expect(branding).toContain("shouldUseMasterBranding = isMaster && !tenantId");
   expect(logo).toContain("const context =");
 });
});
