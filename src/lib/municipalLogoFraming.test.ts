import { describe, expect, it } from "vitest";
import {
  fitMunicipalLogoFrame, fullMunicipalLogoFrame,
  MUNICIPAL_LOGO_BASE_RATIO, MUNICIPAL_LOGO_EDITOR_SIZE,
  MUNICIPAL_LOGO_FIT_ZOOM, MUNICIPAL_LOGO_MAX_ZOOM, MUNICIPAL_FOOTER_LOGO_MAX_ZOOM,
} from "./municipalLogoFraming";
describe("municipal logo: full fit and persistent optical zoom", () => {
  it("resets to complete 1.50x fit", () => {
    expect(MUNICIPAL_LOGO_FIT_ZOOM).toBe(1.5);
    expect(fullMunicipalLogoFrame()).toEqual({scale:1.5,offsetX:0,offsetY:0});
  });
  it("can save a smaller zoom then zoom more without replacing the asset", () => {
    const first=fitMunicipalLogoFrame({scale:1.1,offsetX:0,offsetY:0});
    const second=fitMunicipalLogoFrame({...first,scale:2.6,offsetX:30,offsetY:-40});
    expect(second).toEqual({scale:2.6,offsetX:30,offsetY:-40});
    expect(fitMunicipalLogoFrame(second)).toEqual(second);
  });
  it("clamps out-of-bounds edits per variant",()=>{
    const h=fitMunicipalLogoFrame({scale:100,offsetX:999,offsetY:-999});
    const f=fitMunicipalLogoFrame({scale:100,offsetX:999,offsetY:-999},"footer");
    expect(h.scale).toBe(MUNICIPAL_LOGO_MAX_ZOOM);
    expect(f.scale).toBe(MUNICIPAL_FOOTER_LOGO_MAX_ZOOM);
    expect(Math.abs(h.offsetX)).toBeLessThanOrEqual(MUNICIPAL_LOGO_EDITOR_SIZE);
    expect(Math.abs(f.offsetY)).toBeLessThanOrEqual(MUNICIPAL_LOGO_EDITOR_SIZE);
  });
  it("keeps finite and complete framing safe",()=>{
    expect(fitMunicipalLogoFrame({scale:Infinity,offsetX:NaN,offsetY:NaN}))
      .toEqual({scale:1.5,offsetX:0,offsetY:0});
    const zoom=1.1,margin=MUNICIPAL_LOGO_EDITOR_SIZE*(1-zoom*MUNICIPAL_LOGO_BASE_RATIO)/2;
    const result=fitMunicipalLogoFrame({scale:zoom,offsetX:50,offsetY:-50});
    expect(result.offsetX).toBeCloseTo(margin);
    expect(result.offsetY).toBeCloseTo(-margin);
  });
});
