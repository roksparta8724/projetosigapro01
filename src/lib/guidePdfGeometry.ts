/** A4 in millimetres. Never stretch or crop an official DAM/PIX image. */
export type GuidePdfPlacement = { x: number; y: number; width: number; height: number };

export function fitGuideImageToA4(
  pixelWidth: number,
  pixelHeight: number,
  marginMm = 5,
): GuidePdfPlacement {
  const pageWidth = 210;
  const pageHeight = 297;
  if (!Number.isFinite(pixelWidth) || !Number.isFinite(pixelHeight) ||
      pixelWidth <= 0 || pixelHeight <= 0 ||
      !Number.isFinite(marginMm) || marginMm < 0 || marginMm >= pageWidth / 2 ||
      marginMm >= pageHeight / 2) {
    throw new Error("Dimensões inválidas para o PDF A4 da guia municipal.");
  }
  const usableWidth = pageWidth - 2 * marginMm;
  const usableHeight = pageHeight - 2 * marginMm;
  const factor = Math.min(usableWidth / pixelWidth, usableHeight / pixelHeight);
  const width = pixelWidth * factor;
  const height = pixelHeight * factor;
  return {
    x: (pageWidth - width) / 2,
    y: (pageHeight - height) / 2,
    width,
    height,
  };
}
