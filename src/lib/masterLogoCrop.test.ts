import { describe, expect, it } from "vitest";
import { calculateMasterLogoCrop, findOpaqueWhiteFooterHeight } from "./masterLogoCrop";

describe("calculateMasterLogoCrop", () => {
  it("centers a square image without distortion", () => {
    expect(calculateMasterLogoCrop({ naturalWidth: 800, naturalHeight: 800, scale: 1, offsetX: 0, offsetY: 0 }))
      .toEqual({ x: 0, y: 0, width: 512, height: 512 });
  });

  it("preserves a landscape image's aspect ratio at 200% zoom", () => {
    expect(calculateMasterLogoCrop({ naturalWidth: 1280, naturalHeight: 720, scale: 2, offsetX: 0, offsetY: 0 }))
      .toEqual({ x: -256, y: -32, width: 1024, height: 576 });
  });

  it("scales editor drag offsets into the exported image", () => {
    expect(calculateMasterLogoCrop({ naturalWidth: 720, naturalHeight: 1280, scale: 2, offsetX: 10, offsetY: -15 }))
      .toEqual({ x: 0, y: -304, width: 576, height: 1024 });
  });
});

describe("findOpaqueWhiteFooterHeight", () => {
  it("removes only a narrow solid white band at the bottom", () => {
    const pixels = new Uint8ClampedArray(10 * 20 * 4);
    for (let y = 17; y < 20; y += 1) {
      for (let x = 0; x < 10; x += 1) pixels.fill(255, (y * 10 + x) * 4, (y * 10 + x + 1) * 4);
    }
    expect(findOpaqueWhiteFooterHeight(pixels, 10, 20)).toBe(3);
  });

  it("does not strip a large white background or transparent rows", () => {
    const white = new Uint8ClampedArray(10 * 20 * 4).fill(255);
    const transparent = new Uint8ClampedArray(10 * 20 * 4);
    expect(findOpaqueWhiteFooterHeight(white, 10, 20)).toBe(0);
    expect(findOpaqueWhiteFooterHeight(transparent, 10, 20)).toBe(0);
  });
});
