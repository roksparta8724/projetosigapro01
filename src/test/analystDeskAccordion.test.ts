import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AnalystDesk process accordion", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/pages/saas/AnalystDeskPage.tsx"),
    "utf8",
  );

  it("keeps process cards compact until the selected process is expanded", () => {
    expect(source).toContain("expandedProcessId");
    expect(source).toContain("const isExpanded = expandedProcessId === process.id");
    expect(source).toContain('data-expanded={isExpanded ? "true" : "false"}');
    expect(source).toContain('{isExpanded ? (');
    expect(source).toContain("Ver detalhes");
    expect(source).toContain("Recolher");
  });

  it("keeps only one expanded process at a time", () => {
    expect(source).toContain(
      "setExpandedProcessId((current) => (current === process.id ? null : process.id))",
    );
  });

  it("preserves the official process navigation inside the expanded card", () => {
    expect(source).toContain("Abrir processo");
    expect(source).toContain("Continuar análise");
    expect(source).toContain("MarkerSelector");
  });
});
