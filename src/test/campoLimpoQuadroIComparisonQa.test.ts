import { describe, expect, it } from "vitest";
import { CAMPO_LIMPO_QUADRO_I_ORIGINAL } from "@/lib/campoLimpoQuadroIOriginal";
import { compareCampoLimpoQuadroIOriginal } from "@/lib/compareCampoLimpoQuadroIOriginal";
import type { UrbanMatrixBatchDetail } from "@/integrations/backend/urbanPrecheckClient";

const sample = (): UrbanMatrixBatchDetail => ({
  id: "qa-batch", municipality_id: "clp", document_title: "quadros.pdf",
  document_sha256: "a".repeat(64), source_municipality: "Campo Limpo Paulista",
  version: 1, status: "pending_legal_review", reviewed_indexes: [],
  source_rows: CAMPO_LIMPO_QUADRO_I_ORIGINAL.map((row) => ({
    quadro: "I", pagina_pdf: row.pdfPage, zona_conforme_tabela: row.zone,
    uso_predominante_conforme_tabela: row.use,
    ca_minimo_original: row.caMinimumLiteral,
    ca_basico_original: row.caBasicLiteral,
    ca_maximo_original: row.caMaximumLiteral,
    taxa_ocupacao_maxima_pct: row.maximumOccupancyPercentLiteral,
    taxa_permeabilidade_minima_pct: row.minimumPermeabilityPercentLiteral,
    lote_minimo_m2: row.minimumParcelAreaM2Literal,
    testada_minima_m: row.minimumFrontageMLiteral,
    recuo_frontal_m: row.frontSetbackMLiteral,
    recuo_fundos_m: row.rearSetbackMLiteral,
    recuo_lateral_m: row.lateralSetbackMLiteral,
  })),
});

describe("SIGAPRO QA — cotejo da transcrição com fonte oficial, sem aprovar índices", () => {
  it("confronta campos numéricos das 23 linhas sem interpretar '01' da AIU2", () => {
    const result = compareCampoLimpoQuadroIOriginal(sample());
    expect(result.originalRows).toBe(23);
    expect(result.sourceRows).toBe(23);
    expect(result.comparedFields).toBe(229);
    expect(result.differences).toHaveLength(0);
    expect(result.ambiguous).toEqual([22]);
    expect(result.scopeNotice).toContain("sem consolidação");
  });

  it("reconhece o nome real do lote QA: Campo Limpo Paulista - SP", () => {
    const batch = sample();
    batch.source_municipality = "Campo Limpo Paulista - SP";
    const result = compareCampoLimpoQuadroIOriginal(batch);
    expect(result.comparedFields).toBe(229);
    expect(result.differences).toHaveLength(0);
    expect(result.ambiguous).toEqual([22]);
    const another = sample();
    another.source_municipality = "Outro município - SP";
    expect(compareCampoLimpoQuadroIOriginal(another).comparedFields).toBe(0);
  });

  it("detecta mudança real no recuo e não sobrescreve dados do lote", () => {
    const batch = sample();
    batch.source_rows[21].recuo_frontal_m = "5";
    const result = compareCampoLimpoQuadroIOriginal(batch);
    expect(result.differences).toEqual([expect.objectContaining({
      ordinal: 22, field: "Recuo frontal", original: "10", imported: "5",
    })]);
    expect(batch.source_rows[21].recuo_frontal_m).toBe("5");
  });

  it("rejeita posição desordenada e quantidade de linhas diferente", () => {
    const batch = sample();
    [batch.source_rows[0], batch.source_rows[1]] =
      [batch.source_rows[1], batch.source_rows[0]];
    const swapped = compareCampoLimpoQuadroIOriginal(batch);
    expect(swapped.differences.some(x => x.field.includes("Zona e uso"))).toBe(true);
    const short = sample();
    short.source_rows.pop();
    const incomplete = compareCampoLimpoQuadroIOriginal(short);
    expect(incomplete.comparedFields).toBe(0);
    expect(incomplete.differences[0]?.field).toBe("Quantidade de linhas");
  });

  it("nunca compara acervo de outro município como se fosse Campo Limpo Paulista", () => {
    const batch = sample();
    batch.source_municipality = "Prefeitura de outra cidade";
    const result = compareCampoLimpoQuadroIOriginal(batch);
    expect(result.comparedFields).toBe(0);
    expect(result.differences[0]?.field).toBe("Município do lote");
  });
});
