/**
 * SIGAPRO — foto de perfil sem estouro do payload serverless.
 *
 * O upload JSON/base64 precisa permanecer abaixo do limite HTTP da Vercel.
 * Fotos grandes são dimensionadas no navegador preservando a proporção;
 * o servidor continua verificando assinatura de imagem e identidade.
 */
export const MAX_INLINE_AVATAR_BYTES = 2_500_000;
export const MAX_AVATAR_SOURCE_BYTES = 12 * 1024 * 1024;

function avatarError(message: string): Error {
  return new Error(message);
}

async function encodeAvatarWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/webp", quality);
  });
}

export async function prepareProfileAvatarForUpload(file: File): Promise<File> {
  if (!file || file.size === 0)
    throw avatarError("Selecione uma foto de perfil válida.");
  if (file.size > MAX_AVATAR_SOURCE_BYTES)
    throw avatarError("A foto excede 12 MB. Escolha uma imagem menor.");
  // Preserve the original bytes and formats when the request is already safe.
  if (file.size <= MAX_INLINE_AVATAR_BYTES) return file;

  if (!/^image\/(?:png|jpeg|webp|avif)$/i.test(file.type))
    throw avatarError("Para fotos grandes, use PNG, JPEG, WebP ou AVIF estático.");
  if (typeof createImageBitmap !== "function" || typeof document === "undefined")
    throw avatarError("Este navegador não consegue otimizar fotos grandes. Use uma foto de até 2,5 MB.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw avatarError("Não foi possível abrir a foto para otimização. Selecione outra imagem.");
  }

  try {
    if (!bitmap.width || !bitmap.height || !Number.isFinite(bitmap.width) || !Number.isFinite(bitmap.height))
      throw avatarError("Dimensões da foto inválidas.");

    for (const [maxDimension, quality] of [
      [1800, 0.9],
      [1450, 0.84],
      [1100, 0.76],
      [900, 0.7],
    ] as const) {
      const ratio = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw avatarError("Não foi possível preparar a foto neste navegador.");
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await encodeAvatarWebp(canvas, quality);
      canvas.width = 0;
      canvas.height = 0;
      if (blob?.type === "image/webp" &&
          blob.size >= 12 &&
          blob.size <= MAX_INLINE_AVATAR_BYTES) {
        return new File([blob], "avatar.webp", { type: "image/webp", lastModified: Date.now() });
      }
    }
    throw avatarError("Não foi possível reduzir a foto ao tamanho aceito. Tente outra imagem.");
  } finally {
    bitmap.close();
  }
}
