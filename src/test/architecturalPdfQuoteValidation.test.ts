import { describe, expect, it } from "vitest";
import {
  normalizeArchitecturalPdfExtraction,
  quoteSupportsArchitecturalReading,
} from "@/lib/architecturalPdfReadings";

function extraction(metrics: unknown[], hasSitePlan = true, documentType = "architectural_plan") {
  return normalizeArchitecturalPdfExtraction({
    document_type: documentType,
    has_site_plan: hasSitePlan,
    metrics,
    warnings: [],
  });
}
function reading(metric: string, value: number | null, quote: string, page: number | null = 1,
                 confidence = "high") {
  return {metric, value, page, quote, confidence};
}
describe("SIGAPRO QA — evidência matemática e unidade do PDF arquitetônico", () => {
  it("reconhece valores explícitos em português do Brasil sem alterar a unidade", () => {
    expect(quoteSupportsArchitecturalReading("front_setback_m", 5, "Recuo frontal: 5,00 m")).toBe(true);
    expect(quoteSupportsArchitecturalReading("side_setback_m", 1.5, "Recuo lateral: 1,50 metros")).toBe(true);
    expect(quoteSupportsArchitecturalReading("rear_setback_m", 3, "Recuo de fundos: 3 m")).toBe(true);
    expect(quoteSupportsArchitecturalReading("permeability_percent", 35, "Taxa de permeabilidade: 35 %")).toBe(true);
    expect(quoteSupportsArchitecturalReading("occupancy_percent", 50, "Taxa de ocupação: 50%")).toBe(true);
    expect(quoteSupportsArchitecturalReading("floor_area_ratio", 0.25, "CA: 0,25")).toBe(true);
    expect(quoteSupportsArchitecturalReading("floor_area_ratio_min", 0.25, "Coeficiente de aproveitamento: 0,25")).toBe(true);
    expect(quoteSupportsArchitecturalReading("lot_area_m2", 1200, "Área do lote: 1.200 m²")).toBe(true);
    expect(quoteSupportsArchitecturalReading("lot_frontage_m", 10, "Testada: 10 metros")).toBe(true);
    expect(quoteSupportsArchitecturalReading("height_m", 12.5, "Altura da edificação: 12,50m")).toBe(true);
    expect(quoteSupportsArchitecturalReading("floor_count", 2, "Pavimentos: 2")).toBe(true);
  });
  it("bloqueia números descontextualizados, mal convertidos ou unidades equivocadas", () => {
    expect(quoteSupportsArchitecturalReading("front_setback_m", 5, "Recuo frontal: 50 m")).toBe(false);
    expect(quoteSupportsArchitecturalReading("front_setback_m", 5, "Recuo frontal: 5 cm")).toBe(false);
    expect(quoteSupportsArchitecturalReading("front_setback_m", 5, "Testada: 5 m")).toBe(false);
    expect(quoteSupportsArchitecturalReading("front_setback_m", 5, "Cota indefinida 5 m")).toBe(false);
    expect(quoteSupportsArchitecturalReading("front_setback_m", 5, "Recuo frontal: 5 m²")).toBe(false);
    expect(quoteSupportsArchitecturalReading("occupancy_percent", 25, "Taxa de ocupação: 0,25 %")).toBe(false);
    expect(quoteSupportsArchitecturalReading("occupancy_percent", 25, "Taxa de ocupação: 25")).toBe(false);
    expect(quoteSupportsArchitecturalReading("floor_area_ratio", 1, "CA: 1.000")).toBe(false);
    expect(quoteSupportsArchitecturalReading("lot_area_m2", 1200, "Área do lote: 1.200 m")).toBe(false);
    expect(quoteSupportsArchitecturalReading("floor_count", 2, "Pavimentos: 2 m")).toBe(false);
  });
  it("nunca devolve uma medida como apta se a citação, valor ou unidade não conferem", () => {
    const result = extraction([
      reading("front_setback_m", 5, "Recuo frontal: 5,00 m"),
      reading("side_setback_m", 5, "Recuo lateral: 50 m"),
      reading("permeability_percent", 35, "Taxa de permeabilidade: 0,35 %"),
    ]);
    expect(result.automaticallyApproved).toBe(false);
    const frontal = result.readings.find(x=>x.metric === "front_setback_m");
    expect(frontal).toMatchObject({value:5,page:1,usableForReview:true});
    const lateral = result.readings.find(x=>x.metric === "side_setback_m");
    expect(lateral?.value).toBeNull();
    expect(lateral?.usableForReview).toBe(false);
    expect(lateral?.reason).toContain("incompatíveis");
    const permeability = result.readings.find(x=>x.metric === "permeability_percent");
    expect(permeability?.value).toBeNull();
  });
  it("bloqueia recuos sem implantação, PDF não arquitetônico e valores duplicados", () => {
    const noSite = extraction([reading("front_setback_m", 5, "Recuo frontal: 5,00 m")],false);
    expect(noSite.readings.find(x=>x.metric === "front_setback_m")?.value).toBeNull();
    const other = extraction([reading("front_setback_m", 5, "Recuo frontal: 5,00 m")],true,"other");
    expect(other.readings.find(x=>x.metric === "front_setback_m")?.value).toBeNull();
    const duplicate = extraction([
      reading("rear_setback_m", 3, "Recuo de fundos: 3 m"),
      reading("rear_setback_m", 5, "Recuo de fundos: 5 m"),
    ]);
    expect(duplicate.readings.find(x=>x.metric === "rear_setback_m")).toMatchObject({
      value:null,usableForReview:false,
    });
  });
  it("rejeita cota sem página, baixa confiança e pavimentos fracionários",()=>{
    const result=extraction([
      reading("front_setback_m",5,"Recuo frontal: 5 m",null),
      reading("rear_setback_m",3,"Recuo de fundos: 3 m",1,"low"),
      reading("floor_count",2.5,"Pavimentos: 2,5"),
    ]);
    for(const metric of ["front_setback_m","rear_setback_m","floor_count"]) {
      expect(result.readings.find(x=>x.metric===metric)?.value).toBeNull();
    }
  });
});
