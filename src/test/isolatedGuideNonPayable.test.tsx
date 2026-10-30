import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GuiaRecolhimentoOficial, buildGuiaRecolhimentoOficialHtml } from "@/components/GuiaRecolhimentoOficial";
import type { GuiaRecolhimentoOficialProps } from "@/components/GuiaRecolhimentoOficial";

const barcode = "23791684000003000003388060601573644066333333";
const line = "23793388096060157364540663333335168400000300000";
const sample: GuiaRecolhimentoOficialProps = {
  prefeitura: { nome: "PREFEITURA DE EXEMPLO", secretaria: "FINANÇAS" },
  contribuinte: { nome: "CONTRIBUINTE DE TESTE", cpfCnpj: "000.000.000-00", numeroCadastro: "QA-01" },
  guia: {
    numeroGuia: "DAM-PRE-TESTE",
    dataDocumento: "2026-10-22",
    vencimento: "2026-10-24",
    bankName: "Mercado Pago",
    bankEnvironment: "test",
    bankStatus: "processed",
    bankStatusDetail: "accredited",
    bankAuthenticatedAt: "2026-10-22T10:00:00Z",
    bankReference: "ORDER-OLD",
    bankPaymentId: "PAYMENT-OLD",
    paymentProvider: "mercado_pago",
    codigoBarras: barcode,
    linhaDigitavel: line,
    pixPayload: "000201FAKE_PAYABLE_QR",
    qrCodePixUrl: "https://example.com/qr.png",
    nonPayablePreview: true,
    valorDocumento: 35.24,
    valorCobrado: 35.24,
  },
  itens: [{ ano: 2026, divida: "Taxa de protocolo", principal: 35.24, total: 35.24 }],
};

describe("SIGAPRO local QA document is never a bank-issued boleto", () => {
  it("clearly distinguishes preview from registered billing and keeps contributor details", () => {
    const html = buildGuiaRecolhimentoOficialHtml(sample, {autoPrint:false});
    for (const expected of [
      "CONTRIBUINTE DE TESTE",
      "PREFEITURA DE EXEMPLO",
      "35,24",
      "PRÉVIA",
      "NÃO PAGÁVEL",
      "SEM BOLETO REGISTRADO",
      "Nenhuma cobrança foi registrada no banco",
      "NÃO EMITIDA",
      "Não realizada. Prévia de homologação sem pagamento.",
    ]) {
      expect(html).toContain(expected);
    }
    expect(html).not.toContain("Cobrança de teste registrada");
    expect(html).not.toContain("VALIDAÇÃO ELETRÔNICA PELO PROVEDOR DE PAGAMENTO");
  });

  it("does not leak payable fields or forged settlement data into a test PDF", () => {
    const html = buildGuiaRecolhimentoOficialHtml(sample, {autoPrint:false});
    for (const secret of [barcode, line, "ORDER-OLD", "PAYMENT-OLD", "000201FAKE_PAYABLE_QR", "example.com/qr.png"]) {
      expect(html).not.toContain(secret);
    }
    expect(html).not.toContain("PAGAMENTO COMPENSADO");
    expect(html).not.toContain("VALOR TOTAL A PAGAR");
    expect(html).toContain("VALOR REFERENCIAL");
  });

  it("keeps standard non-preview banking behavior unchanged", () => {
    const html = renderToStaticMarkup(<GuiaRecolhimentoOficial {...sample} guia={{
      ...sample.guia,
      nonPayablePreview:false,
      bankStatus:undefined,
      bankStatusDetail:undefined,
      bankAuthenticatedAt:undefined,
    }}/>);
    expect(html).toContain(barcode);
    expect(html).toContain("Homologação Mercado Pago");
    expect(html).not.toContain("SEM BOLETO REGISTRADO");
  });
});
