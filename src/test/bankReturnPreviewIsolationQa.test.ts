import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (file: string) => readFileSync(file, "utf8");

describe("SIGAPRO - multi-bank CNAB return can never bypass a municipal bank attestation", () => {
  it("serves bank return preview only after authenticated municipal config + bank lookup", () => {
    const api = read("api/collection-configuration.ts");
    expect(api).toContain('action === "bank_return_preview"');
    const scope = api.indexOf('if (action === "bank_return_preview")');
    const next = api.indexOf('if (action === "bank_save")');
    expect(scope).toBeGreaterThan(-1);
    expect(next).toBeGreaterThan(scope);
    const action = api.slice(scope, next);
    expect(action).toContain('"get_municipal_collection_configuration_v1"');
    expect(action).toContain('"get_municipal_collection_bank_details_v1"');
    expect(action).toContain("expectedBankCode: bankCode");
    expect(action).toContain("readStoredGuide(req, municipalityId, guideCode)");
    expect(action).not.toMatch(/confirm_process_payment_guide|compensada|paid_at|UPDATE public.payment_guides|mp_prod_record_accredited_order/);
  });
  it("does not expose bank file parsing as a payment action or a claimed API bank connector", () => {
    const reader = read("server/bank-return-cnab240.ts");
    const ui = read("src/components/platform/BankReturnPreviewPanel.tsx");
    const settings = read("src/components/platform/MunicipalCollectionSettings.tsx");
    const bankSettings = read("src/components/platform/MunicipalBankDetailsSettings.tsx");
    const adapters = read("server/municipal-collection-adapters.ts");
    expect(reader).toContain("automaticSettlementAllowed: false");
    expect(reader).toContain("bankAuthenticated: false");
    expect(ui).toContain('"bank_return_preview"');
    expect(ui).toContain("Nenhum crédito bancário foi autenticado");
    expect(bankSettings).toContain("<BankReturnPreviewPanel municipalityId={municipalityId} bankCode={form.bankCode} readOnly={readOnly}/>");
    expect(settings).not.toContain("<BankReturnPreviewPanel");
    expect(ui).toContain("inspectBankFile(text, bankCode)");
    expect(ui).toContain("local?.format !== \"cnab240\"");
    expect(adapters).toContain('const adapters = new Map<string, MunicipalCollectionAdapter>([["govbr_ar", govbrArReadOnlyAdapter]])');
    expect(adapters).not.toMatch(/adapters\.set\("(santander|itau|govbr_ar)/);
  });
});
