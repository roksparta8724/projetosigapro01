import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("guide opening experience", () => {
  it("uses barcode and digitable line from the same provider charge for unpaid guides", () => {
    expect(processDetail).toContain("providerCharge\n        ? providerCharge.digitableLine");
    expect(processDetail).toContain("providerCharge\n        ? providerCharge.barcodeContent");
    expect(processDetail).toContain("codigoBarras: historicalPaidGuide ? undefined : barcode");
    expect(processDetail).toContain("linhaDigitavel: historicalPaidGuide ? undefined : digitableLine");
  });

  it("never creates a fresh provider charge while viewing a compensated historical guide", () => {
    expect(processDetail).toContain('if (guide.status === "compensada") continue;');
    expect(processDetail).toContain('const historicalPaidGuide = selectedGuide.status === "compensada"');
    expect(processDetail).toContain("historicalPaidGuide\n      ? null");
    expect(processDetail).toContain("Documento histórico quitado; data de emissão e baixa preservadas");
  });


  it("renders a compensated guide as a non-payable historical receipt", () => {
    const guide = read("src/components/GuiaRecolhimentoOficial.tsx");
    const external = read("src/pages/saas/ExternalPaymentsPage.tsx");

    expect(processDetail).toContain("pixPayload: historicalPaidGuide ? undefined : banking.pixPayload");
    expect(processDetail).toContain("historicalPaid: historicalPaidGuide");
    expect(guide).toContain("Pagamento já compensado — meios de pagamento desativados nesta via histórica.");
    expect(guide).toContain("DOCUMENTO QUITADO. Não efetue novo pagamento.");
    expect(guide).toContain("Desativada — guia já compensada.");
    expect(external).toContain('const historicalPaidGuide = guide.status === "compensada"');
    expect(external).toContain("historicalPaidGuide || (banking.barcode && banking.digitableLine)");
    expect(external).toContain("pixPayload: historicalPaidGuide ? undefined : banking.pixPayload");
    expect(external).toContain("historicalPaid: historicalPaidGuide");
  });

  it("never exposes an intermediary preparation document", () => {
    const guide = read("src/components/GuiaRecolhimentoOficial.tsx");

    expect(guide).not.toContain("Preparando a Guia de Recolhimento");
    expect(guide).not.toContain("Validando os dados da Prefeitura");
    expect(guide).not.toContain("reserveGuiaRecolhimentoWindow");
    expect(guide).not.toContain("loading-card");
    expect(guide).toContain("URL.createObjectURL");
    expect(guide).toContain('window.open(previewUrl, "_blank")');
  });

  it("prepares banking and logo data inside SIGAPRO before the user opens the DAM", () => {
    const processPage = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(processPage).toContain("preparedGuideCharges");
    expect(processPage).toContain("preparedGuideLogoUrl");
    expect(processPage).toContain("ensureMercadoPagoGuideCharge");
    expect(processPage).toContain('setGuideBillingBusyKey("preparing-guides")');
    expect(processPage).not.toContain("showGuiaRecolhimentoError");
    expect(processPage).not.toContain("reserveGuiaRecolhimentoWindow");
  });

  it("keeps the official guide immutable after issue and persists provider banking data", () => {
    const processPage = read("src/pages/saas/ProcessDetailPage.tsx");
    const mercadoApi = read("api/mercadopago.ts");
    const migration = read("supabase/migrations/20261019134500_persist_payment_guide_provider_charge.sql");

    expect(processPage).toContain('const issuedAt = String(selectedGuide.issuedAt || "").trim()');
    expect(processPage).not.toContain("selectedGuide.issuedAt || new Date().toISOString()");
    expect(processPage).toContain("não substituirá essa data pela data de hoje");
    expect(mercadoApi).toContain("persist_payment_guide_provider_charge_v1");
    expect(migration).toContain("provider_charge_saved_at");
    expect(migration).toContain("digitable_line");
    expect(migration).toContain("barcode");
    expect(migration).toContain("bank_reference");
  });

  it("prints the DAM at a controlled A4 visual scale instead of oversized content", () => {
    const guide = read("src/components/GuiaRecolhimentoOficial.tsx");

    expect(guide).toContain(".dam-root {");
    expect(guide).toContain("zoom: 0.90;");
    expect(guide).toContain("width: 111.111%;");
    expect(guide).toContain("transform-origin: top center;");
    expect(guide).toContain("@media print");
  });
});
