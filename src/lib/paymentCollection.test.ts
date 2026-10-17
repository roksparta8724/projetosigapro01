import { describe, expect, it } from "vitest";
import {
  buildGuidePixPayload,
  isBankBarcodeIntegrationReady,
  normalizeBankBarcode,
  normalizeDigitableLine,
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

  it("never accepts an invented or malformed bank barcode", () => {
    expect(normalizeBankBarcode("123")).toBe("");
    expect(normalizeBankBarcode("1".repeat(44))).toBe("1".repeat(44));
    expect(normalizeDigitableLine("2".repeat(47))).toBe("2".repeat(47));
    expect(normalizeDigitableLine("3".repeat(48))).toBe("3".repeat(48));
    expect(normalizeDigitableLine("4".repeat(44))).toBe("");
  });

  it("only marks bank barcode integration ready with a bank and its agreement/API mode", () => {
    expect(isBankBarcodeIntegrationReady(settings)).toBe(true);
    expect(isBankBarcodeIntegrationReady({
      ...settings,
      bankAgreementCode: "",
    })).toBe(false);
    expect(isBankBarcodeIntegrationReady({
      ...settings,
      bankCollectionMode: "manual",
    })).toBe(false);
  });
});
