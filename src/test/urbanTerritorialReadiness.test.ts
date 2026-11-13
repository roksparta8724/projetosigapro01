import {describe,it,expect} from "vitest";
import {buildUrbanTerritorialReadiness} from "@/lib/urbanTerritorialReadiness";

describe("seguranca do contexto cadastral de zoneamento",()=>{
  it("processo QA04 sem property_id fica explicitamente sem zona ou endereco verificado",()=>{
    const status=buildUrbanTerritorialReadiness("missing");
    expect(status.cadastralLink).toBe("missing");
    expect(status.address).toBe("");
    expect(status.zoneCandidate).toBe("");
    expect(status.zoneVerified).toBe(false);
    expect(status.legalConformity).toBe("not_evaluated");
    expect(status.reasons.join(" ")).toContain("property_id");
  });
  it("zona cadastrada é só candidata, nunca prova de mapa ou aprovação",()=>{
    const status=buildUrbanTerritorialReadiness("linked",{
      id:"cadastro-fixture",
      address:"Rua Ficticia 1",
      registry_code:"QA123",lot:"02",block:"03",
      usage_type:"residencial",zone_code:"ZM-MB2",
    });
    expect(status.cadastralLink).toBe("linked");
    expect(status.address).toBe("Rua Ficticia 1");
    expect(status.zoneCandidate).toBe("ZM-MB2");
    expect(status.zoneVerified).toBe(false);
    expect(status.legalConformity).toBe("not_evaluated");
    expect(status.reasons.join(" ")).toMatch(/cartografica/i);
  });
  it("falha na leitura cadastral não aproveita valores recebidos e não revela zona",()=>{
    const status=buildUrbanTerritorialReadiness("unverified",{
      id:"foreign-tenant-record",address:"Rua de outra prefeitura",zone_code:"ZR-1",
    });
    expect(status.address).toBe("");
    expect(status.zoneCandidate).toBe("");
    expect(status.zoneVerified).toBe(false);
    expect(status.reasons.join(" ")).toMatch(/nao foi possivel verificar/i);
  });
});
