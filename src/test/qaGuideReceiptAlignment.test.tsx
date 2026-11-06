import { describe, expect, it } from "vitest";
import {
  buildGuiaRecolhimentoOficialHtml,
  type GuiaRecolhimentoOficialProps,
} from "@/components/GuiaRecolhimentoOficial";

const qaCode = "QA-FICTICIA-SEM-COBRANCA-20261024";
const guide: GuiaRecolhimentoOficialProps = {
  prefeitura:{
    nome:"Prefeitura de Campo Limpo Paulista",
    secretaria:"Secretaria Municipal",
    endereco:"Avenida Adherbal da Costa Moreira, 255",
    telefone:"",
  },
  contribuinte:{
    nome:"Proprietário fictício para QA de impressão",
    cpfCnpj:"000.000.000-00",
    endereco:"Endereço de ensaio - Rua das Flores, 100",
    numeroCadastro:"PM-2026-00004",
  },
  guia:{
    numeroGuia:qaCode,
    exercicio:"2026",
    dataDocumento:"2026-10-24T16:29:26.887Z",
    vencimento:"2026-11-24",
    observacao:"DOCUMENTO FICTÍCIO DE HOMOLOGAÇÃO. NÃO PAGAR.",
    nonPayablePreview:true,
    bankEnvironment:"test",
    paymentProvider:"manual",
    pixPayload:"",
    qrCodePixUrl:"",
    linhaDigitavel:"",
    codigoBarras:"",
    valorDocumento:0,
    valorCobrado:0,
  },
  itens:[{
    ano:"2026",divida:"Prévia administrativa sem cobrança",
    tabela:"QA - NÃO PAGAR",principal:0,total:0,
  }],
};

describe("Guia de homologação A4 — alinhamento de linhas e bordas",()=>{
  it("imprime seis linhas compartilhadas, sem duas grades independentes",()=>{
    const html=buildGuiaRecolhimentoOficialHtml(guide,{autoPrint:false});
    const start=html.indexOf('data-dam-receipt-aligned-grid="true"');
    const end=html.indexOf('class="dam-bottom-section"',start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const receipt=html.slice(start,end);
    expect(receipt.match(/class="dam-receipt-body-row"/g)).toHaveLength(6);
    expect(receipt.match(/class="dam-receipt-body-left"/g)).toHaveLength(6);
    expect(receipt.match(/class="dam-receipt-body-right"/g)).toHaveLength(6);
    expect(receipt).not.toContain('class="dam-receipt-left"');
    expect(receipt).toContain("Nº do Cadastro");
    expect(receipt).toContain("Valor Doc.");
    expect(receipt).toContain("Natureza");
    expect(receipt).toContain("(=) Valor");
    expect(receipt).toContain("dam-receipt-extras-left");
    expect(receipt).toContain("dam-receipt-extras-right");
  });
  it("usa a mesma malha de colunas no cabeçalho e nas linhas dos valores",()=>{
    const html=buildGuiaRecolhimentoOficialHtml(guide,{autoPrint:false});
    expect(html).toMatch(/\.dam-receipt-body-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*58mm/);
    expect(html).toMatch(/\.dam-receipt-header\s*\{[^}]*grid-template-columns:\s*28mm minmax\(0,\s*1fr\) 58mm/);
    expect(html).toMatch(/\.dam-receipt-body-right\s*\{[^}]*grid-template-columns:\s*26mm minmax\(0,\s*1fr\)/);
    expect(html).toMatch(/\.dam-receipt-right \.dam-receipt-row\s*\{[^}]*grid-template-columns:\s*26mm minmax\(0,\s*1fr\)/);
    expect(html).toMatch(/\.dam-receipt-body-left\s*\{[^}]*border-right:\s*1px solid #000000/);
    expect(html).toMatch(/\.dam-receipt-body-row\s*\{[^}]*border-bottom:\s*1px solid #000000/);
    expect(html).toContain("overflow-wrap: anywhere;");
    expect(html).toContain("break-inside: avoid;");
  });
  it("não recorta o código longo da guia nem cria boleto na prévia",()=>{
    const html=buildGuiaRecolhimentoOficialHtml(guide,{autoPrint:false});
    expect(html).toContain(qaCode);
    expect(html).toContain("NÃO EMITIDA");
    expect(html).toContain("NÃO PAGAR");
    expect(html).not.toContain('aria-label="Código de barras bancário"');
    expect(html).not.toContain('data-dam-pix="official-payload"');
    expect(html).not.toContain('data-dam-pix="sandbox"');
    expect(html).toMatch(/\.dam-receipt-right \.dam-receipt-row-value\s*\{[^}]*white-space:\s*normal/);
  });
});
