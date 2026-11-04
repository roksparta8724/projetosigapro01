import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CAMPO_LIMPO_OFFICIAL_URBAN_SOURCES, CAMPO_LIMPO_PAULISTA_MUNICIPALITY_ID, getMunicipalOfficialUrbanSources } from "@/lib/urbanOfficialLegalSources";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("SIGAPRO — official urban law reading catalog", () => {
  it("isolates sources to Campo Limpo Paulista instead of leaking across municipalities", () => {
    expect(getMunicipalOfficialUrbanSources(CAMPO_LIMPO_PAULISTA_MUNICIPALITY_ID)).toHaveLength(9);
    expect(getMunicipalOfficialUrbanSources("00000000-0000-4000-8000-000000000000")).toEqual([]);
    expect(getMunicipalOfficialUrbanSources(null)).toEqual([]);
  });
  it("keeps the original 2009 law, subsequent amendments and Plan Director independently", () => {
    const ids = CAMPO_LIMPO_OFFICIAL_URBAN_SOURCES.map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(["lc-379-2009", "lc-440-2011", "lc-473-2014", "lc-613-2023"]));
    expect(CAMPO_LIMPO_OFFICIAL_URBAN_SOURCES.filter((item) => item.pdfUrl)).toHaveLength(8);
    expect(CAMPO_LIMPO_OFFICIAL_URBAN_SOURCES.every((item) =>
      item.officialPageUrl.startsWith("https://"))).toBe(true);
  });
  it("keeps 2026 extraordinary regularization separate from ordinary building permits", () => {
    const exceptional = CAMPO_LIMPO_OFFICIAL_URBAN_SOURCES.filter((item) =>
      item.kind === "procedimento_especial");
    expect(exceptional.map((item) => item.id)).toEqual(expect.arrayContaining([
      "lc-655-2026", "lc-656-2026", "decreto-7548-2026", "decreto-7550-2026",
    ]));
    expect(CAMPO_LIMPO_OFFICIAL_URBAN_SOURCES.find((item) => item.id === "lc-656-2026")?.readingNote)
      .toContain("não substitui o índice de uma obra nova");
  });
  it("quarantines withdrawn PLC 795/2024 and never publishes a PDF as active law", () => {
    const withdrawn = CAMPO_LIMPO_OFFICIAL_URBAN_SOURCES.find((item) => item.id === "plc-795-2024");
    expect(withdrawn?.kind).toBe("proposta_sem_vigencia");
    expect(withdrawn?.pdfUrl).toBeNull();
    const panel = read("src/components/platform/UrbanOfficialLegalSourcesPanel.tsx");
    expect(panel).toContain('item.kind === "proposta_sem_vigencia"');
    expect(panel).toContain("Não é lei vigente");
  });
  it("does not claim an external PDF has been uploaded to R2 or activated for IA", () => {
    const panel = read("src/components/platform/UrbanOfficialLegalSourcesPanel.tsx");
    const legislation = read("src/pages/saas/LegislationPage.tsx");
    const rules = read("src/components/platform/MunicipalUrbanRulesSettings.tsx");
    expect(panel).toContain("não extrai os quadros para o Neon");
    expect(panel).toContain("não libera parâmetros para análise por IA");
    expect(panel).toContain("importar");
    expect(legislation).toContain("<UrbanOfficialLegalSourcesPanel municipalityId={effectiveScopeId} />");
    expect(rules).toContain("<UrbanOfficialLegalSourcesPanel municipalityId={municipalityId} />");
    expect(panel).toContain('rel="noopener noreferrer"');
  });
});
