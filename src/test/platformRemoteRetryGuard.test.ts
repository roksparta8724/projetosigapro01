import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Platform remote store retry guard", () => {
  it("calls the base loader instead of recursively calling itself", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/hooks/usePlatformData.tsx"),
      "utf8",
    );
    const start = source.indexOf("async function loadRemotePlatformStoreWithRetry");
    const end = source.indexOf("\nexport function PlatformDataProvider", start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const helper = source.slice(start, end);
    expect(helper).toContain("return await loadRemotePlatformStore();");
    expect(helper).not.toContain("return await loadRemotePlatformStoreWithRetry();");
  });
});
