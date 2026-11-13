import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (name: string) =>
  readFileSync(resolve(process.cwd(), name), "utf8");

describe("SIGAPRO: escala integral", () => {
  it("usa 100% no HTML e no React", () => {
    const html = read("index.html");
    const app = read("src/App.tsx");

    expect(html).toContain('var initialAppZoom = "1"');
    expect(html).toContain('setAttribute("data-page-zoom", "100")');
    expect(app).toContain('dataset.pageZoom = "100"');
  });

  it("preserva layout responsivo", () => {
    const footer = read("src/components/platform/PortalFrame.tsx");
    const analyst = read("src/pages/saas/AnalystDeskPage.tsx");
    const css = read("src/styles/surface-polarity.css");

    expect(footer).toContain('data-sig-footer-grid="true"');
    expect(footer).toContain("whitespace-normal break-words");
    expect(analyst).toContain('data-analysis-distribution-grid="true"');
    expect(analyst).toContain('data-analysis-queue-guide="true"');
    expect(css).toContain("SIGAPRO 100 PERCENT RESPONSIVE PREMIUM V1");
  });
});
