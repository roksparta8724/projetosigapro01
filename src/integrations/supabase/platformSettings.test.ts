import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantSettings } from "@/lib/platform";
import { buildTenantSettingsFromMunicipality, type Municipality, type MunicipalitySettings } from "@/lib/municipality";
import { saveRemoteInstitutionSettings, upsertRemoteInstitution } from "@/integrations/supabase/platform";

const municipalityId = "49dac0b6-6352-4744-9aab-9ff91c59d970";
const db = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; method: string; payload: Record<string, unknown>; options?: Record<string, unknown> }>,
  municipalityRow: { id: "49dac0b6-6352-4744-9aab-9ff91c59d970" } as { id: string } | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      update: (payload: Record<string, unknown>) => {
        db.calls.push({ table, method: "update", payload });
        return {
          eq: () => ({
            select: () => ({
              maybeSingle: async () => ({ data: db.municipalityRow, error: null }),
            }),
          }),
        };
      },
      upsert: async (payload: Record<string, unknown>, options?: Record<string, unknown>) => {
        db.calls.push({ table, method: "upsert", payload, options });
        return { error: null };
      },
    }),
  },
}));

describe("municipal settings persistence", () => {
  beforeEach(() => {
    db.calls.length = 0;
    db.municipalityRow = { id: municipalityId };
  });

  it("updates an existing municipality without an incomplete insert or logo rewrite", async () => {
    await saveRemoteInstitutionSettings({
      tenantId: municipalityId,
      cep: "13230-000",
      endereco: "Rua do Centro, 10 - Centro",
      telefone: "11999999999",
      resumoPlanoDiretor: "Plano diretor vigente",
      resumoUsoSolo: "Regras de ocupacao",
      leisComplementares: "Normas municipais",
    } as TenantSettings, {
      municipalityCity: "Campo Limpo Paulista",
      municipalityState: "sp",
      municipalityFields: ["phone", "address", "secretariat"],
      skipMunicipalityBranding: true,
    });

    const municipalityCall = db.calls.find((call) => call.table === "municipalities");
    expect(municipalityCall?.method).toBe("update");
    expect(municipalityCall?.payload).toMatchObject({
      address: "Rua do Centro, 10 - Centro",
      city: "Campo Limpo Paulista",
      state: "SP",
    });
    expect(municipalityCall?.payload).not.toHaveProperty("name");
    expect(municipalityCall?.payload).not.toHaveProperty("email");
    expect(municipalityCall?.payload).not.toHaveProperty("custom_domain");
    expect(db.calls.find((call) => call.table === "municipality_settings")?.payload.general_settings).toMatchObject({
      postal_code: "13230-000",
      resumo_plano_diretor: "Plano diretor vigente",
      resumo_uso_solo: "Regras de ocupacao",
      leis_complementares: "Normas municipais",
    });
    expect(db.calls.some((call) => call.table === "municipality_branding")).toBe(false);
  });

  it("does not write settings when the municipality is not found", async () => {
    db.municipalityRow = null;

    await expect(saveRemoteInstitutionSettings({ tenantId: municipalityId } as TenantSettings, {
      skipMunicipalityBranding: true,
    })).rejects.toThrow("Prefeitura não encontrada");

    expect(db.calls.map((call) => call.table)).toEqual(["municipalities"]);
  });

  it("does not touch municipality contact fields when saving another settings section", async () => {
    await saveRemoteInstitutionSettings({ tenantId: municipalityId } as TenantSettings, {
      skipMunicipalityUpdate: true,
      skipMunicipalityBranding: true,
    });

    expect(db.calls.map((call) => call.table)).toEqual(["municipality_settings"]);
  });

  it("does not erase address or configured prefixes during an institution edit", async () => {
    await upsertRemoteInstitution({
      institutionId: municipalityId,
      name: "Prefeitura de Campo Limpo Paulista",
      city: "Campo Limpo Paulista",
      state: "SP",
      status: "ativo",
      subdomain: "campolimpopaulista",
      cnpj: "",
      primaryColor: "#123456",
      accentColor: "#abcdef",
      secretariat: "",
    });

    const municipalityCall = db.calls.find((call) => call.table === "municipalities");
    expect(municipalityCall?.payload).not.toHaveProperty("address");
    expect(municipalityCall?.payload).not.toHaveProperty("phone");
    expect(municipalityCall?.payload).not.toHaveProperty("email");
    expect(db.calls.find((call) => call.table === "municipality_settings")?.options?.ignoreDuplicates).toBe(true);
  });

  it("restores postal code and legal descriptions from persisted municipal settings", () => {
    const settings = buildTenantSettingsFromMunicipality(
      { id: municipalityId, address: "Rua do Centro, 10" } as Municipality,
      null,
      { generalSettings: {
        postal_code: "13230-000",
        resumo_plano_diretor: "Plano diretor vigente",
        resumo_uso_solo: "Regras de ocupacao",
        leis_complementares: "Normas municipais",
      } } as MunicipalitySettings,
      null,
    );

    expect(settings).toMatchObject({
      cep: "13230-000",
      endereco: "Rua do Centro, 10",
      resumoPlanoDiretor: "Plano diretor vigente",
      resumoUsoSolo: "Regras de ocupacao",
      leisComplementares: "Normas municipais",
    });
  });
});
