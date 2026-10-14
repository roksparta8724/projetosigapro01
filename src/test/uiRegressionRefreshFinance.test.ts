import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("regressões visuais e financeiras do SIGAPRO", () => {
  const portal = readFileSync(resolve(process.cwd(), "src/components/platform/PortalFrame.tsx"), "utf8");
  const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
  const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
  const main = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
  const processDetail = readFileSync(resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"), "utf8");
  const protocolDesk = readFileSync(resolve(process.cwd(), "src/pages/saas/ProtocolDeskPage.tsx"), "utf8");
  const analystDesk = readFileSync(resolve(process.cwd(), "src/pages/saas/AnalystDeskPage.tsx"), "utf8");
  const financeProtocols = readFileSync(resolve(process.cwd(), "src/pages/saas/FinanceProtocolsPage.tsx"), "utf8");
  const platform = readFileSync(resolve(process.cwd(), "src/lib/platform.ts"), "utf8");
  const backend = readFileSync(resolve(process.cwd(), "src/integrations/backend/platformImpl.ts"), "utf8");
  const guide = readFileSync(resolve(process.cwd(), "src/components/GuiaRecolhimentoOficial.tsx"), "utf8");

  it("remove o atalho Ctrl K visível da busca", () => {
    expect(portal).not.toContain("Ctrl K");
  });

  it("mostra o organograma real da unidade atual no shell global", () => {
    expect(portal).toContain("departmentOwnershipKey");
    expect(portal).toContain("activeDepartmentOwnership");
    expect(portal).toContain("Organograma municipal");
    expect(portal).toContain("portalOrganizationIdentity.codePath");
    expect(portal).toContain("portalOrganizationIdentity.breadcrumb");
    expect(portal).toContain("Vínculo institucional confirmado no organograma");
    expect(portal).toContain('secretaria: "Administração", diretoria: "Protocolo"');
    expect(portal).toContain('secretaria: "Urbanismo e Obras", diretoria: "Análise Urbanística"');
    expect(portal).toContain('secretaria: "Financeiro", diretoria: "Financeiro"');
    expect(portal).not.toContain(">Diretoria responsável<");
  });

  it("controla o contraste da busca pela superfície real do card", () => {
    expect(portal).toContain('data-theme-family={inverseMainTheme ? "dark" : "light"}');
    expect(css).toContain("Premium search: one source of truth");
    expect(css).not.toContain("Search contrast is intentionally inverted by theme family");
    expect(css).not.toContain("Topbar search contrast hardening");
    expect(css).not.toContain("Search foreground follows the actual search-card surface");
    expect(css).toContain("background: linear-gradient(180deg, #111827 0%, #0b1220 48%, #020617 100%)");
    expect(css).toContain("background: linear-gradient(180deg, #ffffff 0%, #f8fafc 48%, #eef2f7 100%)");
    expect(css).toContain('data-search-surface="dark"');
    expect(css).toContain('data-search-surface="light"');
    expect(css).toContain("color: #ffffff !important");
    expect(css).toContain("stroke: #ffffff !important");
    expect(css).toContain("color: #0f172a !important");
    expect(css).toContain('background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%) !important');
    expect(css).toContain("visibility: visible !important");
    expect(portal).toContain('data-search-surface={inverseMainTheme ? "light" : "dark"}');
    expect(css).toContain('data-search-surface="dark"');
    expect(css).toContain('data-search-surface="light"');
  });

  it("restaura hierarquia visual premium sem perder contraste", () => {
    expect(portal).toContain("topbarFill = darken(primaryColor, -5)");
    expect(portal).toContain("topbarHighlight = darken(primaryColor, -11)");
    expect(css).toContain('background: linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%) !important');
    expect(css).toContain('color: var(--sig-primary-deep) !important');
    expect(portal).toContain("normalizeInstitutionText");
    expect(portal).toContain("Identidade institucional ativa");
  });

  it("não quebra palavras institucionais dentro dos cards em zoom reduzido", () => {
    expect(css).toContain("Professional typography at browser/app zoom");
    expect(css).toContain("word-break: normal !important");
    expect(css).toContain("hyphens: none !important");
    expect(css).toContain("Commercial visual recovery");
    expect(css).toContain("font-size: 0.69rem !important");
  });

  it("mantém F5 nativo sem snapshot congelado nem trava de rolagem", () => {
    expect(main).toContain('window.history.scrollRestoration = "auto"');
    expect(main).not.toContain("window.scrollTo");
    expect(main).not.toContain("persistVisualSnapshot");
    expect(main).not.toContain("restoreFrozenSnapshot");
    expect(html).not.toContain("sigapro-refresh-snapshot");
    expect(processDetail).toContain('nextParams.set("aba", tab)');
    expect(processDetail).toContain("preventScrollReset: true");
  });


  it("não espreme cards de dados em colunas laterais estreitas", () => {
    expect(css).toContain(".sig-responsive-data-grid");
    expect(css).toContain("repeat(auto-fit, minmax(min(100%, 148px), 1fr))");
    expect(protocolDesk).toContain('<div className="sig-responsive-data-grid mt-4">');
    expect(protocolDesk).not.toContain('mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-5');
    expect(analystDesk).toContain('<div className="sig-responsive-data-grid mt-4">');
    expect(analystDesk).not.toContain('mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5');
  });

  it("garante contraste legível também nos cards semânticos claros", () => {
    expect(css).toContain("SIGAPRO RESPONSIVE CARD + CONTRAST AUDIT 2026-10-11");
    expect(css).toContain('[class*="bg-amber-50"]');
    expect(css).toContain('[class*="bg-emerald-50"]');
    expect(css).toContain('[class*="bg-red-50"]');
    expect(css).toContain('[class*="bg-sky-50"]');
    expect(css).toContain("background: rgba(245,158,11,0.10) !important");
    expect(css).toContain("background: rgba(16,185,129,0.10) !important");
    expect(css).toContain("background: rgba(244,63,94,0.10) !important");
    expect(css).toContain("background: rgba(59,130,246,0.10) !important");
    expect(css).toContain("A light surface must never inherit a light foreground");
  });

  it("permite que a unidade de Protocolo confirme recebimento da guia inicial", () => {
    expect(processDetail).toContain("const canProtocolConfirmPayment");
    expect(processDetail).toContain("canProtocolOperate");
    expect(processDetail).toContain('process.triage.status === "concluido"');
    expect(processDetail).toContain('markGuideAsPaid(process.id, session.name, "protocolo")');
    expect(processDetail).toContain("Confirmar pagamento recebido");
    expect(processDetail).toContain('process.status === "pagamento_pendente"');
    expect(protocolDesk).toContain("handleConfirmProtocolPayment");
    expect(protocolDesk).toContain('markGuideAsPaid(process.id, session.name, "protocolo")');
    expect(protocolDesk).toContain("Confirmar pagamento recebido");
  });

  it("não fabrica código bancário ou PIX e preserva a identidade real do emissor da ISSQN", () => {
    expect(processDetail).not.toContain('.padEnd(44, "7")');
    expect(processDetail).not.toContain("const pixPayload");
    expect(processDetail).toContain('codigoBarras: ""');
    expect(processDetail).toContain('linhaDigitavel: ""');
    expect(guide).toContain("Sem linha digitável oficial");
    expect(guide).toContain("Não há linha digitável nem PIX oficial nesta via");
    expect(platform).toContain("canFollowUpIssuedIssGuide");
    expect(platform).toContain("audit.actorProfileId === session.id");
    expect(backend).toContain("actorProfileId: entry.actor_profile_id ?? undefined");
    expect(backend).toContain('db.rpc("list_municipal_departments_v1"');
  });

  it("não deixa referência quebrada na rota de protocolos financeiros", () => {
    expect(financeProtocols).not.toContain("FinanceSectionNav");
    expect(financeProtocols).toContain("Voltar ao Financeiro");
  });
});
