import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("SIGAPRO — renovação da conferência legal", () => {
  it("invalida confirmação anterior ao mudar zona, uso, município ou acervo legal", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/platform/UrbanPrecheckPanel.tsx"), "utf8");
    expect(source).toMatch(/setLegalReview\(\{ evidenceIds: \[\], note: "", documentScopeConfirmed: false \}\);\s*\}, \[process\.id, municipalityId, regulation\?\.id, zone, usage, asOf, legalCatalog\]\);/);
  });
});
