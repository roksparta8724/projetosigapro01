import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildGuiaRecolhimentoOficialHtml, type GuiaRecolhimentoOficialProps } from "@/components/GuiaRecolhimentoOficial";

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220"><rect x="10" y="10" width="200" height="200" rx="20" fill="#eef4f9" stroke="#23476c" stroke-width="8"/><circle cx="110" cy="85" r="42" fill="#23476c"/><text x="110" y="100" font-family="Arial" font-weight="bold" font-size="38" fill="white" text-anchor="middle">QA</text><text x="110" y="164" font-family="Arial" font-size="20" fill="#23476c" text-anchor="middle">TESTE</text></svg>';
const logo = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");

const sample: GuiaRecolhimentoOficialProps = {
  prefeitura: {
    nome: "PREFEITURA FICTÍCIA — HOMOLOGAÇÃO",
    secretaria: "Documento sintético de teste — NÃO PAGAR",
    logoUrl: logo,
  },
  contribuinte: { nome: "CONTRIBUINTE SINTÉTICO — NÃO PAGAR", numeroCadastro: "QA-00001" },
  guia: {
    numeroGuia: "QA-SEM-COBRANCA-0001",
    dataDocumento: "2026-10-25",
    vencimento: "2026-11-05",
    bankEnvironment: "test",
    paymentProvider: "mercado_pago",
    bankReference: "QA-SOMENTE-IMPRESSAO-SEM-ORDER",
    codigoBarras: "23797991400000200003380260600543513000633330",
    linhaDigitavel: "23793380296060054351030006333303799140000020000",
    valorDocumento: 35.24,
    valorCobrado: 35.24,
    observacao: "MODELO SINTÉTICO DE TESTE — NÃO PAGAR. Nenhuma cobrança foi registrada.",
  },
  itens: [{ ano: 2026, divida: "Simulação de taxa municipal — NÃO PAGAR", principal: 35.24, total: 35.24 }],
};

describe("SIGAPRO — boleto real HTML-to-Chromium Print-to-PDF smoke fixture", () => {
  it("provides A4 portrait, official DAM markup, logo on both halves and non-payable QA warnings", () => {
    const html = buildGuiaRecolhimentoOficialHtml(sample, {
      title: "TESTE QA - PDF DO BOLETO - NAO PAGAR",
      autoPrint: false,
    });
    expect(html).toContain("size: A4 portrait;");
    expect(html).toContain("data-dam-print-button");
    expect(html).toContain('data-dam-payment-mode="boleto-only"');
    expect(html).toContain('class="dam-sheet"');
    expect(html).toContain('class="dam-logo"');
    expect(html).toContain('class="dam-receipt-logo"');
    expect(html.match(/data:image\/svg\+xml;base64,/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("NÃO PAGAR");
    expect(html).not.toContain("window.addEventListener('load', function ()");

    // Explicit opt-in only in the isolated collection QA GitHub workflow.
    // Never write a real customer's document or provider-issued boleto.
    const dir = process.env.SIGAPRO_QA_PDF_OUTPUT_DIR;
    if (dir) {
      const output = resolve(dir);
      if (!output.startsWith("/tmp/sigapro-boleto-qa-"))
        throw new Error("HTML/PDF fixture output must stay in an isolated /tmp QA folder.");
      mkdirSync(output, { recursive: true, mode: 0o700 });
      writeFileSync(join(output, "boleto-homologacao.html"), html, { encoding: "utf8", mode: 0o600 });
    }
  });
});
