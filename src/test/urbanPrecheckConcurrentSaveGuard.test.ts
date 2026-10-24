import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("SIGAPRO — bloqueio simultâneo de registros", () => {
  it("trava um segundo clique antes da atualização assíncrona do React", () => {
    const s=readFileSync(resolve(process.cwd(),"src/components/platform/UrbanPrecheckPanel.tsx"),"utf8");
    expect(s).toContain("const saveInFlightRef = useRef(false)");
    expect(s).toContain("saving || saveInFlightRef.current");
    const save=s.slice(s.indexOf("const save = async () =>"));
    expect(save.indexOf("saveInFlightRef.current = true")).toBeLessThan(save.indexOf("await saveUrbanPrecheckRun("));
    expect(save).toContain("if (saveGenerationRef.current === saveGeneration)");
    expect(save).toContain("saveInFlightRef.current = false;");
    expect(save).toContain("setSaving(false);");
  });
});
