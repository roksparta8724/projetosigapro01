import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantSettings } from "@/lib/platform";
import { buildTenantSettingsFromMunicipality, type Municipality, type MunicipalitySettings } from "@/lib/municipality";
import { saveRemoteInstitutionSettings, upsertRemoteInstitution } from "@/integrations/backend/platform";

const municipalityId = "49dac0b6-6352-4744-9aab-9ff91c59d970";
const db = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; method: string; payload: Record<string, unknown>; options?: Record<string, unknown> }>,
  municipalityRow: { id: "49dac0b6-6352-4744-9aab-9ff91c59d970" } as { id: string } | null,
}));

vi.mock("@/integrations/backend/databaseClient", () => ({
  databaseClient: {
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
  hasDatabaseEnv: true,
  hasBackendEnv: true,
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

  it("persists PIX and bank collection configuration inside municipality general settings", async () => {
    await saveRemoteInstitutionSettings({
      tenantId: municipalityId,
      chavePix: "financeiro@campolimpopaulista.sp.gov.br",
      beneficiarioArrecadacao: "Prefeitura de Campo Limpo Paulista",
      pixEnabled: true,
      pixKeyType: "email",
      pixMerchantCity: "Campo Limpo Paulista",
      bankCode: "001",
      bankName: "Banco do Brasil",
      bankAgency: "1234",
      bankAgencyDigit: "5",
      bankAccount: "67890",
      bankAccountDigit: "1",
      bankBeneficiaryDocument: "45.780.095/0001-41",
      bankCollectionMode: "agreement",
      bankAgreementCode: "1234567",
      bankWallet: "17",
      bankInstructions: "Pagamento pelos canais oficiais.",
    } as TenantSettings, {
      skipMunicipalityUpdate: true,
      skipMunicipalityBranding: true,
    });

    const settingsCall = db.calls.find((call) => call.table === "municipality_settings");
    expect(settingsCall?.payload.general_settings).toMatchObject({
      pix_enabled: true,
      pix_key_type: "email",
      pix_merchant_city: "Campo Limpo Paulista",
      pix_key: "financeiro@campolimpopaulista.sp.gov.br",
      settlement_beneficiary: "Prefeitura de Campo Limpo Paulista",
      bank_code: "001",
      bank_name: "Banco do Brasil",
      bank_agency: "1234",
      bank_agency_digit: "5",
      bank_account: "67890",
      bank_account_digit: "1",
      bank_beneficiary_document: "45.780.095/0001-41",
      bank_collection_mode: "agreement",
      bank_agreement_code: "1234567",
      bank_wallet: "17",
      bank_instructions: "Pagamento pelos canais oficiais.",
    });
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
      } } as unknown as MunicipalitySettings,
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
