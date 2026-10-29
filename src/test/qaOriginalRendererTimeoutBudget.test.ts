import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("real DAM renderer QA waits for its embedded images without passing a stuck renderer", () => {
  it("allows more room for the real async canvas path while preserving an explicit hard failure", () => {
    const s = readFileSync("scripts/qa-dam-original-browser-render.mjs","utf8");
    const ci = readFileSync(".github/workflows/quality-gate.yml","utf8");
    expect(s).toContain("real PDF not ready after 75000ms");
    expect(s).toContain("},75000)");
    expect(s).toContain('"--virtual-time-budget=115000"');
    expect(s).toContain('setTimeout(()=>resolve("TIMEOUT"),145000)');
    expect(ci).toContain("timeout --signal=KILL 170s");
    expect(s).toContain('SIGAPRO_REAL_RENDER_PASSED:');
    expect(s).toContain('SIGAPRO_REAL_RENDER_FAILED:');
  });
});