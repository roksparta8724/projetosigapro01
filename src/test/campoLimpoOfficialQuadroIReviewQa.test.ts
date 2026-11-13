import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CAMPO_LIMPO_QUADRO_I_ORIGINAL,
  CAMPO_LIMPO_QUADRO_I_READING_CAVEATS,
} from "@/lib/campoLimpoQuadroIOriginal";

describe("SIGAPRO QA — leitura independente do Quadro I da LC 379/2009", () => {
  it("preserva as 23 linhas, as páginas, a zona e o uso sem gerar parâmetros ativos", () => {
    expect(CAMPO_LIMPO_QUADRO_I_ORIGINAL).toHaveLength(23);
    expect(CAMPO_LIMPO_QUADRO_I_ORIGINAL.map(row => row.ordinal)).toEqual(
      Array.from({length: 23}, (_, index) => index + 1),
    );
    expect(CAMPO_LIMPO_QUADRO_I_ORIGINAL.every(row => [36, 37].includes(row.pdfPage))).toBe(true);
    expect(CAMPO_LIMPO_QUADRO_I_ORIGINAL.every(row => row.zone && row.use)).toBe(true);
    expect(CAMPO_LIMPO_QUADRO_I_ORIGINAL.every(row => typeof row.caMinimumLiteral === "string")).toBe(true);
  });

  it("isola a célula 01 da AIU 2, sem aceitar aproximações como 1 ou 0.1", () => {
    const ambiguous = CAMPO_LIMPO_QUADRO_I_ORIGINAL.filter(row =>
      row.readingStatus === "ambiguous_original",
    );
    expect(ambiguous).toHaveLength(1);
    expect(ambiguous[0]).toMatchObject({
      ordinal: 22, pdfPage: 37, zone: "AIU (2)", caMinimumLiteral: "01",
      caBasicLiteral: "1", caMaximumLiteral: "1",
      maximumOccupancyPercentLiteral: "40",
      minimumPermeabilityPercentLiteral: "35",
      minimumParcelAreaM2Literal: "5000", minimumFrontageMLiteral: "50",
      frontSetbackMLiteral: "10", rearSetbackMLiteral: "8", lateralSetbackMLiteral: "4",
    });
    expect(CAMPO_LIMPO_QUADRO_I_READING_CAVEATS.join(" ")).toContain("legislação específica");
  });

  it("não confunde gabarito relativo à via com uma altura numérica fixa", () => {
    const conditionalHeight = CAMPO_LIMPO_QUADRO_I_ORIGINAL.filter(row =>
      row.maximumHeightLiteral.includes("largura da via"),
    );
    expect(conditionalHeight.length).toBeGreaterThanOrEqual(1);
    expect(CAMPO_LIMPO_QUADRO_I_READING_CAVEATS.join(" ")).toContain("não representa altura fixa");
  });

  it("mostra referência literal ao analista sem qualquer escrita ou ativação no backend", () => {
    const panel = readFileSync("src/components/platform/CampoLimpoQuadroIOriginalPanel.tsx", "utf8");
    const sources = readFileSync("src/components/platform/UrbanOfficialLegalSourcesPanel.tsx", "utf8");
    expect(panel).toContain('data-urban-original-quadro-i="true"');
    expect(panel).toContain('data-urban-original-quadro-row={row.ordinal}');
    expect(panel).toContain("CAMPO_LIMPO_QUADRO_I_ORIGINAL_URL");
    expect(panel).toContain("leitura ambígua");
    expect(panel).not.toContain("saveUrbanRegulationDraft(");
    expect(panel).not.toContain("activateUrbanRegulation(");
    expect(sources).toContain("<CampoLimpoQuadroIOriginalPanel />");
  });
});
