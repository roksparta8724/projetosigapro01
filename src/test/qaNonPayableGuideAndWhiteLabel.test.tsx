import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildGuiaRecolhimentoOficialHtml,
  type GuiaRecolhimentoOficialProps,
} from "@/components/GuiaRecolhimentoOficial";
import { isSyntheticQaProtocolGuideCode } from "@/lib/qaPaymentEvidence";

const qaCode="QA-FICTICIA-SEM-COBRANCA-20261024";
const guide:GuiaRecolhimentoOficialProps={
  prefeitura:{nome:"Prefeitura de Campo Limpo Paulista",secretaria:"Setor de Protocolo",
    endereco:"Endereço municipal cadastrado",telefone:""},
  contribuinte:{nome:"Proprietário fictício QA04",cpfCnpj:"000.000.000-00",
    endereco:"Rua declarada no processo",numeroCadastro:"PM-2026-00004"},
  guia:{numeroGuia:qaCode,exercicio:"2026",
    dataDocumento:"2026-10-24T16:29:26.887Z",vencimento:"2026-11-24",
    observacao:"DOCUMENTO FICTÍCIO DE HOMOLOGAÇÃO. NÃO PAGAR.",
    proprietario:"Proprietário fictício QA04",
    profissionalResponsavel:"Responsável técnico declarado",
    nonPayablePreview:true,paymentProvider:"manual",bankEnvironment:"test",bankName:"",
    pixPayload:"",codigoBarras:"",linhaDigitavel:"",qrCodePixUrl:"",
    valorDocumento:0,valorCobrado:0},
  itens:[{ano:"2026",divida:"Prévia administrativa sem cobrança",
    tabela:"QA - NÃO PAGAR",principal:0,total:0}],
};

describe("SIGAPRO QA — prévia da guia fictícia sem movimentação financeira",()=>{
  it("a guia de ensaio com valor zero abre pelo renderizador local sem buscar banco/PIX/R2",()=>{
    const s=readFileSync("src/pages/saas/ProcessDetailPage.tsx","utf8");
    const begin=s.indexOf('if (import.meta.env.VITE_SIGAPRO_NEON_ISOLATED === "true" &&');
    const end=s.indexOf('const reservedGuideWindow = reserveGuiaRecolhimentoOficialWindow(',begin);
    expect(begin).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(begin);
    const fixture=s.slice(begin,end);
    expect(fixture).toContain('isSyntheticQaProtocolGuideCode(selectedGuide.code)');
    expect(fixture).toContain('selectedGuide.kind === "protocolo"');
    expect(fixture).toContain('Number(selectedGuide.amount) === 0');
    expect(fixture).toContain("openGuiaRecolhimentoOficialWindow(preview,");
    expect(fixture).toContain("nonPayablePreview: true");
    expect(fixture).toContain("valorCobrado: 0");
    expect(fixture).toContain("return;");
    expect(fixture).not.toContain("ensureMercadoPagoGuideCharge");
    expect(fixture).not.toContain("readGuideOriginal");
    expect(fixture).not.toContain("archiveAndOpenGuide");
    expect(isSyntheticQaProtocolGuideCode(qaCode)).toBe(true);
    expect(isSyntheticQaProtocolGuideCode("DAM-REAL-2026")).toBe(false);
  });
  it("exibe os dados reais declarados do processo, mas nenhum meio de cobrança",()=>{
    const html=buildGuiaRecolhimentoOficialHtml(guide,{autoPrint:false});
    expect(html).toContain("Prefeitura de Campo Limpo Paulista");
    expect(html).toContain("Proprietário fictício QA04");
    expect(html).toContain("Responsável técnico declarado");
    expect(html).toContain(qaCode);
    expect(html).toContain("NÃO EMITIDA");
    expect(html).toContain("Prévia administrativa");
    expect(html).toContain("sem integração bancária");
    expect(html).toContain("NÃO PAGAR");
    expect(html).not.toContain('aria-label="Código de barras bancário"');
    expect(html).not.toContain("data:image/svg+xml;base64");
    expect(html).not.toContain("0002012656");
  });
  it("a janela documental dispensa voltar, mas rota normal preserva navegação",()=>{
    const process=readFileSync("src/pages/saas/ProcessDetailPage.tsx","utf8");
    const reader=readFileSync("src/pages/saas/DocumentAnalysisPage.tsx","utf8");
    expect(process).toContain("janela=1");
    expect(reader).toContain('searchParams.get("janela") !== "1"');
    expect(reader).toContain("Voltar ao processo");
  });
  it("interface mantém a marca SIGAPRO e identifica o prestador apenas na privacidade",()=>{
    const ui=readFileSync("src/components/platform/ArchitecturalPdfAiPanel.tsx","utf8");
    const acceptance=ui.slice(ui.indexOf('data-sigapro-ai-consent-card="true"'),
      ui.indexOf('data-sigapro-ai-processor-disclosure="true"'));
    expect(acceptance).toContain("Processamento externo autorizado");
    expect(acceptance).not.toContain("Anthropic Claude");
    expect(acceptance).not.toContain("OpenAI API");
    const privacy=ui.slice(ui.indexOf('data-sigapro-ai-processor-disclosure="true"'),
      ui.indexOf('data-sigapro-ai-no-external-transfer="true"'));
    expect(privacy).toContain("Prestador externo selecionado");
    expect(privacy).toContain('"Anthropic"');
    expect(ui).toContain("Leitura Local · Grátis");
  });
});
