import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("municipal bank and payment guide flow", () => {
  const settingsPage = read("src/pages/saas/ConfiguracoesPage.tsx");
  const backend = read("src/integrations/backend/platformImpl.ts");
  const municipality = read("src/lib/municipality.ts");
  const finance = read("src/pages/saas/FinanceProtocolsPage.tsx");
  const processDetail = read("src/pages/saas/ProcessDetailPage.tsx");
  const guide = read("src/components/GuiaRecolhimentoOficial.tsx");
  const collection = read("src/lib/paymentCollection.ts");

  it("provides a dedicated admin collection and banking section", () => {
    expect(settingsPage).toContain('{ value: "collection", label: "Arrecadação e banco"');
    expect(settingsPage).toContain('title: "Arrecadação e banco"');
    expect(settingsPage).toContain('setSettingsField("chavePix"');
    expect(settingsPage).toContain('setSettingsField("bankCode"');
    expect(settingsPage).toContain('setSettingsField("bankAgreementCode"');
    expect(settingsPage).toContain("Credenciais, tokens e certificados de API nunca devem ser gravados nesta tela");
  });

  it("persists and restores banking settings through municipality general_settings", () => {
    for (const key of [
      "pix_enabled",
      "pix_key_type",
      "pix_merchant_city",
      "bank_code",
      "bank_name",
      "bank_agency",
      "bank_account",
      "bank_collection_mode",
      "bank_agreement_code",
      "bank_wallet",
    ]) {
      expect(backend).toContain(key);
      expect(municipality).toContain(key);
    }
  });

  it("uses real PIX generation and never fabricates bank barcodes", () => {
    expect(collection).toContain("buildPixPayload");
    expect(finance).toContain("resolveGuideBankingData");
    expect(processDetail).toContain("resolveGuideBankingData");
    expect(finance).not.toContain('padEnd(44, "7")');
    expect(processDetail).not.toContain("000201|");
    expect(finance).not.toContain("PIX|");
  });

  it("prints a real QR SVG and only renders an official 44 digit barcode", () => {
    expect(guide).toContain('import { QRCodeSVG } from "qrcode.react"');
    expect(guide).toContain("<QRCodeSVG");
    expect(guide).toContain("digits.length === 44");
    expect(guide).toContain("Interleaved2of5Barcode");
    expect(guide).not.toContain('return "|||||"');
    expect(guide).toContain("Código bancário ainda não fornecido pelo convênio/API");
  });
});
