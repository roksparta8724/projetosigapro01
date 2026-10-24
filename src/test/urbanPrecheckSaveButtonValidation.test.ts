import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("SIGAPRO — validação imediata do registro consultivo", () => {
  it("verifica medições incompletas antes de habilitar o botão de salvar", () => {
    const source=readFileSync(resolve(process.cwd(),"src/components/platform/UrbanPrecheckPanel.tsx"),"utf8");
    const validation=source.indexOf("const invalidEntered = regulation?.rules.some");
    const canSave=source.indexOf("const canSave = !!regulation");
    const save=source.indexOf("const save = async () =>");
    expect(validation).toBeGreaterThan(0);
    expect(validation).toBeLessThan(canSave);
    expect(canSave).toBeLessThan(save);
    expect(source.slice(canSave,save)).toContain("!invalidEntered");
    expect(source).toContain('disabled={!canSave} onClick={() => void save()}');
  });
});
