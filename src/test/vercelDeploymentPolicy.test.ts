import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vercel deployment policy", () => {
  it("keeps automatic deployments restricted to main", () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
    ) as {
      git?: { deploymentEnabled?: Record<string, boolean> };
    };

    expect(config.git?.deploymentEnabled).toEqual({
      "*": false,
      main: true,
    });
  });
});
