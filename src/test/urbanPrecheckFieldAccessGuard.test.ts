import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("SIGAPRO — alteração de formulário exige permissão", () => {
  it("impede atualização de campos por callbacks quando o analista está somente leitura", () => {
    const text=readFileSync(resolve(process.cwd(),"src/components/platform/UrbanPrecheckPanel.tsx"),"utf8");
    expect(text).toMatch(/const setField = \([\s\S]*?\) => \{\s*if \(readOnly\) return;\s*setFields/);
    expect(text).toMatch(/const setAreaField = \([\s\S]*?\) => \{\s*if \(readOnly\) return;\s*setAreaFields/);
  });
});
