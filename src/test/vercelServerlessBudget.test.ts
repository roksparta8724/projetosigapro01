import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vercel Hobby serverless budget", () => {
  it("keeps at least two function slots free for safe deployments", () => {
    const apiDir = resolve(process.cwd(), "api");
    const functions = readdirSync(apiDir)
      .filter((name) => /\.(ts|js|mjs|cjs)$/.test(name))
      .sort();

    // Hobby currently allows 12 Serverless Functions per deployment.
    // We intentionally cap the repository at 10 so new integrations do not
    // break preview/production merely by adding one endpoint.
    expect(functions.length, functions.join(", ")).toBeLessThanOrEqual(10);
  });
});
