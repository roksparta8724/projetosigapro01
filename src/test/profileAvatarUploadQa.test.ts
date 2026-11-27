import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  MAX_AVATAR_SOURCE_BYTES,
  MAX_INLINE_AVATAR_BYTES,
  prepareProfileAvatarForUpload,
} from "@/lib/profileAvatarUpload";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("SIGAPRO QA — foto grande sem ultrapassar upload serverless", () => {
  it("preserva o arquivo pequeno sem perda de qualidade nem redimensionamento", async () => {
    const file = new File([new Uint8Array(1024)], "foto-original.png", { type: "image/png" });
    expect(await prepareProfileAvatarForUpload(file)).toBe(file);
  });

  it("não decodifica arquivos vazios ou maiores do que 12 MiB", async () => {
    await expect(prepareProfileAvatarForUpload(
      new File([], "vazia.png", { type: "image/png" }),
    )).rejects.toThrow("Selecione uma foto");
    await expect(prepareProfileAvatarForUpload(
      new File([new Uint8Array(MAX_AVATAR_SOURCE_BYTES + 1)], "muito-grande.jpg", { type: "image/jpeg" }),
    )).rejects.toThrow("excede 12 MB");
  });

  it("recusa foto animada pesada e formato não suportado sem alterar silenciosamente", async () => {
    await expect(prepareProfileAvatarForUpload(
      new File([new Uint8Array(MAX_INLINE_AVATAR_BYTES + 1)], "animada.gif", { type: "image/gif" }),
    )).rejects.toThrow("PNG, JPEG, WebP ou AVIF");
  });

  it("reduz dimensões preservando proporção, gera WebP e libera a memória", async () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    const bitmap = { width: 3600, height: 1800, close } as unknown as ImageBitmap;
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((callback) => callback(new Blob([
        Buffer.from("RIFF0000WEBP"),
      ], { type: "image/webp" })));
    const file = new File([new Uint8Array(MAX_INLINE_AVATAR_BYTES + 1)], "altissima.png", {
      type: "image/png",
    });
    const prepared = await prepareProfileAvatarForUpload(file);
    expect(prepared.name).toBe("avatar.webp");
    expect(prepared.type).toBe("image/webp");
    expect(prepared.size).toBeLessThanOrEqual(MAX_INLINE_AVATAR_BYTES);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1800, 900);
    expect(close).toHaveBeenCalledOnce();
  });

  it("em falha de decodificação não envia bytes inválidos nem altera documentos", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => {
      throw new Error("decode");
    }));
    await expect(prepareProfileAvatarForUpload(
      new File([new Uint8Array(MAX_INLINE_AVATAR_BYTES + 1)], "foto.png", {type:"image/png"}),
    )).rejects.toThrow("Não foi possível abrir");

    const upload = readFileSync("src/integrations/r2/storage.ts", "utf8");
    expect(upload).toContain('input.bucket === "profile-assets"');
    expect(upload).toContain("await prepareProfileAvatarForUpload(input.file)");
    expect(upload).toContain("file: uploadSource");
  });
});
