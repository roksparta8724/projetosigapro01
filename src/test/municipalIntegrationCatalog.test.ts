import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MUNICIPAL_INTEGRATION_PROFILES, getMunicipalIntegrationProfile } from "@/lib/municipalIntegrationCatalog";
import { getMunicipalCollectionAdapter } from "../../server/municipal-collection-adapters";

describe("SIGAPRO - multi-municipality provider selection and fail-closed onboarding",()=>{
  it("lists providers as onboarding templates, never operational bank promises",()=>{
    for(const code of ["santander_033","itau_341","govbr_ar","banco_brasil_001","caixa_104"]){
      const profile=getMunicipalIntegrationProfile(code);
      expect(profile?.requirements.length).toBeGreaterThan(1);
      expect(profile?.recommendation).toMatch(/(adaptador|conector|integração)/i);
      expect(getMunicipalCollectionAdapter(code)).toBeNull();
    }
    expect(getMunicipalIntegrationProfile("unknown bank")).toBeNull();
    expect(MUNICIPAL_INTEGRATION_PROFILES.map(p=>p.code).length).toBe(new Set(MUNICIPAL_INTEGRATION_PROFILES.map(p=>p.code)).size);
  });
  it("provides municipal onboarding while leaving API secrets unavailable until a certified adapter exists",()=>{
    const ui=readFileSync("src/components/platform/MunicipalCollectionSettings.tsx","utf8");
    const api=readFileSync("api/collection-configuration.ts","utf8");
    expect(ui).toContain('data-municipal-supplier-catalogue="true"');
    expect(ui).toContain('data-supplier-onboarding-requirements="true"');
    expect(ui).toContain('integrationType:"controlled_import"');
    expect(ui).toContain('apiBaseUrl:"",secret:""');
    expect(ui).toContain("a Prefeitura emite a guia no seu sistema oficial");
    expect(api).toContain('if (mode === "municipal_system" && integrationType === "automatic")');
    expect(api).toContain('if (!adapter)');
    expect(api).toContain('if (secret) throw new Error');
    expect(api).toContain('adapter.operations.includes(operation)');
    expect(api).toContain('Fornecedor ainda sem adaptador homologado');
  });
});
