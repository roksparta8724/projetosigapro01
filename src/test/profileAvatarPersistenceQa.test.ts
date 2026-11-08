import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolveProfileAvatarDisplayUrl } from "@/lib/profileAvatarDisplay";

const profileId = "2244ccaa-1111-4111-8111-123456abcdef";
const key = "platform/profiles/avatars/" + profileId + "/avatar.webp";
const stable = "/api/profile-avatar-open?objectKey=" + encodeURIComponent(key);

describe("SIGAPRO QA — foto persiste após salvar e recarregar o perfil", () => {
  it("prioriza o endereço permanente R2, nunca a prévia blob ou URL assinada expirada", () => {
    expect(resolveProfileAvatarDisplayUrl({
      avatarStorageRef: "r2:" + key,
      avatarUrl: "blob:https://sigapromunicipal.com.br/temporary-preview",
    })).toBe(stable);
    expect(resolveProfileAvatarDisplayUrl({
      avatarStorageRef: "r2:" + key,
      avatarUrl: "https://r2.example.test/picture?X-Amz-Signature=expired",
    })).toBe(stable);
  });

  it("recupera uma foto histórica com storageRef mesmo quando avatarUrl está vazio", () => {
    expect(resolveProfileAvatarDisplayUrl({
      avatarStorageRef: "r2:" + key,
      avatarUrl: "",
    })).toBe(stable);
  });

  it("a página salva a chave R2, não o blob local, e verifica a leitura real", () => {
    const page = readFileSync("src/pages/saas/PerfilPage.tsx", "utf8");
    const uploadBegin = page.indexOf("const uploaded = await uploadFileToStorage(");
    const profileBegin = page.indexOf("const resolvedFullName", uploadBegin);
    const saveBegin = page.indexOf("const savedProfile = await saveUserProfile(nextProfile)", profileBegin);
    const verifyBegin = page.indexOf("const avatarReadConfirmed", saveBegin);
    expect(uploadBegin).toBeGreaterThan(0);
    expect(profileBegin).toBeGreaterThan(uploadBegin);
    expect(saveBegin).toBeGreaterThan(profileBegin);
    expect(verifyBegin).toBeGreaterThan(saveBegin);

    const uploadFlow = page.slice(uploadBegin, profileBegin);
    const saveFlow = page.slice(saveBegin, verifyBegin + 320);
    expect(uploadFlow).toContain("avatarStorageRef = uploaded.persistentRef");
    expect(uploadFlow).toContain("avatarUrl = resolveProfileAvatarDisplayUrl({ avatarStorageRef })");
    expect(uploadFlow).not.toContain("uploaded.publicUrl || effectiveAvatarFiles[0]?.previewUrl");
    expect(uploadFlow).toContain('if (/^(?:blob:|data:)/i.test(avatarUrl)) avatarUrl = "";');
    expect(saveFlow).toContain("avatarStorageRef: savedProfile.avatarStorageRef || avatarStorageRef");
    expect(saveFlow).toContain("confirmSavedAvatarReadable(savedAvatarUrl)");
    expect(page).toContain("const savedAvatarDisplayUrl = resolveProfileAvatarDisplayUrl(profile)");
    expect(page).toContain("setAvatarFiles([");
  });
});
