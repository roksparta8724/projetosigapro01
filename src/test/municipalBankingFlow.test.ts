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
  const neonBankingMigration = read("neon/migrations/20261017_payment_guide_banking_fields.sql");
  const guideAssets = read("src/lib/guideAssets.ts");
  const mercadoPagoGuide = read("src/lib/mercadoPagoGuide.ts");
  const mercadoPagoClient = mercadoPagoGuide;
  const mercadoPagoServer = read("server/mercadopago.ts");

  it("provides a dedicated admin collection and banking section", () => {
    expect(settingsPage).toContain('{ value: "collection", label: "Arrecadação e banco"');
    expect(settingsPage).toContain('title: "Arrecadação e banco"');
    expect(settingsPage).toContain('setSettingsField("chavePix"');
    expect(settingsPage).toContain('setSettingsField("bankCode"');
    expect(settingsPage).toContain('setSettingsField("bankAgreementCode"');
    expect(settingsPage).toContain('setSettingsField("paymentProvider"');
    expect(settingsPage).toContain('setSettingsField("paymentAuthenticationMode"');
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
    expect(finance).toContain("bankStatus: providerCharge?.status");
    expect(processDetail).toContain("bankStatus: providerCharge?.status");
    expect(finance).not.toContain("PIX|");
  });

  it("uses resolved municipal branding and opens only the final DAM document", () => {
    expect(finance).toContain("useInstitutionBranding");
    expect(finance).toContain("guideHeaderBranding.logoUrl");
    expect(processDetail).toContain("useInstitutionBranding");
    expect(processDetail).toContain("guideHeaderBranding.logoUrl");
    expect(processDetail).toContain("preparedGuideCharges");
    expect(processDetail).toContain("preparedGuideLogoUrl");
    expect(finance).not.toContain("reserveGuiaRecolhimentoWindow");
    expect(processDetail).not.toContain("reserveGuiaRecolhimentoWindow");
    expect(finance).not.toContain("showGuiaRecolhimentoError");
    expect(processDetail).not.toContain("showGuiaRecolhimentoError");
    expect(guide).toContain("municipalLogoFallback");
    expect(guide).toContain("toAbsoluteGuideAssetUrl");
    expect(guide).toContain("Promise.all(pending)");
    expect(guide).toContain("URL.createObjectURL");
    expect(guide).toContain('window.open(previewUrl, "_blank")');
  });

  it("does not open a guide before Mercado Pago returns complete bank data", () => {
    expect(finance).toContain("if (!banking.barcode || !banking.digitableLine)");
    expect(processDetail).toContain("if (banking.barcode && banking.digitableLine) continue;");
    expect(processDetail).toContain("if (!barcode || !digitableLine)");
    expect(mercadoPagoGuide).toContain("!payload.digitableLine?.trim()");
    expect(mercadoPagoGuide).toContain("!payload.barcodeContent?.trim()");
  });

  it("embeds the municipal crest and blocks an incomplete guide from opening", () => {
    expect(guideAssets).toContain("prepareGuideImageSource");
    expect(guideAssets).toContain("readAsDataURL");
    expect(finance).toContain("embeddedGuideLogoUrl");
    expect(processDetail).toContain("embeddedGuideLogoUrl");
    expect(finance).toContain("if (!barcode || !digitableLine)");
    expect(processDetail).toContain("if (!barcode || !digitableLine)");
    expect(mercadoPagoGuide).toContain("!payload.digitableLine?.trim() || !payload.barcodeContent?.trim()");
    expect(finance).toContain("A DAM foi bloqueada para não emitir uma guia inválida");
    expect(processDetail).toContain("A guia ainda está sendo preparada.");
  });

  it("marks sandbox guides while keeping the configured municipal PIX visible", () => {
    expect(guide).toContain('bankEnvironment?: "test" | "production"');
    expect(guide).toContain('guia.bankEnvironment === "test"');
    expect(guide).toContain("Homologação Mercado Pago");
    expect(guide).toContain("PIX cadastrado pode ser real");
    expect(finance).toContain("pixPayload: banking.pixPayload");
    expect(processDetail).toContain("pixPayload: banking.pixPayload");
  });

  it("keeps the official guide premium and print-safe", () => {
    expect(guide).toContain("toAbsoluteGuideAssetUrl");
    expect(guide).toContain("border-top: 4px solid #0f3557");
    expect(guide).toContain("background: #0f3557");
    expect(guide).toContain("height: 19mm");
    expect(guide).toContain("window.setTimeout(function () { window.print(); }, 180)");
  });

  it("embeds the institutional logo and binds the static print/PDF button", () => {
    expect(guideAssets).toContain("prepareGuideInstitutionalLogo");
    expect(guideAssets).toContain('[data-logo-context="municipality"][data-logo-variant="header"] img');
    expect(finance).toContain("prepareGuideInstitutionalLogo");
    expect(processDetail).toContain("prepareGuideInstitutionalLogo");
    expect(guide).toContain('data-dam-print-button="true"');
    expect(guide).toContain("bindDamPrint");
    expect(guide).toContain("window.print()");
    expect(guide).not.toContain("onClick={() => window.print()}");
  });

  it("never opens a pending DAM without both official banking fields", () => {
    expect(finance).toContain("(!barcode || !digitableLine)");
    expect(processDetail).toContain("(!barcode || !digitableLine)");
    expect(finance).toContain("A DAM foi bloqueada para não emitir uma guia inválida");
    expect(processDetail).toContain("A guia ainda está sendo preparada. Aguarde a conclusão dos dados bancários antes de abrir.");
    expect(mercadoPagoGuide).toContain("validLine");
    expect(mercadoPagoGuide).toContain("validBarcode");
    expect(mercadoPagoServer).toContain("hasCompleteGuideBankingData");
    expect(mercadoPagoServer).toContain("refetchMercadoPagoOrder");
    expect(mercadoPagoServer).toContain("/v1/orders/");
  });

  it("requests provider banking data whenever the DAM has no barcode or digitable line", () => {
    expect(finance).toContain("if (!banking.barcode || !banking.digitableLine)");
    expect(processDetail).toContain("if (banking.barcode && banking.digitableLine) continue;");
    expect(finance).toContain("if (!barcode || !digitableLine)");
    expect(processDetail).toContain("if (!barcode || !digitableLine)");
    expect(finance).not.toContain('match.guide.status !== "compensada" &&');
    expect(processDetail).not.toContain('selectedGuide.status !== "compensada" &&');
  });

  it("prepares auditable bank authentication and Neon persistence", () => {
    expect(guide).toContain("bankAuthenticationLabel");
    expect(guide).toContain("AGUARDANDO COMPENSAÇÃO");
    expect(guide).toContain("PAGAMENTO COMPENSADO");
    expect(guide).toContain("Tesouraria / baixa manual");
    expect(neonBankingMigration).toContain("bank_payment_id");
    expect(neonBankingMigration).toContain("bank_status_detail");
    expect(neonBankingMigration).toContain("bank_authenticated_at");
    expect(neonBankingMigration).toContain("payment_provider");
  });

  it("binds DAM-ISS guides to the Mercado Pago order before rendering", () => {
    expect(processDetail).toContain('ensureMercadoPagoGuideCharge({');
    expect(processDetail).toContain("preparedGuideCharges");
    expect(processDetail).toContain("guideCode: guide.code");
    expect(processDetail).toContain("amount: guide.amount");
    expect(processDetail).toContain('description: `${guide.label} · ${process.protocol}`');
    expect(processDetail).toContain('codigoBarras: barcode');
    expect(processDetail).toContain('linhaDigitavel: digitableLine');
    expect(mercadoPagoServer).toContain("normalizeGuideCode");
    expect(mercadoPagoServer).toContain("external_reference: externalReference");
  });

  it("keeps PIX visible in homologation and uses electronic authentication", () => {
    expect(guide).toContain("PIX — QR Code e Copia e Cola");
    expect(guide).toContain("PIX cadastrado pode ser real");
    expect(guide).not.toContain("PIX real oculto durante a homologação");
    expect(finance).toContain("pixPayload: banking.pixPayload");
    expect(processDetail).toContain("pixPayload: banking.pixPayload");
    expect(guide).toContain("VALIDAÇÃO ELETRÔNICA PELO PROVEDOR DE PAGAMENTO");
    expect(guide).toContain("Tesouraria / baixa manual");
  });

  it("refreshes provider status to support automatic bank authentication", () => {
    expect(mercadoPagoServer).toContain("getMercadoPagoGuideBoletoStatus");
    expect(mercadoPagoServer).toContain("authenticatedAt");
    expect(mercadoPagoClient).toContain('/api/mercadopago/guide-status');
    expect(mercadoPagoClient).toContain("refreshMercadoPagoGuideCharge");
    expect(finance).toContain("providerCharge?.authenticatedAt");
    expect(processDetail).toContain("providerCharge?.authenticatedAt");
  });

  it("prints the provider barcode inside the SIGAPRO guide without fabricating digits", () => {
    expect(guide).toContain('import { QRCodeSVG } from "qrcode.react"');
    expect(guide).toContain("<QRCodeSVG");
    expect(guide).toContain("digits.length >= 40");
    expect(guide).toContain("digits.length <= 48");
    expect(guide).toContain("Interleaved2of5Barcode");
    expect(guide).toContain("ProviderBarcode");
    expect(guide).toContain("dam-barcode-digits");
    expect(guide).not.toContain('return "|||||"');
    expect(guide).toContain("Código bancário ainda não fornecido pelo convênio/API");
  });
});
