import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("SIGAPRO IA - interpretação prudente do histórico", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/platform/UrbanPrecheckPanel.tsx"), "utf8");
  it("não classifica ausência de evidência como ausência de divergências", () => {
    expect(source).toContain('item.status === "missing_evidence"');
    expect(source).toContain("historicalWarnings || historicalUnverified");
    expect(source).toContain("parâmetro(s) sem comprovação");
  });
  it("não avaliza registro cuja norma histórica esteja ausente", () => {
    expect(source).toContain("Norma histórica indisponível — resultado não verificável");
    expect(source).toContain("Registro consultivo, não é aprovação");
  });
});
