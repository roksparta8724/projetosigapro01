import { describe, expect, it } from "vitest";
import { buildGuiaRecolhimentoOficialHtml } from "@/components/GuiaRecolhimentoOficial";

const baseProps = {
  prefeitura: {
    nome: "Prefeitura de Campo Limpo Paulista",
    secretaria: "Secretaria de Desenvolvimento Urbano, Habitação e Meio Ambiente",
    endereco: "Avenida Adherbal da Costa Moreira, 255",
    cidade: "Campo Limpo Paulista",
    uf: "SP",
    telefone: "1140388300",
    logoUrl: "https://example.com/brasao.png",
    cadastroTitulo: "Cadastro Eventual",
  },
  contribuinte: {
    nome: "Contribuinte Teste",
    cpfCnpj: "***6659",
    endereco: "Rua Cristóvão Colombo, 211",
    numeroCadastro: "156322-89",
  },
  guia: {
    numeroGuia: "DAM-ISS-2026-00002",
    exercicio: "2026",
    dataDocumento: "2026-10-13",
    vencimento: "2026-10-20",
    funcionarioResponsavel: "Jonatas Rodrigues",
    referencia: "ISSQN / Projeto",
    observacao: "Documento de arrecadação municipal.",
    valorDocumento: 300,
    descontos: 0,
    outrosAcrescimos: 0,
    valorCobrado: 300,
    linhaDigitavel: "237933802966601057305440603333035168460000030000",
    codigoBarras: "237951684600000300033802666010573044060333303500",
    pixPayload: "00020126560014BR.GOV.BCB.PIX0134financeiro@example.com5204000053039865406300.005802BR5918PREFEITURA TESTE6009SAO PAULO62070503***6304ABCD",
    bankName: "Mercado Pago",
    bankInstructions: "Pagamento pelos canais oficiais.",
  },
  itens: [
    {
      ano: "2026",
      divida: "Guia de Recolhimento de ISSQN da Obra",
      tabela: "DAM",
      sb: "",
      pc: "",
      principal: 300,
      multa: 0,
      juros: 0,
      correcao: 0,
      total: 300,
    },
  ],
};

describe("GuiaRecolhimentoOficial", () => {
  it("renders the municipal logo, official digitable line and provider barcode in one DAM", () => {
    const html = buildGuiaRecolhimentoOficialHtml(baseProps, {
      autoPrint: false,
    });

    expect(html).toContain("https://example.com/brasao.png");
    expect(html).toContain("237933802966 601057305440 603333035168 460000030000");
    expect(html).toContain('class="dam-barcode-svg"');
    expect(html).toContain('aria-label="Código de barras bancário"');
    expect(html).not.toContain("Sem linha digitável oficial");
    expect(html).not.toContain("Código bancário ainda não fornecido");
    expect(html).toContain("#0f3557");
  });

  it("never injects a broken external logo fallback when the embedded crest is unavailable", () => {
    const html = buildGuiaRecolhimentoOficialHtml(
      {
        ...baseProps,
        prefeitura: {
          ...baseProps.prefeitura,
          logoUrl: "",
        },
      },
      { autoPrint: false },
    );

    expect(html).not.toContain("upload.wikimedia.org");
    expect(html).toContain('class="dam-logo-fallback"');
    expect(html).toContain(">PM<");
  });

  it("binds the print/save PDF button in the static HTML document", () => {
    const html = buildGuiaRecolhimentoOficialHtml(baseProps, {
      autoPrint: false,
    });

    expect(html).toContain('data-dam-print-button="true"');
    expect(html).toContain("bindDamPrint");
    expect(html).toContain("window.print()");
  });

  it("keeps guide metadata on one line and aligns the receipt header with the body grid", () => {
    const html = buildGuiaRecolhimentoOficialHtml(baseProps, {
      autoPrint: false,
    });

    expect(html).toContain("DAM-ISS-2026-00002");
    expect(html).toContain("grid-template-columns: 22mm minmax(0, 1fr) 58mm");
    expect(html).toContain("grid-template-columns: 22mm minmax(0, 1fr)");
    expect(html).toContain("white-space: nowrap");
    expect(html).toContain("overflow-wrap: normal");
    expect(html).not.toContain("word-break: break-word");
  });
});
