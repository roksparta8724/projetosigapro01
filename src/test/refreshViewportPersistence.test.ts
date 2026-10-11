import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const main = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");

describe("refresh viewport persistence", () => {
  it("stores and restores the exact route, query, hash and scroll position across F5", () => {
    expect(main).toContain("window.location.pathname");
    expect(main).toContain("window.location.search");
    expect(main).toContain("window.location.hash");
    expect(main).toContain("pendingRefreshScrollY");
    expect(main).toContain("pendingRefreshLocation");
    expect(main).toContain('window.scrollTo({ top: restoreScroll, left: 0, behavior: "auto" })');
    expect(main).toContain("window.requestAnimationFrame");
  });

  it("keeps the frozen snapshot visible until the real page reaches the stored viewport", () => {
    expect(main).toContain("Keep the frozen frame visible while React reaches the same viewport");
    expect(main).toContain("snapshot.removeAttribute");
    expect(main).toContain("snapshot.replaceChildren");
  });
});
