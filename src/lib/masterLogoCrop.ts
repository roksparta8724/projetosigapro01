export function calculateMasterLogoCrop(input: {
  naturalWidth: number;
  naturalHeight: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  editorSize?: number;
  outputSize?: number;
}) {
  const editorSize = input.editorSize ?? 160;
  const outputSize = input.outputSize ?? 512;
  const renderScale = Math.min(outputSize / input.naturalWidth, outputSize / input.naturalHeight) * input.scale;
  const width = input.naturalWidth * renderScale;
  const height = input.naturalHeight * renderScale;
  const offsetRatio = outputSize / editorSize;
  return {
    x: (outputSize - width) / 2 + input.offsetX * offsetRatio,
    y: (outputSize - height) / 2 + input.offsetY * offsetRatio,
    width,
    height,
  };
}

export function findOpaqueWhiteFooterHeight(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
) {
  const maxTrim = Math.floor(height * 0.2);
  let trimmed = 0;
  for (let y = height - 1; y >= height - maxTrim; y -= 1) {
    let whitePixels = 0;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (pixels[i] >= 245 && pixels[i + 1] >= 245 && pixels[i + 2] >= 245 && pixels[i + 3] >= 245) {
        whitePixels += 1;
      }
    }
    if (whitePixels / width < 0.995) break;
    trimmed += 1;
  }
  return trimmed === maxTrim ? 0 : trimmed;
}
