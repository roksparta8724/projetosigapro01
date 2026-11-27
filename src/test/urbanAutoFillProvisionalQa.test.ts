import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { prepareAiu2ProvisionalSimulation, prepareUrbanRuleDraftFromReviewedRow } from "@/lib/urbanMatrixDraftPreparation";
import type { UrbanMatrixAnalystGuidance } from "@/integrations/backend/urbanPrecheckClient";

const aiu2 = {
  quadro: "I", pagina_pdf: 37, zona_conforme_tabela: "AIU(2)",
  uso_predominante_conforme_tabela: "comercial e residencial",
  ca_minimo_original: null, ca_basico_original: "1", ca_maximo_original: "1",
  recuo_frontal_m: "10", recuo_lateral_m: "4", recuo_fundos_m: "8",
  taxa_permeabilidade_minima_pct: "35", taxa_ocupacao_maxima_pct: "40",
  lote_minimo_m2: "5000", testada_minima_m: "50", gabarito_original: "2 pavimentos",
  pendencias_de_leitura: "CA mínimo do original exibido como '01', transcrição inconclusiva",
};
const guidance: UrbanMatrixAnalystGuidance = {
  row_index: 21, field_code: "ca_minimo_original", proposed_value: 1,
  original_ocr_text: "01", attribution: "reported_by_user_as_analyst_guidance",
  source_note: "Critério técnico provisório informado pelo analista da Prefeitura, pendente de CONCIDADE.",
  status: "pending_documentary_confirmation",
  provisional_manual_value: 1, provisional_status: "manual_only_pending_concidade",
  provisional_note: "Somente QA, sem vigência legal", provisional_version: 1,
  created_at: "2026-11-05T12:00:00Z",
};

describe("SIGAPRO QA — preenchimento automático com CA AIU2 igual a 1,00", () => {
  it("preenche 1 apenas em simulação vinculada à linha AIU(2) original", () => {
    const result = prepareAiu2ProvisionalSimulation(aiu2, "quadros.pdf", 21, guidance);
    expect(result).not.toBeNull();
    expect(result?.simulationOnly).toBe(true);
    expect(result?.zone).toBe("AIU(2)");
    expect(result?.fields.floor_area_ratio_min?.limit).toBe("1");
    expect(result?.fields.front_setback_m?.limit).toBe("10");
    expect(result?.fields.permeability_percent?.limit).toBe("35");
    expect(result?.fields.floor_count?.limit).toBe("2");
    expect(result?.warning).toContain("Não é permitido salvar");
    expect(result?.otherLegalFields.join(" ")).toContain("01");
    expect(result?.fields.floor_area_ratio_min?.reference).toContain("CONCIDADE");
  });

  it("rejeita aplicar provisório 1 em outro município, zona, índice ou critério", () => {
    expect(prepareAiu2ProvisionalSimulation({ ...aiu2, zona_conforme_tabela: "ZC" }, "quadros.pdf", 21, guidance)).toBeNull();
    expect(prepareAiu2ProvisionalSimulation(aiu2, "quadros.pdf", 20, guidance)).toBeNull();
    expect(prepareAiu2ProvisionalSimulation(aiu2, "quadros.pdf", 21, { ...guidance, proposed_value: 0.1 })).toBeNull();
    expect(prepareAiu2ProvisionalSimulation(aiu2, "quadros.pdf", 21, { ...guidance, provisional_status: "withdrawn" })).toBeNull();
  });

  it("mantém a leitura ambígua sem pré-preenchimento como norma validada", () => {
    expect(prepareUrbanRuleDraftFromReviewedRow(aiu2, "quadros.pdf", false)).toBeNull();
    expect(prepareUrbanRuleDraftFromReviewedRow(aiu2, "quadros.pdf", true)).toBeNull();
  });

  it("preenche índices regulares apenas após leitura conferida", () => {
    const regular = { ...aiu2, zona_conforme_tabela: "ZC", ca_minimo_original: "0,25", pendencias_de_leitura: "" };
    const result = prepareUrbanRuleDraftFromReviewedRow(regular, "quadros.pdf", true);
    expect(result?.fields.floor_area_ratio_min?.limit).toBe("0,25");
    expect(result?.fields.rear_setback_m?.limit).toBe("8");
    expect(result?.simulationOnly).toBeUndefined();
  });

  it("bloqueia salvamento legal de simulação e preserva a confirmação dupla do Quadro II", () => {
    const rules = readFileSync("src/components/platform/MunicipalUrbanRulesSettings.tsx", "utf8");
    const matrix = readFileSync("src/components/platform/UrbanLegalMatrixReviewPanel.tsx", "utf8");
    const quadroII = readFileSync("src/components/platform/UrbanQuadroIILegalReviewPanel.tsx", "utf8");
    expect(rules).toContain("if (simulationOnly)");
    expect(rules).toContain("disabled={busy || loading || simulationOnly}");
    expect(rules).toContain('data-urban-aiu2-autofill-preview="true"');
    expect(matrix).toContain('data-urban-matrix-autofill-action="true"');
    expect(matrix).toContain("prepareAiu2ProvisionalSimulation(");
    expect(quadroII).toContain('data-urban-qii-autofill-candidate="true"');
    expect(quadroII).toContain('setRepeatExcerpt("")');
    expect(quadroII).toContain("current.source_excerpt.includes(excerpt.trim())");
    expect(quadroII).not.toContain("activateUrbanRegulation(");
  });
});
