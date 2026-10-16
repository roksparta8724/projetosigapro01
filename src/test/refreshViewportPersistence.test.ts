import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const main = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
const internalTabs = readFileSync(resolve(process.cwd(), "src/components/platform/InternalTabs.tsx"), "utf8");
const processDetail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");

describe("refresh viewport persistence", () => {
  it("delegates scroll restoration to the browser and never drives a geometry loop", () => {
    expect(main).toContain('window.history.scrollRestoration = "auto"');
    expect(main).not.toContain("window.scrollTo");
    expect(main).not.toContain("pendingRefreshScrollY");
    expect(main).not.toContain("pendingRefreshLocation");
    expect(main).not.toContain("waitForStableFrame");
  });

  it("keeps continuity inside the real root instead of overlaying the application", () => {
    expect(main).toContain("persistRefreshContinuity");
    expect(main).toContain('const CONTINUITY_KEY = "sigapro.refresh.continuity.v1"');
    expect(main).toContain("window.sessionStorage.setItem");
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
