import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { prepareUrbanRuleDraftFromReviewedRow, prepareAiu2ProvisionalSimulation } from "@/lib/urbanMatrixDraftPreparation";
import { CAMPO_LIMPO_PAULISTA_MUNICIPALITY_ID } from "@/lib/urbanOfficialLegalSources";
import { LC379_QUADRO_II_SHA } from "@/lib/urbanQuadroIIPdfAssistedPrefill";
import type { UrbanMatrixAnalystGuidance } from "@/integrations/backend/urbanPrecheckClient";

const source = {
  quadro: "I", pagina_pdf: 36, zona_conforme_tabela: "ZM-B(e)",
  uso_predominante_conforme_tabela: "comercial",
  ca_minimo_original: "0,05", ca_basico_original: "0,5", ca_maximo_original: "1",
  recuo_frontal_m: "10", recuo_lateral_m: "5", recuo_fundos_m: "8",
  taxa_permeabilidade_minima_pct: "70", taxa_ocupacao_maxima_pct: "50",
  lote_minimo_m2: "3000", testada_minima_m: "30",
  gabarito_original: "largura da via da testada + recuo",
  pendencias_de_leitura: "", observacoes_especificas: "",
};
const context = { municipalityId: CAMPO_LIMPO_PAULISTA_MUNICIPALITY_ID, documentSha256: LC379_QUADRO_II_SHA };

describe("SIGAPRO QA — fonte jurídica identificada por tenant e hash", () => {
  it("pré-preenche a linha realmente mostrada no vídeo, com link da Câmara e sem inventar artigo", () => {
    const result = prepareUrbanRuleDraftFromReviewedRow(source, "quadros.pdf", true, context);
    expect(result?.zone).toBe("ZM-B(E)");
    expect(result?.usage).toBe("COMERCIAL");
    expect(result?.fields.front_setback_m?.limit).toBe("10");
    expect(result?.fields.side_setback_m?.limit).toBe("5");
    expect(result?.fields.rear_setback_m?.limit).toBe("8");
    expect(result?.fields.occupancy_percent?.limit).toBe("50");
    expect(result?.fields.permeability_percent?.limit).toBe("70");
    expect(result?.fields.floor_area_ratio_min?.limit).toBe("0,05");
    expect(result?.fields.lot_area_m2?.limit).toBe("3000");
    expect(result?.fields.lot_frontage_m?.limit).toBe("30");
    expect(result?.fields.height_m).toBeUndefined();
    expect(result?.otherLegalFields.join(" | ")).toContain("CA básico");
    expect(result?.otherLegalFields.join(" | ")).toContain("Gabarito/altura condicionado");
    expect(result?.otherLegalFields.join(" | ")).not.toContain("Área mínima do lote");
    expect(result?.otherLegalFields.join(" | ")).not.toContain("CA mínimo:");
    expect(result?.otherLegalFields.join(" | ")).not.toContain("Testada mínima");
    expect(result?.documentarySource).toMatchObject({
      lawNumber: "LC 379/2009", page: 36, status: "original_not_legally_consolidated",
      documentSha256: LC379_QUADRO_II_SHA,
    });
    expect(result?.documentarySource?.pdfUrl).toContain("camaracampolimpo");
    expect(result?.fields.front_setback_m?.reference).toContain("LC nº 379/2009");
    expect(result?.fields.front_setback_m?.reference).toContain("NÃO consolidada");
    expect(result?.fields.front_setback_m?.reference).not.toMatch(/art\.\s*\d+/);
  });

  it("nunca atribui a legislação de Campo Limpo Paulista a outro tenant ou SHA", () => {
    const otherTenant = prepareUrbanRuleDraftFromReviewedRow(source, "quadros.pdf", true,
      { ...context, municipalityId: "15b3165f-7946-4bf3-91f8-5c7a6df83fc1" });
    const otherPdf = prepareUrbanRuleDraftFromReviewedRow(source, "quadros.pdf", true,
      { ...context, documentSha256: "0".repeat(64) });
    expect(otherTenant?.documentarySource).toBeUndefined();
    expect(otherPdf?.documentarySource).toBeUndefined();
    expect(otherTenant?.fields.front_setback_m?.reference).toContain("quadros.pdf");
    expect(otherPdf?.fields.front_setback_m?.reference).not.toContain("LC nº 379/2009");
    expect(prepareUrbanRuleDraftFromReviewedRow(source, "quadros.pdf", false, context)).toBeNull();
  });

  it("não transforma o CA 1,00 provisório da AIU2 em fundamento legal", () => {
    const aiu2 = {
      ...source, pagina_pdf: 37, zona_conforme_tabela: "AIU(2)",
      uso_predominante_conforme_tabela: "comercial e residencial",
      ca_minimo_original: null, pendencias_de_leitura: "Leitura ambígua 01",
    };
    const guidance: UrbanMatrixAnalystGuidance = {
      row_index: 21, field_code: "ca_minimo_original", proposed_value: 1,
      original_ocr_text: "01", attribution: "reported_by_user_as_analyst_guidance",
      source_note: "Critério provisório da Prefeitura",
      status: "pending_documentary_confirmation",
      provisional_manual_value: 1, provisional_status: "manual_only_pending_concidade",
      created_at: "2026-11-05T12:00:00Z",
    };
    const result = prepareAiu2ProvisionalSimulation(aiu2, "quadros.pdf", 21, guidance, context);
    expect(result?.simulationOnly).toBe(true);
    expect(result?.fields.floor_area_ratio_min?.limit).toBe("1");
    expect(result?.fields.floor_area_ratio_min?.reference).toContain("não é lei vigente");
    expect(result?.documentarySource?.page).toBe(37);
  });

  it("mostra fonte e data pendente junto ao formulário, com erro de vigência em foco", () => {
    const rules = readFileSync("src/components/platform/MunicipalUrbanRulesSettings.tsx", "utf8");
    const list = readFileSync("src/components/platform/UrbanLegalMatrixReviewPanel.tsx", "utf8");
    expect(rules).toContain('data-urban-verified-source-identification="true"');
    expect(rules).toContain('data-urban-effective-date-pending="true"');
    expect(rules).toContain("effectiveFromRef.current?.focus()");
    expect(rules).toContain("documentarySource.pdfUrl");
    expect(rules).toContain("setDocumentarySource(undefined)");
    expect(list).toContain("documentSha256: selected.document_sha256");
    expect(rules).toContain("if (simulationOnly)");
  });
});
