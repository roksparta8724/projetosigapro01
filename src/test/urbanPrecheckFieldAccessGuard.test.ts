import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("SIGAPRO — alteração de formulário exige permissão", () => {
  it("bloqueia mudanças sem permissão e rejeita métricas fora da norma", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/platform/UrbanPrecheckPanel.tsx"), "utf8");
    expect(source).toContain("if (readOnly || !regulation?.rules.some(rule => rule.metric === metric)) return;");
    expect(source).toMatch(/const setAreaField =[\s\S]*?if \(readOnly\) return;[\s\S]*?setAreaFields/);
  });
});
