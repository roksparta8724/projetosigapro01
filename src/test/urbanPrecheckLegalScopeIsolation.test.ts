import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("SIGAPRO IA — isolamento das leituras por norma municipal", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/platform/UrbanPrecheckPanel.tsx"), "utf8");
  it("invalida medições e áreas quando muda a norma, o zoneamento, a data ou o processo", () => {
    const start = source.indexOf("// Measurements belong to a specific legal version");
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start, source.indexOf("const conditionalReferences", start));
    expect(block).toContain("setFields({})");
    expect(block).toContain("setAreaFields({})");
    expect(block).toContain("setLastSavedSnapshot(null)");
    expect(block).toContain("[process.id, municipalityId, zone, usage, asOf, regulation?.id]");
  });
  it("somente persiste medições que têm uma leitura presente", () => {
    expect(source).toContain('finding.status !== "missing_evidence" && measurements[finding.metric]');
  });
});
