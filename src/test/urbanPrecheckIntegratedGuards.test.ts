import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const panel=readFileSync(resolve(process.cwd(),"src/components/platform/UrbanPrecheckPanel.tsx"),"utf8");

describe("SIGAPRO — salvaguardas integradas na ficha urbanística", () => {
  it("não injeta evidência para métrica ausente da norma ativa", () => {
    expect(panel).toContain("if (readOnly || !regulation?.rules.some(rule => rule.metric === metric)) return;");
  });
  it("não permite copiar minuta de parecer em acesso somente leitura", () => {
    expect(panel).toContain("if (!reviewDraft || readOnly || loading) return;");
    expect(panel).toContain("disabled={readOnly || loading || !legalReviewReady} onClick={() => void copyDraft()}");
  });
  it("informa a quantidade efetiva de índices preenchidos e preserva valores existentes", () => {
    expect(panel).toContain("const newCount = entries.filter(([metric]) => !fields[metric]?.value.trim() && !fields[metric]?.evidence.trim()).length;");
    expect(panel).toContain("setFields(previous => mergeDerivedUrbanFields(previous, entries))");
  });
});
