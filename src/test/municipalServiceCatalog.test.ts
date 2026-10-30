import { describe, expect, it } from "vitest";
import { isOccupancyPermitProcessType, processTypeCatalog } from "@/lib/platform";
import { activeMunicipalServices, getMunicipalService,
  getMunicipalServicesForCategory, municipalServiceCategories } from "@/lib/municipalServiceCatalog";

describe("SIGAPRO municipal service selector", () => {
  it("classifies all existing non-Habite-se process types and preserves their original names", () => {
    const existing=processTypeCatalog.filter((type)=>!isOccupancyPermitProcessType(type));
    const services=activeMunicipalServices();
    expect(services.map(s=>s.type).sort()).toEqual([...existing].sort());
    expect(new Set(services.map(s=>s.id)).size).toBe(services.length);
    expect(new Set(services.map(s=>s.type)).size).toBe(services.length);
    for(const service of services){
      expect(getMunicipalService(service.type)).toEqual(service);
      expect(getMunicipalServicesForCategory(service.categoryId)).toContainEqual(service);
    }
  });
  it("preserves an independent Habite-se rather than issuing it from project approval",()=>{
    for(const type of ["Habite-se","Carta de Habite-se Parcial","Certificado de Conclusão de Obra"])
      expect(getMunicipalService(type)).toBeNull();
  });
  it("leaves proposed fiscalization and administrative workflows disabled",()=>{
    for(const id of ["fiscalizacao","servicos_administrativos"] as const){
      expect(municipalServiceCategories.find(c=>c.id===id)?.available).toBe(false);
      expect(getMunicipalServicesForCategory(id)).toHaveLength(0);
    }
  });
  it("never rewrites legacy custom draft process types",()=>{
    expect(getMunicipalService("Serviço particular de prefeitura")).toBeNull();
  });
});