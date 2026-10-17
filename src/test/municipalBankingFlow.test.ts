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
  const guideAssets = read("src/lib/guideAssets.ts");
  const mercadoPagoGuide = read("src/lib/mercadoPagoGuide.ts");
  const mercadoPagoServer = read("server/mercadopago.ts");

  it("provides a dedicated admin collection and banking section", () => {
    expect(settingsPage).toContain('{ value: "collection", label: "Arrecadação e banco"');
    expect(settingsPage).toContain('title: "Arrecadação e banco"');
    expect(settingsPage).toContain('setSettingsField("chavePix"');
    expect(settingsPage).toContain('setSettingsField("bankCode"');
    expect(settingsPage).toContain('setSettingsField("bankAgreementCode"');
    expect(settingsPage).toContain("validateMunicipalPixKey");
    expect(settingsPage).toContain("Credenciais, tokens e certificados de API nunca devem ser gravados nesta tela");
    expect(settingsPage).not.toContain("Teste de boleto Mercado Pago");
    expect(settingsPage).not.toContain("Abrir boleto do Mercado Pago");
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
    expect(finance).toContain("ensureMercadoPagoGuideCharge");
    expect(processDetail).toContain("ensureMercadoPagoGuideCharge");
    expect(mercadoPagoGuide).toContain('/api/mercadopago/guide-boleto');
    expect(mercadoPagoServer).toContain("createMercadoPagoGuideBoleto");
    expect(mercadoPagoServer).toContain("external_reference: externalReference");
    expect(finance).not.toContain('padEnd(44, "7")');
    expect(processDetail).not.toContain("000201|");
    expect(processDetail).not.toContain("function buildProtocolGuideHtml");
    expect(finance).not.toContain("PIX|");
  });

  it("uses the resolved municipal branding and reserves the guide tab before async billing", () => {
    expect(finance).toContain("useInstitutionBranding");
    expect(finance).toContain("guideHeaderBranding.logoUrl");
    expect(finance).toContain("reserveGuiaRecolhimentoWindow");
    expect(finance).toContain("showGuiaRecolhimentoError");
    expect(processDetail).toContain("useInstitutionBranding");
    expect(processDetail).toContain("guideHeaderBranding.logoUrl");
    expect(processDetail).toContain("reserveGuiaRecolhimentoWindow");
    expect(processDetail).toContain("showGuiaRecolhimentoError");
    expect(guide).toContain("municipalLogoFallback");
    expect(guide).toContain("toAbsoluteGuideAssetUrl");
    expect(guide).toContain("Promise.all(pending)");
    expect(guide).not.toContain("URL.createObjectURL");
  });

  it("does not open a non-compensated guide before Mercado Pago returns bank data", () => {
    expect(finance).toContain('match.guide.status !== "compensada"');
    expect(processDetail).toContain('selectedGuide.status !== "compensada"');
    expect(mercadoPagoGuide).toContain("!payload.digitableLine?.trim()");
    expect(mercadoPagoGuide).toContain("!payload.barcodeContent?.trim()");
  });

  it("embeds the municipal crest and blocks an incomplete guide from opening", () => {
    expect(guideAssets).toContain("prepareGuideImageSource");
    expect(guideAssets).toContain("readAsDataURL");
    expect(finance).toContain("embeddedGuideLogoUrl");
    expect(processDetail).toContain("embeddedGuideLogoUrl");
    expect(finance).toContain('status !== "compensada"');
    expect(processDetail).toContain('status !== "compensada"');
    expect(mercadoPagoGuide).toContain("!payload.digitableLine?.trim() || !payload.barcodeContent?.trim()");
    expect(finance).toContain("showGuiaRecolhimentoError");
    expect(processDetail).toContain("showGuiaRecolhimentoError");
  });

  it("keeps the official guide premium and print-safe", () => {
    expect(guide).toContain("toAbsoluteGuideAssetUrl");
    expect(guide).toContain("border-top: 4px solid #0f3557");
    expect(guide).toContain("background: #0f3557");
    expect(guide).toContain("height: 19mm");
    expect(guide).toContain("window.setTimeout(function () { window.print(); }, 180)");
  });

  it("prints the provider barcode inside the SIGAPRO guide without fabricating digits", () => {
    expect(guide).toContain('import { QRCodeSVG } from "qrcode.react"');
    expect(guide).toContain("<QRCodeSVG");
    expect(guide).toContain("digits.length >= 40");
    expect(guide).toContain("digits.length <= 48");
    expect(guide).toContain("Interleaved2of5Barcode");
    expect(guide).not.toContain('return "|||||"');
    expect(guide).toContain("Código bancário ainda não fornecido pelo convênio/API");
  });
});
