import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const main = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
const internalTabs = readFileSync(resolve(process.cwd(), "src/components/platform/InternalTabs.tsx"), "utf8");
const processDetail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");

describe("refresh viewport persistence", () => {
  it("delegates F5 scroll restoration to the browser without fighting user input", () => {
    expect(main).toContain('window.history.scrollRestoration = "auto"');
    expect(main).not.toContain("window.scrollTo");
    expect(main).not.toContain("pendingRefreshScrollY");
    expect(main).not.toContain("pendingRefreshLocation");
    expect(main).not.toContain("requestAnimationFrame(waitForStableFrame)");
  });

  it("removes legacy snapshot residue without ever drawing a frozen DOM copy", () => {
    expect(main).toContain("clearLegacyRefreshArtifacts");
    expect(main).toContain('document.getElementById("sigapro-refresh-snapshot")');
    expect(main).toContain("legacyOverlay?.remove()");
    expect(main).not.toContain("persistVisualSnapshot");
    expect(main).not.toContain("snapshot.html");
  });

  it("persists subpage and process tabs in the URL so F5 rebuilds the same view", () => {
    expect(internalTabs).toContain('urlParam = "secao"');
    expect(internalTabs).toContain("params.set(urlParam, next)");
    expect(internalTabs).toContain("preventScrollReset: true");
    expect(processDetail).toContain('nextParams.set("aba", tab)');
    expect(processDetail).toContain("setProcessTab");
  });
});
