import { describe, expect, it } from "vitest";
import { resolveProfileAvatarDisplayUrl } from "./profileAvatarDisplay";

const originalKey =
  "municipalities/49dac0b6-6352-4744-9aab-9ff91c59d970/profiles/avatars/bcd34ab4-5f8c-4df7-8539-8661a90a22d7/photo.png";
const stable = `/api/profile-avatar-open?objectKey=${encodeURIComponent(originalKey)}`;

describe("foto automática de todos os perfis SIGAPRO", () => {
  it("mostra foto mesmo quando a opção legada estava desativada", () => {
    expect(resolveProfileAvatarDisplayUrl({
      avatarUrl: stable,
      avatarStorageRef: `r2:${originalKey}`,
      useAvatarInHeader: false,
    })).toBe(stable);
  });

  it("recupera cadastro antigo quando apenas a chave R2 foi preservada", () => {
    expect(resolveProfileAvatarDisplayUrl({ avatarUrl: "", avatarStorageRef: `r2:${originalKey}` })).toBe(stable);
  });

  it("prefere a referência estável em vez de uma URL assinada com expiração", () => {
    expect(resolveProfileAvatarDisplayUrl({
      avatarUrl: "https://files.example.test/img.png?X-Amz-Signature=expired",
      avatarStorageRef: `r2:${originalKey}`,
    })).toBe(stable);
  });

  it("mantém foto de cadastro legado com URL HTTPS", () => {
    expect(resolveProfileAvatarDisplayUrl({ avatarUrl: "https://legacy.example.test/avatar.png" }))
      .toBe("https://legacy.example.test/avatar.png");
  });

  it("retorna iniciais quando a conta não possui foto ou sua referência é inválida", () => {
    expect(resolveProfileAvatarDisplayUrl(null)).toBe("");
    expect(resolveProfileAvatarDisplayUrl({ avatarUrl: "", avatarStorageRef: "" })).toBe("");
    expect(resolveProfileAvatarDisplayUrl({ avatarStorageRef: "r2:../other-tenant/private.png" })).toBe("");
  });
});
