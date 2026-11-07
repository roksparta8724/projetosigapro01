import { describe, expect, it } from "vitest";
import { quoteSupportsArchitecturalReading, normalizeArchitecturalPdfExtraction } from "@/lib/architecturalPdfReadings";

describe("SIGAPRO IA — limites legais não são cotas reais da prancha", () => {
  it("rejeita recuo mínimo legal sem evidência de recuo proposto", () => {
    expect(quoteSupportsArchitecturalReading("front_setback_m",5,"Recuo frontal mínimo legal: 5,00 m")).toBe(false);
    expect(quoteSupportsArchitecturalReading("front_setback_m",5,"Recuo frontal exigido pela lei: 5,00 m")).toBe(false);
    expect(quoteSupportsArchitecturalReading("side_setback_m",1.5,"Recuo lateral obrigatório: 1,50 m")).toBe(false);
    expect(quoteSupportsArchitecturalReading("rear_setback_m",3,"Recuo de fundos conforme legislação: 3,00 m")).toBe(false);
  });
  it("rejeita taxa máxima permitida e coeficiente legal sem conclusão técnica", () => {
    expect(quoteSupportsArchitecturalReading("occupancy_percent",70,"Taxa de ocupação máxima permitida: 70%")).toBe(false);
    expect(quoteSupportsArchitecturalReading("permeability_percent",25,"Taxa de permeabilidade mínima legal: 25%")).toBe(false);
    expect(quoteSupportsArchitecturalReading("floor_area_ratio",1.5,"CA limite legal: 1,50")).toBe(false);
  });
  it("não bloqueia cotas explicitamente observadas no próprio projeto", () => {
    expect(quoteSupportsArchitecturalReading("front_setback_m",5,"Recuo frontal proposto: 5,00 m")).toBe(true);
    expect(quoteSupportsArchitecturalReading("occupancy_percent",50,"Taxa de ocupação calculada: 50%")).toBe(true);
    expect(quoteSupportsArchitecturalReading("floor_area_ratio",0.25,"CA projetado: 0,25")).toBe(true);
  });
  it("mantém leitura legal suspeita como pendência de conferência humana, não número aprovado", () => {
    const out=normalizeArchitecturalPdfExtraction({
      document_type:"architectural_plan",has_site_plan:true,warnings:[],
      metrics:[{metric:"front_setback_m",value:5,page:1,
        quote:"Recuo frontal mínimo legal: 5,00 m",confidence:"high"}],
    });
    expect(out.readings.find(r=>r.metric==="front_setback_m")).toMatchObject({
      value:null,usableForReview:false,
    });
    expect(out.automaticallyApproved).toBe(false);
  });
});
