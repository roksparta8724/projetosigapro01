import { describe, expect, it } from "vitest";
import { fitMunicipalLogoFrame, fullMunicipalLogoFrame, MUNICIPAL_LOGO_FULL_FIT_ZOOM, MUNICIPAL_LOGO_MAX_ZOOM, MUNICIPAL_FOOTER_LOGO_MAX_ZOOM } from "./municipalLogoFraming";
describe("municipal logo repositioning", () => {
  it("retains the full original at 1.50x", () => {
    expect(MUNICIPAL_LOGO_FULL_FIT_ZOOM).toBe(1.5);
    expect(fullMunicipalLogoFrame()).toEqual({scale:1.5,offsetX:0,offsetY:0});
  });
  it("can save a smaller frame, then save 4.25x with the intended pan", () => {
    const a=fitMunicipalLogoFrame({scale:1.1,offsetX:0,offsetY:0});
    const b=fitMunicipalLogoFrame({...a,scale:4.25,offsetX:74,offsetY:-83});
    expect(b).toEqual({scale:4.25,offsetX:74,offsetY:-83});
    expect(fitMunicipalLogoFrame(b)).toEqual(b);
  });
  it("supports deliberate cropping independently to 5x", () => {
    expect(MUNICIPAL_LOGO_MAX_ZOOM).toBe(5);
    expect(MUNICIPAL_FOOTER_LOGO_MAX_ZOOM).toBe(5);
    expect(fitMunicipalLogoFrame({scale:99}, "header").scale).toBe(5);
    expect(fitMunicipalLogoFrame({scale:99}, "footer").scale).toBe(5);
  });
  it("sanitizes nonfinite numbers",()=>{
    expect(fitMunicipalLogoFrame({scale:Infinity,offsetX:NaN,offsetY:NaN}))
      .toEqual({scale:1.5,offsetX:0,offsetY:0});
  });
});
