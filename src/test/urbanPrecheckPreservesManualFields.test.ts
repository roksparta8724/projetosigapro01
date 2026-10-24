import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("SIGAPRO — índices existentes preservados", () => {
  it("não sobrescreve valores e referências da análise manual ao derivar índices", () => {
    const source=readFileSync(resolve(process.cwd(),"src/components/platform/UrbanPrecheckPanel.tsx"),"utf8");
    const derived=source.slice(source.indexOf("const deriveAreaRatios = () =>"),source.indexOf("const measurements = useMemo"));
    expect(derived).toContain("if (next[metric]?.value.trim() || next[metric]?.evidence.trim()) continue;");
    expect(derived).toContain("next[metric] = { value: String(value.value), evidence: value.evidence };");
  });
});
