import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parseAvatarRequest } from "../../server/api/profile-avatar-open";
import { uploadFileToStorage } from "@/integrations/r2/storage";
import { uploadFile } from "@/integrations/r2/client";
import { resolveProfileAvatarDisplayUrl } from "@/lib/profileAvatarDisplay";

vi.mock("@/integrations/r2/client", () => ({
  uploadFile: vi.fn(async (input: { objectKey: string }) => ({
    objectKey: input.objectKey,
    publicUrl: "",
    bucket: "profile-assets",
  })),
  deleteFile: vi.fn(),
}));

const profileId = "2244ccaa-1111-4111-8111-123456abcdef";
const municipalityId = "49dac0b6-6352-4744-9aab-9ff91c59d970";
const platformKey = `platform/profiles/avatars/${profileId}/novo-avatar.png`;
const municipalKey = `municipalities/${municipalityId}/profiles/avatars/${profileId}/foto.png`;
const request = (key: string) => ({
  url: `/api/profile-avatar-open?objectKey=${encodeURIComponent(key)}`,
}) as Parameters<typeof parseAvatarRequest>[0];

describe("SIGAPRO QA: foto da conta Master e isolamento do R2", () => {
  beforeEach(() => vi.clearAllMocks());

  it("serve a referência existente na conta Master pelo endpoint de foto, sem tenant", () => {
    expect(parseAvatarRequest(request(platformKey))).toEqual({
      kind: "r2",
      objectKey: platformKey,
    });
    expect(resolveProfileAvatarDisplayUrl({ avatarStorageRef: `r2:${platformKey}`, avatarUrl: "" }))
      .toBe(`/api/profile-avatar-open?objectKey=${encodeURIComponent(platformKey)}`);
  });

  it("preserva o caminho e a autorização visual dos avatares municipais", () => {
    expect(parseAvatarRequest(request(municipalKey))).toEqual({
      kind: "r2",
      objectKey: municipalKey,
    });
    expect(resolveProfileAvatarDisplayUrl({ avatarStorageRef: `r2:${municipalKey}` }))
      .toContain("objectKey=");
  });

  it("não expõe outros documentos da plataforma nem aceita traversal", () => {
    for (const key of [
      "platform/branding/logo.png",
      "platform/profiles/avatars/../private.png",
      "platform/profiles/avatars/user/../../credentials.json",
      "platform/private/avatars/user/img.png",
      "municipalities/not-a-uuid/profiles/avatars/user/file.png",
    ]) {
      expect(() => parseAvatarRequest(request(key))).toThrow("Chave da foto de perfil inválida.");
      expect(resolveProfileAvatarDisplayUrl({ avatarStorageRef: `r2:${key}` })).toBe("");
    }
  });

  it("envia a foto do Master ao escopo global e mantém o ref permanente", async () => {
    const uploaded = await uploadFileToStorage({
      bucket: "profile-assets",
      tenantId: null,
      platformScope: true,
      userId: profileId,
      file: new File(["imagem"], "foto-master.png", { type: "image/png" }),
      folder: "avatars",
    });
    const sent = vi.mocked(uploadFile).mock.calls[0]?.[0];
    expect(sent?.objectKey).toMatch(
      new RegExp(`^platform/profiles/avatars/${profileId}/[a-zA-Z0-9._-]+$`),
    );
    expect(sent?.bucket).toBe("profile-assets");
    expect(uploaded.persistentRef).toBe(`r2:${sent?.objectKey}`);
    expect(uploaded.publicUrl).toBe("");
  });

  it("nunca transforma o upload municipal sem vínculo em upload Master", async () => {
    await expect(uploadFileToStorage({
      bucket: "profile-assets",
      tenantId: null,
      userId: profileId,
      file: new File(["imagem"], "foto.png", { type: "image/png" }),
      folder: "avatars",
    })).rejects.toThrow("Escopo municipal invalido para upload.");
    expect(uploadFile).not.toHaveBeenCalled();

    const server = readFileSync("server/api/r2-upload.ts", "utf8");
    expect(server).toContain('callDataApiRpc(req, "is_master", {})');
    expect(server).toContain("if (!municipalityId)");
    expect(server).toContain("Somente o administrador geral pode enviar arquivos sem identificação municipal.");
  });
});
