import { describe, expect, it } from "vitest";
import {
  buildGuidePixPayload,
  hasMunicipalBankAgreementConfigured,
  isBankBarcodeIntegrationReady,
  normalizeBankBarcode,
  normalizeDigitableLine,
  validateMunicipalPixKey,
} from "@/lib/paymentCollection";
import type { PaymentGuideEntry, TenantSettings } from "@/lib/platform";

const settings = {
  tenantId: "municipio",
  chavePix: "financeiro@prefeitura.gov.br",
  beneficiarioArrecadacao: "Prefeitura Municipal",
  pixEnabled: true,
  pixKeyType: "email",
  pixMerchantCity: "Campo Limpo Paulista",
  bankCode: "001",
  bankName: "Banco do Brasil",
  bankCollectionMode: "agreement",
  bankAgreementCode: "1234567",
} as TenantSettings;

const guide = {
  kind: "protocolo",
  label: "Guia de protocolo",
  code: "DAM-PROT-2026-000123",
  amount: 35.24,
  status: "pendente",
  dueDate: "20/10/2026",
} as PaymentGuideEntry;

describe("municipal payment collection", () => {
  it("preserves a valid original PIX including lowercase email when settings change", () => {
    const pixPayload = buildGuidePixPayload({ settings, guide });
    const reopened = buildGuidePixPayload({ settings: { ...settings, chavePix: "changed@example.test" }, guide: { ...guide, pixPayload } });
    expect(reopened).toBe(pixPayload);
    expect(reopened).toContain("financeiro@prefeitura.gov.br");
  });
  it("generates a valid EMV PIX payload from the municipal settings", () => {
    const payload = buildGuidePixPayload({
      settings,
      guide,
      municipalityName: "Prefeitura Municipal",
      municipalityCity: "Campo Limpo Paulista",
    });

    expect(payload).toMatch(/^000201/);
    expect(payload).toContain("BR.GOV.BCB.PIX");
    expect(payload).toMatch(/6304[0-9A-F]{4}$/);
  });

  it("validates the PIX key according to the type selected by the administrator", () => {
    expect(validateMunicipalPixKey("12.345.678/0001-90", "cnpj")).toMatchObject({
      valid: true,
      normalized: "12345678000190",
    });
    expect(validateMunicipalPixKey("financeiro@prefeitura.gov.br", "email").valid).toBe(true);
    expect(validateMunicipalPixKey("(11) 98765-4321", "phone")).toMatchObject({
      valid: true,
      normalized: "+5511987654321",
    });
    expect(validateMunicipalPixKey("chave-invalida", "random").valid).toBe(false);
  });

  it("ignores an invalid legacy pix_code and regenerates a valid BR Code", () => {
    const payload = buildGuidePixPayload({
      settings,
      guide: { ...guide, pixPayload: "PIX|LEGADO|INVALIDO" },
      municipalityName: "Prefeitura Municipal",
      municipalityCity: "Campo Limpo Paulista",
    });

    expect(payload).not.toContain("PIX|LEGADO");
    expect(payload).toMatch(/^000201/);
    expect(payload).toMatch(/6304[0-9A-F]{4}$/);
  });

  it("never accepts an invented or malformed bank barcode", () => {
    expect(normalizeBankBarcode("123")).toBe("");
    expect(normalizeBankBarcode("1".repeat(44))).toBe("1".repeat(44));
    expect(normalizeBankBarcode("2".repeat(48))).toBe("");
    expect(normalizeBankBarcode("3".repeat(47))).toBe("");
    expect(normalizeDigitableLine("2".repeat(47))).toBe("2".repeat(47));
    expect(normalizeDigitableLine("3".repeat(48))).toBe("3".repeat(48));
    expect(normalizeDigitableLine("4".repeat(44))).toBe("");
  });

  it("distinguishes bank agreement registration from verified boleto issuing", () => {
    expect(hasMunicipalBankAgreementConfigured(settings)).toBe(true);
    expect(hasMunicipalBankAgreementConfigured({ ...settings, bankAgreementCode: "" })).toBe(false);
    expect(hasMunicipalBankAgreementConfigured({ ...settings, bankCollectionMode: "manual" })).toBe(false);
    expect(isBankBarcodeIntegrationReady(settings)).toBe(false);
    expect(isBankBarcodeIntegrationReady({ ...settings, bankCollectionMode: "api" })).toBe(false);
  });
});
