import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildGuiaRecolhimentoOficialHtml, type GuiaRecolhimentoOficialProps } from "@/components/GuiaRecolhimentoOficial";

// The user-provided municipal crest is embedded locally. QA never reads
// official R2; both the printed original and receipt must show this same image.
const crestBytes = readFileSync("public/qa-branding/campo-limpo-paulista.webp");
if (crestBytes.byteLength !== 4106 || crestBytes.toString("ascii", 0, 4) !== "RIFF" ||
    crestBytes.toString("ascii", 8, 12) !== "WEBP") {
  throw new Error("QA municipal crest missing or invalid");
}
const logo = "data:image/webp;base64," + crestBytes.toString("base64");

const sample: GuiaRecolhimentoOficialProps = {
  prefeitura: {
    nome: "PREFEITURA DE CAMPO LIMPO PAULISTA — HOMOLOGAÇÃO",
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
    expect(html.match(/data:image\/webp;base64,/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain(crestBytes.toString("base64"));
    expect(html).toContain("CAMPO LIMPO PAULISTA");
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
