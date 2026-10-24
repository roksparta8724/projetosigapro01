import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("SIGAPRO — proteção contra pré-análises duplicadas", () => {
  it("bloqueia o reenvio do mesmo formulário depois do registro confirmado", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/platform/UrbanPrecheckPanel.tsx"), "utf8");
    expect(source).toContain("currentSnapshot !== lastSavedSnapshot");
    expect(source).toContain("setLastSavedSnapshot(currentSnapshot)");
    expect(source.indexOf("await saveUrbanPrecheckRun(process.id")).toBeLessThan(source.indexOf("setLastSavedSnapshot(currentSnapshot)"));
  });
  it("libera novo registro ao mudar os parâmetros e limpa proteção ao mudar o processo", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/platform/UrbanPrecheckPanel.tsx"), "utf8");
    expect(source).toContain("fields, legalReview, conditionalIds:");
    expect(source).toContain("setLastSavedSnapshot(null);");
  });
});
