import { describe, expect, it } from "vitest";
import {
  DEFAULT_AVATAR_EDITOR_DIAMETER,
  resolveCircularAvatarGeometry,
} from "./avatarCropGeometry";

describe("enquadramento circular consistente do SIGAPRO", () => {
  const portrait = { naturalWidth: 941, naturalHeight: 1672, scale: 1 };

  it("reproduz o mesmo centro e recorte em 32, 40, 56 e 80 pixels", () => {
    const crop = { ...portrait, offsetX: 0, offsetY: 60 };
    const base = resolveCircularAvatarGeometry({
      ...crop,
      diameter: DEFAULT_AVATAR_EDITOR_DIAMETER,
    });
    expect(base).not.toBeNull();
    for (const diameter of [32, 40, 56, 80]) {
      const actual = resolveCircularAvatarGeometry({ ...crop, diameter });
      const factor = diameter / DEFAULT_AVATAR_EDITOR_DIAMETER;
      expect(actual).not.toBeNull();
      expect(actual!.width).toBeCloseTo(base!.width * factor, 6);
      expect(actual!.height).toBeCloseTo(base!.height * factor, 6);
      expect(actual!.offsetX).toBeCloseTo(base!.offsetX * factor, 6);
      expect(actual!.offsetY).toBeCloseTo(base!.offsetY * factor, 6);
    }
  });

  it("impede qualquer faixa branca com deslocamentos extremos vindos do banco", () => {
    for (const diameter of [32, 40, 80]) {
      for (const zoom of [1, 1.25, 2.5]) {
        const actual = resolveCircularAvatarGeometry({
          ...portrait,
          diameter,
          scale: zoom,
          offsetX: 99999,
          offsetY: -99999,
        });
        expect(actual).not.toBeNull();
        expect(actual!.width).toBeGreaterThanOrEqual(diameter * zoom);
        expect(actual!.height).toBeGreaterThanOrEqual(diameter * zoom);
        expect(Math.abs(actual!.offsetX) + diameter / 2).toBeLessThanOrEqual(actual!.width / 2 + 0.0001);
        expect(Math.abs(actual!.offsetY) + diameter / 2).toBeLessThanOrEqual(actual!.height / 2 + 0.0001);
      }
    }
  });

  it("mantém imagem horizontal, quadrada e vertical preenchendo a máscara", () => {
    for (const size of [[1672, 941], [500, 500], [941, 1672]]) {
      const actual = resolveCircularAvatarGeometry({
        naturalWidth: size[0],
        naturalHeight: size[1],
        diameter: 40,
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      });
      expect(actual!.width).toBeGreaterThanOrEqual(40);
      expect(actual!.height).toBeGreaterThanOrEqual(40);
    }
  });

  it("não tenta desenhar recorte quando a imagem ainda não carregou", () => {
    expect(resolveCircularAvatarGeometry({ naturalWidth: 0, naturalHeight: 0, diameter: 40 })).toBeNull();
  });
});
