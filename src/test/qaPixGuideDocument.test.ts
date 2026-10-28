import { describe, expect, it } from "vitest";
import { buildGuiaRecolhimentoOficialHtml, type GuiaRecolhimentoOficialProps } from "../components/GuiaRecolhimentoOficial";
import { buildPixPayload } from "../lib/pix";

const pix=buildPixPayload({
 key:"qa-sandbox@example.invalid",merchantName:"PREFEITURA QA",merchantCity:"CAMPOLIMPO",
 amount:1,txid:"PIX-QA-ONLY",
});
if(!pix)throw new Error("Synthetic QA PIX fixture not generated");

function doc(opts:Partial<GuiaRecolhimentoOficialProps["guia"]>={}): GuiaRecolhimentoOficialProps {
 return {
  prefeitura:{nome:"Prefeitura Municipal — QA"},
  contribuinte:{nome:"HOMOLOGAÇÃO — NÃO É CONTRIBUINTE"},
  guia:{
   numeroGuia:"DAM-PRE-QA-20261028-PIXHMLG2",
   dataDocumento:"2026-10-28T00:12:32.000Z",vencimento:"2026-11-04",
   bankEnvironment:"test",paymentProvider:"mercado_pago",
   nonPayablePreview:false,qaSandboxPixPayload:pix,
   bankName:"Mercado Pago — PIX de TESTE",bankReference:"ORDER_QA_FAKE",
   bankPaymentId:"PAY_QA_FAKE",bankStatus:"action_required",
   bankInstructions:"PIX sandbox. Não pagar.",valorDocumento:1,valorCobrado:1,
   ...opts,
  },
  itens:[{ano:2026,divida:"Guia de protocolo QA",principal:1,total:1}],
 };
}

describe("QA DAM PIX preview from the provider ledger",()=>{
 it("renders a valid sandbox QR without reporting that a boleto exists",()=>{
  const html=buildGuiaRecolhimentoOficialHtml(doc(),{autoPrint:false});
  expect(html).toContain('data-dam-pix="sandbox"');
  expect(html).toContain("PIX DE HOMOLOGAÇÃO");
  expect(html).toContain("BOLETO NÃO EMITIDO");
  expect(html).toContain("NÃO PAGAR");
  expect(html).toContain("ORDER_QA_FAKE");
  expect(html).toContain("PAY_QA_FAKE");
  expect(html).not.toContain("Nenhuma cobrança foi registrada no provedor");
  expect(html).not.toContain("BOLETO EMITIDO NO AMBIENTE DE TESTES");
  expect(html).not.toContain("VALOR DO BOLETO DE TESTE");
 });
 it("does not expose a payable PIX in a non-payable administrative preview",()=>{
  const html=buildGuiaRecolhimentoOficialHtml(doc({nonPayablePreview:true}),{autoPrint:false});
  expect(html).not.toContain('data-dam-pix="sandbox"');
  expect(html).toContain("NÃO EMITIDA");
  expect(html).toContain("SEM COBRANÇA BANCÁRIA");
 });
 it("never exposes the QA QR on a production bank document",()=>{
  const html=buildGuiaRecolhimentoOficialHtml(doc({bankEnvironment:"production"}),{autoPrint:false});
  expect(html).not.toContain('data-dam-pix="sandbox"');
  expect(html).not.toContain(pix);
 });
});