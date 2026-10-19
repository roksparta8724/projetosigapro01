import { describe, expect, it, vi } from "vitest";
import { uploadFileToStorage } from "./storage";

vi.mock("@/integrations/r2/client", () => ({
  uploadFile: vi.fn(async (input: { objectKey: string }) => ({
    objectKey: input.objectKey,
    publicUrl: "https://files.example.test/temporary-photo.png?expires=1",
  })),
  deleteFile: vi.fn(),
}));

const identity = {
  tenantId: "49dac0b6-6352-4744-9aab-9ff91c59d970",
  userId: "bcd34ab4-5f8c-4df7-8539-8661a90a22d7",
};

describe("persistência canônica dos uploads institucionais R2", () => {
  it("nunca salva URL temporária como referência de foto de perfil", async () => {
    const file = new File(["imagem"], "foto-perfil.png", { type: "image/png" });
    const result = await uploadFileToStorage({
      ...identity,
      bucket: "profile-assets",
      folder: "avatars",
      file,
    });
    expect(result.path).toMatch(/^municipalities\/[^/]+\/profiles\/avatars\/[^/]+\//);
    expect(result.persistentRef).toBe(`r2:${result.path}`);
    expect(result.persistentRef).not.toContain("expires=1");
    expect(result.publicUrl).toContain("temporary-photo.png");
  });

  it("mantém a compatibilidade dos demais arquivos institucionais", async () => {
    const file = new File(["imagem"], "logo.png", { type: "image/png" });
    const result = await uploadFileToStorage({
      ...identity,
      bucket: "institutional-branding",
      folder: "branding",
      file,
    });
    expect(result.persistentRef).toBe(result.publicUrl);
  });
});
