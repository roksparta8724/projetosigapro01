import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const main = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
const internalTabs = readFileSync(resolve(process.cwd(), "src/components/platform/InternalTabs.tsx"), "utf8");
const processDetail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");

describe("refresh viewport persistence", () => {
  it("stores and restores the exact route, query, hash and scroll position across F5", () => {
    expect(main).toContain("window.location.pathname");
    expect(main).toContain("window.location.search");
    expect(main).toContain("window.location.hash");
    expect(main).toContain("pendingRefreshScrollY");
    expect(main).toContain("pendingRefreshLocation");
    expect(main).toContain('window.scrollTo({ top: restoreScroll, left: 0, behavior: "auto" })');
    expect(main).toContain('window.history.scrollRestoration = "manual"');
    expect(main).toContain("NAVIGATION_STATE_KEY");
    expect(main).toContain("restoreWhenLayoutIsReady");
    expect(main).toContain("window.requestAnimationFrame");
  });

  it("keeps the frozen snapshot visible until the real page reaches the stored viewport", () => {
    expect(main).toContain("Não remover o frame congelado enquanto a página real ainda não possui");
    expect(main).toContain("snapshot.removeAttribute");
    expect(main).toContain("snapshot.replaceChildren");
  });

  it("persists subpage and process tabs in the URL so F5 rebuilds the same view", () => {
    expect(internalTabs).toContain('urlParam = "secao"');
    expect(internalTabs).toContain("params.set(urlParam, next)");
    expect(internalTabs).toContain("preventScrollReset: true");
    expect(processDetail).toContain('nextParams.set("aba", tab)');
    expect(processDetail).toContain("setProcessTab");
  });
});
