import { beforeEach, describe, expect, it } from "vitest";
import { readCachedProfileAvatar, writeCachedProfileAvatar } from "./profileAvatarCache";

describe("persistência de foto de perfil após F5", () => {
  const profile = {
    userId: "profile-001",
    email: "servidor@example.test",
    fullName: "Servidor Municipal",
    avatarUrl: "/api/profile-avatar-open?objectKey=municipalities%2Ftest%2Fprofiles%2Favatars%2Fimg.png",
    avatarStorageRef: "r2:municipalities/test/profiles/avatars/img.png",
    avatarScale: 1.2,
    avatarOffsetX: 15,
    avatarOffsetY: -8,
    useAvatarInHeader: true,
  };

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("recupera a foto e o enquadramento da mesma conta depois de remontar a aplicação", () => {
    writeCachedProfileAvatar(profile);
    expect(readCachedProfileAvatar(profile.userId, profile.email)).toMatchObject(profile);
  });

  it("não expõe o avatar de outra conta ou de e-mail diferente", () => {
    writeCachedProfileAvatar(profile);
    expect(readCachedProfileAvatar("profile-002", profile.email)).toBeNull();
    expect(readCachedProfileAvatar(profile.userId, "outra@example.test")).toBeNull();
  });

  it("não ressuscita uma foto removida e respeita a escolha de não exibi-la no cabeçalho", () => {
    writeCachedProfileAvatar({ ...profile, useAvatarInHeader: false });
    expect(readCachedProfileAvatar(profile.userId, profile.email)?.useAvatarInHeader).toBe(false);
    writeCachedProfileAvatar({ ...profile, avatarUrl: "", avatarStorageRef: "" });
    expect(readCachedProfileAvatar(profile.userId, profile.email)).toBeNull();
  });
});
