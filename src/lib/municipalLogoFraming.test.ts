import { describe, expect, it } from "vitest";
import {
  fitMunicipalLogoFrame, fullMunicipalLogoFrame,
  MUNICIPAL_LOGO_BASE_RATIO, MUNICIPAL_LOGO_EDITOR_SIZE, MUNICIPAL_LOGO_MAX_ZOOM,
} from "./municipalLogoFraming";

describe("no-crop municipal logo framing", () => {
  it.each([1.51, 2.3, 5, 100])(
    "recovers complete logo from legacy %sx zoom without deleting the saved image",
    (legacyScale) => {
      expect(fitMunicipalLogoFrame({
        scale: legacyScale, offsetX: 420, offsetY: -420,
      })).toEqual({ scale: 1.5, offsetX: 0, offsetY: 0 });
    },
  );

  it("clamps invalid and non-finite geometry without introducing NaN", () => {
    expect(fitMunicipalLogoFrame({ scale: Number.POSITIVE_INFINITY, offsetX: NaN, offsetY: NaN }))
      .toEqual({ scale: 1.5, offsetX: 0, offsetY: 0 });
  });

  it("allows alignment only within the blank margins of the complete crest", () => {
    const frame = fitMunicipalLogoFrame({ scale: 1.1, offsetX: 50, offsetY: -50 });
    const availableMargin = MUNICIPAL_LOGO_EDITOR_SIZE * (1 - 1.1 * MUNICIPAL_LOGO_BASE_RATIO) / 2;
    expect(frame.scale).toBe(1.1);
    expect(frame.offsetX).toBeCloseTo(availableMargin);
    expect(frame.offsetY).toBeCloseTo(-availableMargin);
    expect(frame.offsetX + (MUNICIPAL_LOGO_EDITOR_SIZE * MUNICIPAL_LOGO_BASE_RATIO * frame.scale) / 2)
      .toBeLessThanOrEqual(MUNICIPAL_LOGO_EDITOR_SIZE / 2);
  });

  it("uses the same full-image zoom and centered offsets for header and footer", () => {
    expect(fullMunicipalLogoFrame()).toEqual({
      scale: MUNICIPAL_LOGO_MAX_ZOOM, offsetX: 0, offsetY: 0,
    });
  });
});
