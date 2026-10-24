import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("SIGAPRO — escopo urbanístico em modo consulta", () => {
  it("desabilita zona, uso e data e protege os callbacks", () => {
    const source=readFileSync(resolve(process.cwd(),"src/components/platform/UrbanPrecheckPanel.tsx"),"utf8");
    expect(source).toContain('value={zone} disabled={readOnly}');
    expect(source).toContain('value={usage} disabled={readOnly}');
    expect(source).toContain('type="date" value={asOf} disabled={readOnly}');
    expect(source).toContain('if (readOnly) return; setZone(');
    expect(source).toContain('if (readOnly) return; setUsage(');
    expect(source).toContain('if (readOnly) return; setAsOf(');
  });
});
