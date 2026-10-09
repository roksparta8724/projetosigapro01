import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("F5 visual continuity", () => {
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

  it("does not ship the legacy blue boot shell anymore", () => {
    expect(html).not.toContain("sigapro-boot-shell");
    expect(html).not.toContain("sig-boot-topbar");
    expect(html).not.toContain("sig-boot-sidebar");
  });

  it.each(["default", "inverse-main"])("uses the same frozen real DOM regardless of %s theme", () => {
    expect(html).toContain("sigapro-refresh-snapshot");
    expect(html).toContain("snapshot.html");
    expect(html).toContain("window.location.pathname");
  });
});
