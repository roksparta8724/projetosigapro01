import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fitGuideImageToA4 } from "./guidePdfGeometry";

describe("SIGAPRO DAM — guia A4 sem deformar brasão, texto e QR Pix", () => {
  it("mantém a proporção de documentos em portrait, incluindo altura extra", () => {
    for (const [w,h] of [[820,1160],[820,1200],[900,1800],[420,594]]) {
      const p = fitGuideImageToA4(w,h);
      expect(p.width / p.height).toBeCloseTo(w/h, 10);
      expect(p.x).toBeGreaterThanOrEqual(4.99);
      expect(p.y).toBeGreaterThanOrEqual(4.99);
      expect(p.x + p.width).toBeLessThanOrEqual(205.000001);
      expect(p.y + p.height).toBeLessThanOrEqual(292.000001);
    }
  });
  it("centraliza documento que antes era esticado à força para 200 x 286,5 mm", () => {
    const p = fitGuideImageToA4(820,1160);
    expect(p.width).toBe(200);
    expect(p.height).toBeCloseTo(200*1160/820, 8);
    expect(p.y).toBeCloseTo((297-p.height)/2, 8);
    expect(p.width / p.height).not.toBeCloseTo(200/286.5, 4);
  });
  it("impede páginas cortadas, medidas inválidas ou divisão por zero", () => {
    for (const [w,h,m] of [[0,1160,5],[820,0,5],[-1,900,5],[Infinity,100,5],[820,1160,-1],[820,1160,110]]) {
      expect(() => fitGuideImageToA4(w,h,m)).toThrow(/inválidas/);
    }
  });
  it("usa a geometria calculada na exportação da guia oficial", () => {
    const source = readFileSync("src/lib/guidePdf.ts","utf8");
    expect(source).toContain("fitGuideImageToA4(canvas.width, canvas.height)");
    expect(source).toContain("placement.x, placement.y, placement.width, placement.height");
    expect(source).not.toContain("5, 5, 200, 286.5");
    expect(source).toContain('scale: 3');
    expect(source).toContain('img.decode()');
  });
});
