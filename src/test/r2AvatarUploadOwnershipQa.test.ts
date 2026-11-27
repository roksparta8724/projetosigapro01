import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  avatarUploadContentIsValid,
  buildPublicUrl,
  getR2UploadEntitlement,
  profileAvatarUploadAuthorized,
  validateR2UploadJson,
} from "../../server/api/r2-upload";

const city = "49dac0b6-6352-4744-9aab-9ff91c59d970";
const otherCity = "a9dac0b6-6352-4744-9aab-9ff91c59d970";
const owner = "2244ccaa-1111-4111-8111-123456abcdef";
const other = "1244ccaa-1111-4111-8111-123456abcdef";
const avatar = (municipalityId: string, profileId: string, file = "photo.png") =>
  "municipalities/" + municipalityId + "/profiles/avatars/" + profileId + "/" + file;
const masterAvatar = "platform/profiles/avatars/" + owner + "/photo-master.png";
const logosBucket = "sigapro-logos";

describe("SIGAPRO QA — gravação de avatar vinculada à identidade real", () => {
  it("autoriza o avatar do próprio perfil nos escopos municipal e master", () => {
    expect(profileAvatarUploadAuthorized("profile-assets", logosBucket, avatar(city, owner), owner)).toBe(true);
    expect(profileAvatarUploadAuthorized("profile-assets", logosBucket, masterAvatar, owner)).toBe(true);
  });

  it("não confunde acesso ao município com posse da foto de outro perfil", () => {
    expect(profileAvatarUploadAuthorized("profile-assets", logosBucket, avatar(city, other), owner)).toBe(false);
    expect(profileAvatarUploadAuthorized("profile-assets", logosBucket, masterAvatar, other)).toBe(false);
    expect(profileAvatarUploadAuthorized("profile-assets", logosBucket, avatar(city, owner), null)).toBe(false);
    expect(profileAvatarUploadAuthorized("profile-assets", logosBucket, avatar(city, owner), "unknown")).toBe(false);
  });

  it("não permite contornar o controle por outro bucket, alias ou caminho", () => {
    expect(profileAvatarUploadAuthorized("institutional-branding", logosBucket, avatar(city, other), owner)).toBe(false);
    expect(profileAvatarUploadAuthorized(logosBucket, logosBucket, avatar(city, other), owner)).toBe(false);
    expect(profileAvatarUploadAuthorized("process-documents", "sigapro-documentos", avatar(city, owner), owner)).toBe(false);
    expect(profileAvatarUploadAuthorized("profile-assets", logosBucket, avatar(otherCity, owner), other)).toBe(false);
    expect(profileAvatarUploadAuthorized("profile-assets", logosBucket, avatar(city, owner, "../other.png"), owner)).toBe(false);
    expect(profileAvatarUploadAuthorized("profile-assets", logosBucket, avatar(city, owner, "photo.svg"), owner)).toBe(false);
    expect(profileAvatarUploadAuthorized("profile-assets", logosBucket, "platform/branding/logo.png", owner)).toBe(false);
  });

  it("avatar pessoal usa quota de armazenamento, sem exigir o módulo administrativo", () => {
    const ownAvatar = getR2UploadEntitlement(logosBucket, 24576, true);
    expect(ownAvatar).toEqual({ capability: "storage_bytes", increment: 24576 });
    expect(getR2UploadEntitlement("sigapro-documentos", 500, false))
      .toEqual({ capability: "storage_bytes", increment: 500 });
    expect(getR2UploadEntitlement(logosBucket, 500, false))
      .toEqual({ capability: "module:Configurações", increment: 0 });

    const server = readFileSync("server/api/r2-upload.ts", "utf8");
    expect(server).toContain("getR2UploadEntitlement(bucket, buffer.byteLength, avatarUpload)");
    expect(server).toContain('callDataApiRpc(req, "assert_municipality_entitlement_v1"');
    expect(server).toContain('callDataApiRpc(req, "has_tenant_access"');
    expect(server).toContain("profileAvatarUploadAuthorized(");
  });

  it("verifica a assinatura real da imagem e limita tamanho", () => {
    const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
    const jpeg = Buffer.from([255,216,255,224,0,16,74,70,73,70,0,0]);
    expect(avatarUploadContentIsValid("image/png", png)).toBe(true);
    expect(avatarUploadContentIsValid("image/jpeg", jpeg)).toBe(true);
    expect(avatarUploadContentIsValid("image/jpeg", png)).toBe(false);
    expect(avatarUploadContentIsValid("image/svg+xml", Buffer.from("<svg onload='alert(1)'></svg>"))).toBe(false);
    expect(avatarUploadContentIsValid("image/png", Buffer.alloc(0))).toBe(false);
    expect(avatarUploadContentIsValid("image/png", Buffer.alloc(12 * 1024 * 1024 + 1))).toBe(false);
  });

  it("não fornece URL CDN pública para avatar em nenhum escopo", () => {
    expect(buildPublicUrl(logosBucket, avatar(city, owner))).toBe("");
    expect(buildPublicUrl(logosBucket, masterAvatar)).toBe("");
  });

  it("recusa payloads inválidos e limita o corpo de upload antes da escrita", () => {
    expect(validateR2UploadJson({bucket:"profile-assets",objectKey:masterAvatar})).toMatchObject({
      bucket:"profile-assets",
    });
    expect(() => validateR2UploadJson(null)).toThrow("R2_BODY_INVALID");
    expect(() => validateR2UploadJson([])).toThrow("R2_BODY_INVALID");
    expect(() => validateR2UploadJson({base64:"x".repeat(4 * 1024 * 1024 + 1)}))
      .toThrow("R2_BODY_LIMIT");
    const server = readFileSync("server/api/r2-upload.ts","utf8");
    const client = readFileSync("src/integrations/r2/client.ts","utf8");
    expect(server).toContain("count > MAX_R2_UPLOAD_REQUEST_BYTES");
    expect(server).toContain("if (errorCode === \"R2_BODY_LIMIT\")");
    expect(server).not.toContain("rawMessage");
    expect(server).not.toContain('[ProdAudit][R2Upload] env');
    expect(client).not.toContain("objectKey: input.objectKey,\n      fileName:");
    expect(client).not.toContain('console.warn("[SIGAPRO][R2] resposta upload"');
    expect(client).not.toContain('console.error("[SIGAPRO][R2] falha no upload", error)');
  });

  it("exige perfil autenticado e validação ANTES de gravar bytes no R2", () => {
    const code = readFileSync("server/api/r2-upload.ts", "utf8");
    const check = code.indexOf("profileAvatarUploadAuthorized(",
      code.indexOf("const avatarUpload ="));
    const bytes = code.indexOf('const buffer = Buffer.from(base64, "base64");');
    const upload = code.indexOf("await putR2ObjectWithFallback({", bytes);
    expect(code).toContain("await requireAuthenticatedProfile(req, true)");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(bytes);
    expect(bytes).toBeLessThan(upload);
    expect(code).toContain("avatarUploadContentIsValid(contentType, buffer)");
    expect(code).toContain('if (/\\/profiles\\/avatars\\//i.test(objectKey)) return "";');
  });
});
