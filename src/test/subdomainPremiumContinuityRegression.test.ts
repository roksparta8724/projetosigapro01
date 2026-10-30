import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeInstitutionalHexColor } from "@/lib/municipality";

const read = (p: string) =>
  readFileSync(resolve(process.cwd(), p), "utf8");

describe("SIGAPRO continuidade premium por subdominio", () => {
  it("exige escala 100 no primeiro paint e apos React", () => {
    expect(read("src/App.tsx")).toContain(
      'dataset.pageZoom = "100"'
    );
    expect(read("index.html")).toMatch(
      /var initialAppZoom\s*=\s*"1"/
    );
    expect(read("index.html")).toContain(
      'data-page-zoom", "100'
    );
  });

  it("conserva rodape flexivel e equipe legivel", () => {
    const portal = read("src/components/platform/PortalFrame.tsx");
    const analyst = read("src/pages/saas/AnalystDeskPage.tsx");
    const css = read("src/styles/surface-polarity.css");

    expect(portal).toContain('data-sig-footer-grid="true"');
    expect(portal).toContain('whitespace-normal break-words');
    expect(analyst).toContain('data-analysis-queue-guide="true"');
    expect(analyst).not.toContain('Atualizar agora');
    expect(css).toContain('SIGAPRO TENANT CONTRAST + FOOTER V3');
  });

  it("rejeita cores invalidas mantendo as validas", () => {
    expect(
      normalizeInstitutionalHexColor("#abc", "#123f32")
    ).toBe("#aabbcc");

    expect(
      normalizeInstitutionalHexColor("quebrada", "#123f32")
    ).toBe("#123f32");
  });
});
