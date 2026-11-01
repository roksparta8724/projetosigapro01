import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
const avatar=readFileSync("src/components/platform/UserAvatar.tsx","utf8");
const reader=readFileSync("server/api/profile-avatar-open.ts","utf8");
const profile=readFileSync("src/pages/saas/PerfilPage.tsx","utf8");
const css=readFileSync("src/styles/surface-polarity.css","utf8");
const license=readFileSync("server/cloudflare-vision-license.ts","utf8");

describe("SIGAPRO Master: legacy photo must not blink or vanish from records",()=>{
 it("caches known legacy image failures temporarily across route remounts",()=>{
   expect(avatar).toContain("const legacyAvatarFailures=new Map<string,number>()");
   expect(avatar).toContain("failedLegacyRecently(resolvedImageUrl)");
   expect(avatar).toContain("rememberLegacyFailure(resolvedImageUrl)");
   expect(avatar).toContain("LEGACY_AVATAR_FAILURE_TTL_MS=5*60*1000");
   expect(avatar).toContain('current.pathname === "/api/profile-avatar-open"');
 });
 it("never deletes R2 cached copy when an old Supabase host has gone away",()=>{
   expect(reader).toContain('streamAvatarFromAnyClient(clients, bucket, cacheKey, res)');
   expect(reader).toContain('legacySourceRetryAfter.set(cacheKey,Date.now()+LEGACY_RETRY_MS)');
   expect(reader).toContain('A referência permanece no perfil; nenhuma imagem foi excluída.');
   expect(reader).not.toContain('DeleteObjectCommand');
 });
 it("explains that a legacy reference is missing without inventing successful recovery",()=>{
   expect(profile).toContain('data-master-legacy-avatar-warning="true"');
   expect(profile).toContain('o SIGAPRO');
   expect(css).toContain("MASTER PREMIUM ROUTE STABILITY END");
   expect(css).toContain('animation:none !important');
 });
});

describe("SIGAPRO Master: Cloudflare 403 is permission issue, not successful license acceptance",()=>{
 it("returns controlled numeric provider error IDs and instructions",()=>{
   expect(license).toContain("providerCodes:errorIds");
   expect(license).toContain("Workers AI — Read e Workers AI — Edit");
   expect(license).toContain("Nenhum termo foi confirmado pelo provedor");
   expect(license).not.toContain("errors?.[0]?.message");
 });
});
