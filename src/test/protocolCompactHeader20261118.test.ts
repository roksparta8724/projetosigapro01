import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/pages/saas/ProtocolarProjetoPage.tsx", "utf8");
const css = readFileSync("src/styles/sigapro-protocol-intro.css", "utf8");

describe("SIGAPRO — cabeçalho de abertura de protocolo sem card branco vazio", () => {
  it("usa uma única faixa institucional compacta com título, descrição e ações legíveis", () => {
    expect(page).toContain('data-sigapro-protocol-intro="premium-v2"');
    expect(page).toContain('aria-label="Abertura de protocolo"');
    expect(page).toContain('data-protocol-intro-icon="true"');
    expect(page).toContain('data-protocol-intro-eyebrow="true"');
    expect(page).toContain('data-protocol-intro-title="true"');
    expect(page).toContain('data-protocol-intro-description="true"');
    expect(page).toContain('data-protocol-intro-actions="true"');
    expect(page).not.toContain("<PageHero");
    expect(page).not.toContain('import { PageHero } from "@/components/platform/PageHero"');
    expect(page.indexOf('data-sigapro-protocol-intro="premium-v2"')).toBeLessThan(
      page.indexOf("<PageStatsRow"),
    );
  });

  it("não cria falsos indicadores; identifica os modos reais sem ocultar o contexto", () => {
    expect(page).toContain('"Novo protocolo no balcão"');
    expect(page).toContain('"Solicitar Habite-se"');
    expect(page).toContain('"Novo protocolo de projeto"');
    expect(page).toContain('"Revisar rascunho do Habite-se"');
    expect(page).toContain('"Revisar rascunho do projeto"');
    expect(page).toContain('"Cadastro em andamento"');
    expect(page).toContain('"Rascunho em edição"');
    expect(page).toContain('{statusCards.map((item, index) => (');
    expect(page).toContain("remotePreProtocolNumber");
  });

  it("preserva voltar e sair, mas desabilita ambos durante operações em andamento", () => {
    const header = page.slice(
      page.indexOf('data-sigapro-protocol-intro="premium-v2"'),
      page.indexOf("{isExternalFlow ? ("),
    );
    expect(header).toContain("navigate(-1)");
    expect(header).toContain('navigate(isCounterProtocol ? "/prefeitura/protocolos" : "/externo/controle")');
    expect(header.match(/disabled=\{savingDraft \|\| submitting \|\| hasPendingDocumentUpload\}/g)).toHaveLength(2);
    expect(header).toContain("Voltar");
    expect(header).toContain("Sair do protocolo");
  });

  it("impede o cabeçalho branco vazio, garante contraste e responsividade sem afetar outros cards", () => {
    expect(page).toContain('import "@/styles/sigapro-protocol-intro.css"');
    expect(css).toContain('[data-sigapro-protocol-intro="premium-v2"]');
    expect(css).toContain("min-height: 0 !important");
    expect(css).toContain("height: auto !important");
    expect(css).toContain("border-left: 4px solid #2388b5");
    expect(css).toContain("color: #123d59 !important");
    expect(css).toContain("-webkit-text-fill-color: #123d59 !important");
    expect(css).toContain("visibility: visible !important");
    expect(css).toContain("background: linear-gradient(112deg");
    expect(css).toContain("@media (max-width: 520px)");
    expect(css).not.toContain("min-height: 200px");
  });
});
