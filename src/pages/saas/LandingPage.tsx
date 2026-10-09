import {
  ArrowRight,
  BarChart3,
  BadgeCheck,
  Blocks,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  FileCheck2,
  FileStack,
  Landmark,
  Layers3,
  LayoutPanelTop,
  MessageSquareMore,
  Network,
  ScrollText,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users2,
} from "lucide-react";
import { useLayoutEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { LandingDemoModal } from "@/components/landing/LandingDemoModal";
import { LandingFAQ } from "@/components/landing/LandingFAQ";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingReveal } from "@/components/landing/LandingReveal";
import { LandingSectionTitle } from "@/components/landing/LandingSectionTitle";
import { LandingSEO } from "@/components/landing/LandingSEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { getPublicAssetUrl } from "@/lib/assetUrl";
import { cn } from "@/lib/utils";

const navItems = [
  { id: "como-funciona", label: "Como funciona" },
  { id: "beneficios", label: "Beneficios" },
  { id: "modulos", label: "Modulos" },
  { id: "perfis", label: "Perfis" },
  { id: "diferenciais", label: "Diferenciais" },
  { id: "faq", label: "FAQ" },
  { id: "contato", label: "Contato" },
] as const;

const credibilityItems = [
  {
    title: "Protocolo digital",
    description: "Entrada de projetos, documentos e requerimentos em um fluxo unico.",
    icon: ScrollText,
  },
  {
    title: "Analise organizada",
    description: "Triagem, pareceres e exigencias com leitura mais clara por etapa.",
    icon: SearchCheck,
  },
  {
    title: "Rastreabilidade",
    description: "Historico de status, movimentacoes e decisoes em ambiente institucional.",
    icon: Network,
  },
  {
    title: "Gestao documental",
    description: "Checklist, revisoes e anexos com mais controle para Prefeitura e profissional.",
    icon: FileStack,
  },
] as const;

const processSteps = [
  { title: "Protocolo do projeto", description: "Cadastro do empreendimento e dos responsaveis.", icon: ScrollText },
  { title: "Envio dos documentos", description: "Checklist digital com anexos e conferencias iniciais.", icon: FileStack },
  { title: "Pagamento e validacao", description: "Taxas vinculadas ao processo com controle mais simples.", icon: CreditCard },
  { title: "Analise tecnica", description: "Fila setorial, pareceres e distribuicao interna.", icon: SearchCheck },
  { title: "Comunique-se", description: "Exigencias e ajustes tratados no proprio fluxo.", icon: MessageSquareMore },
  { title: "Aprovacao final", description: "Decisao consolidada com historico e rastreabilidade.", icon: BadgeCheck },
] as const;

const benefits = [
  { title: "Menos papel", description: "Documentos, mensagens e validacoes concentrados em ambiente digital.", icon: FileStack },
  { title: "Mais agilidade", description: "Reduz atritos entre protocolo, financeiro, analise e decisao.", icon: Sparkles },
  { title: "Mais controle", description: "Etapas, usuarios e historico com leitura institucional consistente.", icon: ShieldCheck },
  { title: "Menos retrabalho", description: "Checklist e comunique-se organizam retorno e reapresentacao.", icon: ClipboardCheck },
  { title: "Transparencia operacional", description: "Status, exigencias e andamento acessiveis com mais clareza.", icon: Landmark },
  { title: "Experiencia melhor", description: "Fluxo mais simples para Prefeitura, engenheiros e arquitetos.", icon: Users2 },
] as const;

const features = [
  { title: "Protocolo digital", description: "Abertura completa do processo em ambiente web.", icon: ScrollText },
  { title: "Gestao documental", description: "Checklist, anexos e revisoes por etapa.", icon: FileStack },
  { title: "Controle de taxas", description: "Emissao, acompanhamento e validacao financeira.", icon: CreditCard },
  { title: "Analise tecnica", description: "Pareceres, fila setorial e acompanhamento interno.", icon: SearchCheck },
  { title: "Historico do processo", description: "Linha do tempo com status e movimentacoes.", icon: Network },
  { title: "Comunique-se", description: "Exigencias formais e retorno do profissional.", icon: MessageSquareMore },
  { title: "Multi-tenant municipal", description: "Ambientes separados por Prefeitura com governanca.", icon: Building2 },
  { title: "Painel administrativo", description: "Parametros, usuarios e identidade institucional.", icon: Blocks },
] as const;

const audienceGroups = [
  {
    title: "Para profissionais externos",
    description: "Cadastro, protocolo e acompanhamento online com mais previsibilidade.",
    tone: "light" as const,
    icon: Users2,
    items: [
      "Envio de projeto e documentos em um fluxo claro.",
      "Leitura direta da etapa atual e das exigencias.",
      "Resposta ao comunique-se sem perder contexto.",
      "Historico do processo disponivel para consulta.",
    ],
  },
  {
    title: "Para equipes da Prefeitura",
    description: "Triagem, analise e decisao com mais organizacao institucional.",
    tone: "dark" as const,
    icon: Building2,
    items: [
      "Distribuicao entre setores e fila tecnica organizada.",
      "Controle por municipio, etapa e usuario responsavel.",
      "Pareceres e exigencias registrados no proprio processo.",
      "Mais governanca para atendimento e aprovacao final.",
    ],
  },
] as const;

const differentiators = [
  { title: "Identidade por municipio", description: "A plataforma pode refletir a presenca institucional de cada Prefeitura.", icon: LayoutPanelTop },
  { title: "Fluxo digital completo", description: "Da entrada do projeto ate a decisao final no mesmo ambiente.", icon: Layers3 },
  { title: "Arquitetura escalavel", description: "Base preparada para novas rotinas, modulos e crescimento operacional.", icon: Building2 },
  { title: "Comunicacao estruturada", description: "Mensagens e exigencias vinculadas ao processo, sem dispersao.", icon: MessageSquareMore },
  { title: "Rastreabilidade institucional", description: "Historico de status, pareceres e movimentacoes com mais clareza.", icon: FileCheck2 },
  { title: "Experiencia contemporanea", description: "Interface limpa, objetiva e adequada a operacao publica moderna.", icon: Sparkles },
] as const;

const faqItems = [
  {
    question: "O que e o SIGAPRO?",
    answer:
      "O SIGAPRO e uma plataforma institucional para protocolo, tramitacao, analise e aprovacao de projetos urbanos em ambiente digital.",
  },
  {
    question: "Quem pode utilizar a plataforma?",
    answer:
      "A solucao atende Prefeituras, engenheiros, arquitetos, profissionais externos, equipes tecnicas, protocolo, financeiro e gestores municipais.",
  },
  {
    question: "O sistema atende diferentes Prefeituras?",
    answer:
      "Sim. O produto foi estruturado para operacao multi-tenant, com ambientes e configuracoes organizados por municipio.",
  },
  {
    question: "E possivel acompanhar o processo online?",
    answer:
      "Sim. O andamento pode ser acompanhado por etapa, status, exigencias e historico conforme o perfil de acesso.",
  },
  {
    question: "O envio de documentos e digital?",
    answer:
      "Sim. O protocolo contempla anexos, checklist documental e reapresentacao de arquivos dentro do mesmo fluxo.",
  },
  {
    question: "A analise fica rastreavel?",
    answer:
      "Sim. Pareceres, exigencias, movimentacoes e decisoes permanecem registrados com mais clareza operacional.",
  },
] as const;

const heroPillars = [
  "Da entrada do projeto à decisão final em um único fluxo.",
  "Prefeitura e profissional trabalhando sobre o mesmo processo, com rastreabilidade.",
] as const;

const heroStats = [
  { label: "Operação integrada", value: "Protocolo, documentos, análise, financeiro e decisão." },
  { label: "Gestão municipal", value: "Perfis, regras, identidade, histórico e controle por prefeitura." },
] as const;

const heroExecutiveMetrics = [
  { label: "Operação", value: "Ponta a ponta", helper: "Do protocolo digital ao encerramento do processo." },
  { label: "Perfis", value: "Integrados", helper: "Prefeitura, equipes técnicas e profissionais no mesmo ambiente." },
  { label: "Governança", value: "Rastreável", helper: "Documentos, pareceres, taxas e movimentações registrados." },
] as const;

const heroProductModules = [
  { label: "Dashboard", description: "Visão executiva e prioridades", icon: LayoutPanelTop },
  { label: "Protocolos", description: "Processos e documentos", icon: ScrollText },
  { label: "Análise", description: "Fila técnica e pareceres", icon: SearchCheck },
  { label: "Financeiro", description: "Guias, pagamentos e conciliação", icon: CreditCard, active: true },
  { label: "Gestão", description: "Usuários e configurações", icon: Blocks },
  { label: "Profissional", description: "Protocolo e acompanhamento", icon: Users2 },
] as const;

const heroFinanceTabs = [
  "Visão geral",
  "Guias emitidas",
  "Pagamentos",
  "Conciliação",
  "Tabelas e regras",
  "Workflow financeiro",
  "Histórico",
] as const;

const heroExecutiveFocus = [
  "Fila tecnica com prioridades e responsaveis definidos.",
  "Comunique-se e checklist visiveis no mesmo painel.",
  "Historico recente e leitura operacional consolidada.",
] as const;

const heroStatusBars = [
  { name: "Triagem", total: 34 },
  { name: "Analise", total: 52 },
  { name: "Exigencia", total: 16 },
  { name: "Conclusao", total: 26 },
] as const;

const heroOperationalShare = [
  { name: "Em andamento", value: 58, fill: "#3b82f6" },
  { name: "Concluidos", value: 28, fill: "#22c55e" },
  { name: "Pendencias", value: 14, fill: "#f59e0b" },
] as const;

const heroVolumeTrend = [
  { month: "Jan", total: 42 },
  { month: "Fev", total: 48 },
  { month: "Mar", total: 51 },
  { month: "Abr", total: 57 },
  { month: "Mai", total: 63 },
  { month: "Jun", total: 68 },
] as const;

const heroOperationalHealth = [
  { label: "SLA dentro do prazo", value: "92%", progress: 92, detail: "Etapas tecnicas atendidas no tempo previsto." },
  { label: "Taxas conciliadas", value: "94%", progress: 94, detail: "Leitura financeira sincronizada no fluxo." },
  { label: "Controle de pendencias", value: "81%", progress: 81, detail: "Exigencias com retorno planejado e rastreavel." },
] as const;

const showcaseHighlights = [
  "Dashboard executivo para leitura rápida da operação municipal.",
  "Protocolos, documentos, comunique-se e análise técnica no mesmo fluxo.",
  "Financeiro com guias, pagamentos, conciliação, regras e histórico.",
] as const;

function HeroPanelCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-[116px] min-w-0 flex-col justify-between rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-[0_12px_28px_rgba(15,23,42,0.045)] sm:px-5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-900 sm:text-[15px]">{value}</p>
    </div>
  );
}
function LandingDemoChartCard({
  title,
  description,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex h-full min-w-0 flex-col rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-[0_14px_30px_rgba(15,23,42,0.045)]", className)}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-blue-50 text-blue-800">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-950">{title}</p>
          <p className="mt-1 text-[13px] leading-6 text-slate-600">{description}</p>
        </div>
      </div>
      <div className="mt-4 flex-1">{children}</div>
    </div>
  );
}

export function LandingPage() {
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const heroChartConfig = {
    total: { label: "Volume", color: "#3b82f6" },
    value: { label: "Participacao", color: "#60a5fa" },
  };
  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-slate-900 [font-family:Inter,sans-serif]">
      <LandingSEO faqItems={faqItems} />
      <LandingHeader navItems={navItems} onOpenDemo={() => setDemoModalOpen(true)} />
      <LandingDemoModal open={demoModalOpen} onOpenChange={setDemoModalOpen} />

      <main className="overflow-hidden">
        <section
          id="hero"
          className="relative overflow-hidden border-b border-stone-200/90 bg-[linear-gradient(180deg,#ffffff_0%,#f4f1eb_56%,#ece8e1_100%)] pt-28 sm:pt-32"
        >
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_8%_0%,rgba(15,61,93,0.10),transparent_36%),radial-gradient(circle_at_92%_8%,rgba(16,185,129,0.08),transparent_28%)]" />
            <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:96px_96px]" />
          </div>

          <div className="relative mx-auto max-w-[1660px] px-4 pb-10 sm:px-6 lg:px-7 lg:pb-14 xl:px-8 2xl:px-10">
            <div className="grid gap-7 xl:grid-cols-[minmax(0,0.96fr)_minmax(620px,1.04fr)] xl:items-start xl:gap-8 2xl:gap-10">
              <LandingReveal className="min-w-0 max-w-[780px] pt-2 sm:pt-3 xl:h-full">
                <div className="flex h-full flex-col">
                  <div>
                    <Badge className="rounded-full border border-blue-200 bg-white/92 px-4.5 py-2 text-[10.5px] font-semibold tracking-[0.22em] text-blue-900 shadow-sm hover:bg-white/92">
                      SaaS municipal para aprovação digital de projetos
                    </Badge>

                    <h1 className="sig-public-display mt-6 max-w-[21ch] text-[clamp(2.15rem,4vw,3.55rem)] text-slate-950">
                      A prefeitura aprova projetos com mais controle. O profissional acompanha tudo online.
                    </h1>

                    <p className="mt-6 max-w-[64ch] text-[1.07rem] leading-8 text-slate-600 sm:text-[1.14rem]">
                      O SIGAPRO conecta protocolo, documentos, análise técnica, exigências, pagamentos e aprovação em uma única operação digital — com visão gerencial para a Prefeitura e acompanhamento transparente para o profissional.
                    </p>

                    <div className="mt-9 flex flex-col gap-3.5 sm:flex-row sm:items-center">
                      <Button
                        type="button"
                        size="lg"
                        className="h-13 rounded-full bg-slate-950 px-8 text-[15px] font-semibold shadow-[0_16px_34px_rgba(15,23,42,0.14)] hover:bg-slate-900"
                        onClick={() => setDemoModalOpen(true)}
                      >
                        Solicitar demonstracao
                        <ArrowRight className="h-[18px] w-[18px]" />
                      </Button>
                      <Button
                        asChild
                        size="lg"
                        variant="outline"
                        className="h-13 rounded-full border-slate-300 bg-white/90 px-8 text-[15px] font-semibold text-slate-900 hover:bg-slate-50"
                      >
                        <Link to="/acesso">Acessar sistema</Link>
                      </Button>
                    </div>

                    <div className="mt-9 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(248px,1fr))]">
                      {heroPillars.map((item) => (
                        <div
                          key={item}
                          className="rounded-[22px] border border-white/90 bg-white/92 px-4.5 py-4 shadow-[0_14px_30px_rgba(15,23,42,0.045)]"
                        >
                          <div className="flex items-start gap-3">
                            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                              <CheckCircle2 className="h-4.5 w-4.5" />
                            </span>
                            <p className="text-[14.5px] font-medium leading-6 text-slate-700">{item}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(188px,1fr))]">
                      {heroExecutiveMetrics.map((item) => (
                        <div key={item.label} className="flex min-h-[146px] min-w-0 flex-col rounded-[22px] border border-slate-200 bg-white/94 px-4.5 py-4 shadow-[0_14px_30px_rgba(15,23,42,0.045)] backdrop-blur">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                          <p className="mt-3.5 text-[1.92rem] font-semibold leading-none text-slate-950">{item.value}</p>
                          <p className="mt-3 text-[13px] leading-6 text-slate-600">{item.helper}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {credibilityItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <article
                            key={item.title}
                            className="flex min-h-[136px] min-w-0 flex-col justify-start rounded-[22px] border border-slate-200 bg-white/90 px-4.5 py-4 shadow-[0_12px_26px_rgba(15,23,42,0.04)]"
                          >
                            <div className="flex items-start gap-3">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-blue-50 text-blue-800">
                                <Icon className="h-4.5 w-4.5" />
                              </span>
                              <div className="min-w-0 space-y-1.5 pt-0.5">
                                <p className="text-[14.5px] font-semibold leading-5 text-slate-950">{item.title}</p>
                                <p className="text-[13px] leading-6 text-slate-600">{item.description}</p>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </LandingReveal>

              <LandingReveal delay={0.06} className="min-w-0">
                <div className="mx-auto w-full max-w-[900px] rounded-[38px] border border-slate-200/90 bg-white p-3 shadow-[0_34px_90px_rgba(15,23,42,0.14)] sm:p-4 lg:p-5">
                  <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-[#f6f9fc]">
                    <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-[#123f62] px-4 py-3.5 text-white sm:px-5">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-white shadow-sm">
                          <img
                            src={getPublicAssetUrl("favicon-sigapro.svg")}
                            alt="SIGAPRO"
                            className="h-full w-full object-contain p-[5px]"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold">SIGAPRO Municipal</p>
                          <p className="truncate text-[10px] uppercase tracking-[0.16em] text-sky-100/80">Ambiente institucional</p>
                        </div>
                      </div>
                      <span className="hidden rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-50 sm:inline-flex">
                        Produto real
                      </span>
                    </div>

                    <div className="grid min-h-[560px] lg:grid-cols-[210px_minmax(0,1fr)]">
                      <aside className="border-b border-slate-200 bg-[#0f3d5d] p-3 lg:border-b-0 lg:border-r">
                        <p className="px-3 pb-3 pt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-100/70">
                          Módulos do sistema
                        </p>
                        <div className="space-y-1.5">
                          {heroProductModules.map((module) => {
                            const Icon = module.icon;
                            return (
                              <div
                                key={module.label}
                                className={cn(
                                  "flex items-center gap-3 rounded-[14px] px-3 py-3",
                                  module.active
                                    ? "bg-white text-slate-950 shadow-[0_10px_24px_rgba(2,6,23,0.18)]"
                                    : "text-sky-50/90",
                                )}
                              >
                                <span
                                  className={cn(
                                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]",
                                    module.active ? "bg-blue-50 text-blue-800" : "bg-white/10 text-white",
                                  )}
                                >
                                  <Icon className="h-4 w-4" />
                                </span>
                                <div className="min-w-0">
                                  <p className="text-[12px] font-semibold">{module.label}</p>
                                  <p className={cn("mt-0.5 truncate text-[9px]", module.active ? "text-slate-500" : "text-sky-100/60")}>
                                    {module.description}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </aside>

                      <div className="min-w-0 bg-[#f7f7f5] p-4 sm:p-5">
                        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-700">Financeiro da Prefeitura</p>
                            <h2 className="mt-2 text-[1.35rem] font-semibold tracking-[-0.03em] text-slate-950">Guias, pagamentos e conciliação</h2>
                            <p className="mt-1.5 max-w-[58ch] text-[12px] leading-5 text-slate-500">
                              Estrutura baseada no módulo financeiro existente no SIGAPRO.
                            </p>
                          </div>
                          <span className="w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-semibold text-emerald-800">
                            Operação municipal
                          </span>
                        </div>

                        <div className="mt-4 flex gap-2 overflow-hidden">
                          {heroFinanceTabs.slice(0, 4).map((tab, index) => (
                            <div
                              key={tab}
                              className={cn(
                                "shrink-0 rounded-[12px] border px-3 py-2 text-[10px] font-semibold",
                                index === 0
                                  ? "border-blue-700 bg-blue-700 text-white"
                                  : "border-slate-200 bg-white text-slate-600",
                              )}
                            >
                              {tab}
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {[
                            ["Guias emitidas", "Emissão e consulta", FileCheck2],
                            ["Pagamentos pendentes", "Baixa e confirmação", CreditCard],
                            ["Conciliação", "Retorno e divergências", Network],
                            ["Arrecadação", "Visão consolidada", Landmark],
                          ].map(([title, subtitle, Icon]) => (
                            <div key={String(title)} className="rounded-[18px] border border-slate-200 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-[11px] font-semibold text-slate-950">{String(title)}</p>
                                  <p className="mt-1 text-[10px] leading-4 text-slate-500">{String(subtitle)}</p>
                                </div>
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-blue-50 text-blue-800">
                                  <Icon className="h-4 w-4" />
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
                          <div className="rounded-[18px] border border-slate-200 bg-white p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-[11px] font-semibold text-slate-950">Visão financeira da Prefeitura</p>
                                <p className="mt-1 text-[10px] text-slate-500">Resumo executivo da emissão e dos pagamentos.</p>
                              </div>
                              <Badge className="rounded-full bg-slate-950 px-2.5 py-1 text-[9px] text-white hover:bg-slate-950">DAM / PM</Badge>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2">
                              {["Guias de protocolo", "ISSQN da obra", "Aprovação final"].map((item) => (
                                <div key={item} className="rounded-[12px] border border-slate-200 bg-slate-50 px-2.5 py-3">
                                  <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">{item}</p>
                                  <p className="mt-2 text-[11px] font-semibold text-slate-900">Controle por etapa</p>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="rounded-[18px] border border-slate-200 bg-white p-4">
                            <p className="text-[11px] font-semibold text-slate-950">Fluxo financeiro</p>
                            <div className="mt-3 space-y-2">
                              {["Guia emitida", "Pagamento identificado", "Baixa confirmada", "Histórico registrado"].map((item, index) => (
                                <div key={item} className="flex items-center gap-2.5">
                                  <span className={cn("h-2.5 w-2.5 rounded-full", index < 2 ? "bg-emerald-500" : "bg-slate-300")} />
                                  <span className="text-[10px] font-medium text-slate-600">{item}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <p className="px-2 pb-1 pt-3 text-center text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">
                    Prévia baseada nos módulos e páginas existentes do SIGAPRO
                  </p>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[30px] border border-slate-800 bg-[linear-gradient(145deg,#0b2438_0%,#123f62_58%,#0b2f49_100%)] p-5 text-white shadow-[0_24px_54px_rgba(15,23,42,0.18)] sm:p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-100/75">Operação municipal</p>
                        <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-white">Indicadores que orientam a decisão.</h3>
                      </div>
                      <ShieldCheck className="h-6 w-6 shrink-0 text-sky-200" />
                    </div>
                    <div className="mt-5 grid gap-3">
                      {heroOperationalHealth.map((item) => (
                        <div key={item.label} className="rounded-[18px] border border-white/10 bg-white/[0.07] px-4 py-3.5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[12px] font-medium text-slate-200">{item.label}</span>
                            <span className="text-sm font-semibold text-white">{item.value}</span>
                          </div>
                          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                            <div className="h-full rounded-full bg-white/80" style={{ width: `${item.progress}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[30px] border border-stone-300/80 bg-[#f3efe8] p-5 shadow-[0_20px_44px_rgba(15,23,42,0.08)] sm:p-6">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-500">Fluxo ponta a ponta</p>
                    <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950">Do protocolo à aprovação, sem áreas soltas.</h3>
                    <div className="mt-5 space-y-3">
                      {[
                        ["01", "Protocolo", "Entrada e conferência inicial"],
                        ["02", "Financeiro", "Guia, pagamento e conciliação"],
                        ["03", "Análise", "Pareceres, exigências e retorno"],
                        ["04", "Decisão", "Aprovação e histórico final"],
                      ].map(([step, title, detail]) => (
                        <div key={step} className="flex items-center gap-3 rounded-[18px] border border-stone-300/80 bg-white/75 px-3.5 py-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-[10px] font-semibold text-white">{step}</span>
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-slate-950">{title}</p>
                            <p className="mt-0.5 text-[11px] leading-4 text-slate-600">{detail}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </LandingReveal>
            </div>

            <LandingReveal delay={0.08} className="mt-7 xl:mt-8">
              <div className="grid gap-4.5 xl:grid-cols-12">
                <div className="min-w-0 rounded-[32px] border border-slate-200 bg-white/95 p-5 shadow-[0_20px_46px_rgba(15,23,42,0.06)] backdrop-blur xl:col-span-6">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Visao executiva</p>
                      <p className="mt-2 text-lg font-semibold text-slate-950">Resumo do dashboard institucional</p>
                    </div>
                    <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-900">
                      Operacao diaria
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {heroExecutiveMetrics.map((item) => (
                      <div key={item.label} className="flex min-h-[148px] min-w-0 flex-col rounded-[22px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f5f8fc_100%)] px-4 py-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{item.label}</p>
                        <p className="mt-4 text-[1.7rem] font-semibold leading-none text-slate-950">{item.value}</p>
                        <p className="mt-4 text-[13px] leading-6 text-slate-600">{item.helper}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="min-w-0 rounded-[32px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f7faff_100%)] p-5 shadow-[0_20px_46px_rgba(15,23,42,0.06)] xl:col-span-3">
                  <div className="border-b border-slate-200 pb-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Distribuicao operacional</p>
                    <p className="mt-2 text-[15px] font-semibold text-slate-950">Composicao atual do fluxo municipal.</p>
                  </div>
                  <div className="mt-4 flex flex-col gap-4">
                    <div className="mx-auto w-full max-w-[168px]" data-chart>
                      <ChartContainer config={heroChartConfig} className="w-full" ratio={1} minHeight={138} maxHeight={168}>
                        <PieChart>
                          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                          <Pie
                            data={heroOperationalShare}
                            dataKey="value"
                            nameKey="name"
                            innerRadius="54%"
                            outerRadius="84%"
                            paddingAngle={3}
                            stroke="none"
                          >
                            {heroOperationalShare.map((item) => (
                              <Cell key={item.name} fill={item.fill} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ChartContainer>
                    </div>
                    <div className="min-w-0 space-y-2.5">
                      {heroOperationalShare.map((item) => (
                        <div key={item.name} className="flex items-center justify-between gap-3 rounded-[16px] border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.fill }} />
                            <span className="min-w-0 break-words text-[13px] font-medium text-slate-700">{item.name}</span>
                          </div>
                          <span className="shrink-0 text-[13px] font-semibold text-slate-950">{item.value}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="min-w-0 rounded-[32px] border border-slate-200 bg-white/95 p-5 shadow-[0_20px_46px_rgba(15,23,42,0.06)] xl:col-span-3">
                  <div className="border-b border-slate-200 pb-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Saude operacional</p>
                    <p className="mt-2 text-[15px] font-semibold text-slate-950">Indicadores de estabilidade e ritmo do painel.</p>
                  </div>
                  <div className="mt-4 space-y-4">
                    {heroOperationalHealth.map((item) => (
                      <div key={item.label} className="rounded-[20px] border border-slate-200 bg-slate-50/80 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[12px] font-semibold text-slate-800">{item.label}</p>
                          <span className="text-sm font-semibold text-slate-950">{item.value}</span>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-slate-200">
                          <div
                            className="h-2 rounded-full bg-[linear-gradient(90deg,#2563eb_0%,#60a5fa_100%)]"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                        <p className="mt-3 text-[13px] leading-6 text-slate-600">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <LandingDemoChartCard
                  title="Status dos processos"
                  description="Distribuicao realista das etapas mais acompanhadas no ambiente institucional."
                  icon={BarChart3}
                  className="xl:col-span-5"
                >
                  <div className="min-w-0" data-chart>
                    <ChartContainer config={heroChartConfig} className="w-full" ratio={2.05} minHeight={196} maxHeight={240}>
                      <BarChart data={heroStatusBars} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.35} />
                        <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={10} />
                        <YAxis tickLine={false} axisLine={false} />
                        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                        <Bar dataKey="total" radius={[10, 10, 4, 4]} fill="#3b82f6" />
                      </BarChart>
                    </ChartContainer>
                  </div>
                </LandingDemoChartCard>

                <LandingDemoChartCard
                  title="Evolucao mensal"
                  description="Tendencia simulada de entrada e consolidacao operacional ao longo do semestre."
                  icon={TrendingUp}
                  className="xl:col-span-4"
                >
                  <div className="min-w-0" data-chart>
                    <ChartContainer config={heroChartConfig} className="w-full" ratio={2.05} minHeight={196} maxHeight={240}>
                      <AreaChart data={heroVolumeTrend} margin={{ top: 12, right: 6, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="landingTrendFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.36} />
                            <stop offset="95%" stopColor="#60a5fa" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={10} />
                        <YAxis hide />
                        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                        <Area type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={2.5} fill="url(#landingTrendFill)" />
                      </AreaChart>
                    </ChartContainer>
                  </div>
                </LandingDemoChartCard>

                <div className="min-w-0 rounded-[24px] border border-slate-200 bg-white px-5 py-5 shadow-[0_14px_30px_rgba(15,23,42,0.045)] xl:col-span-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-blue-50 text-blue-800">
                      <CheckCircle2 className="h-4.5 w-4.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-950">Prioridades do painel</p>
                      <p className="mt-1 text-[13px] leading-6 text-slate-600">Bloco complementar para orientar decisao rapida, checklist e acompanhamento institucional.</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {heroExecutiveFocus.map((item) => (
                      <div key={item} className="flex min-w-0 items-start gap-3 rounded-[20px] border border-slate-200 bg-slate-50/70 px-4 py-4">
                        <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-blue-700" />
                        <p className="min-w-0 text-sm leading-6 text-slate-700">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </LandingReveal>
          </div>
        </section>

        <section
          id="como-funciona"
          className="scroll-mt-28 border-y border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f7f7f5_100%)] py-14 sm:py-16 lg:py-18"
        >
          <div className="mx-auto max-w-[1580px] px-4 sm:px-6 lg:px-7 xl:px-8 2xl:px-10">
            <LandingSectionTitle
              eyebrow="Como funciona"
              title="Uma jornada clara do protocolo inicial ate a aprovacao final."
              description="O processo foi apresentado com mais leveza visual para reforcar entendimento rapido, sem excesso de informacao."
            />

            <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {processSteps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <LandingReveal key={step.title} delay={index * 0.04}>
                    <article className="flex h-full min-h-[214px] flex-col rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_42px_rgba(15,23,42,0.045)] sm:px-6 sm:py-6">
                      <div className="flex items-center justify-between">
                        <span className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-blue-50 text-blue-800">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] text-slate-500">
                          0{index + 1}
                        </span>
                      </div>
                      <h3 className="mt-5 max-w-[18ch] text-[1.05rem] font-semibold leading-6 tracking-[-0.02em] text-slate-950 sm:text-[1.1rem]">
                        {step.title}
                      </h3>
                      <p className="mt-3 max-w-[28ch] text-[13.5px] leading-6 text-slate-600">{step.description}</p>
                    </article>
                  </LandingReveal>
                );
              })}
            </div>
          </div>
        </section>

        <section
          id="beneficios"
          className="scroll-mt-28 border-y border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] py-14 sm:py-16 lg:py-20"
        >
          <div className="mx-auto max-w-[1580px] px-4 sm:px-6 lg:px-7 xl:px-8 2xl:px-10">
            <LandingSectionTitle
              eyebrow="Beneficios"
              title="Menos retrabalho, mais previsibilidade e controle sobre cada etapa."
              description="O SIGAPRO organiza a operação para reduzir dispersão de documentos, mensagens e decisões."
            />

            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {benefits.map((item, index) => {
                const Icon = item.icon;
                return (
                  <LandingReveal key={item.title} delay={index * 0.03}>
                    <article
                      className={cn(
                        "flex h-full min-h-[184px] flex-col justify-start rounded-[30px] border border-slate-200 bg-white px-6 py-5 shadow-[0_18px_44px_rgba(15,23,42,0.05)] transition-transform duration-300 hover:-translate-y-0.5 sm:px-7 sm:py-6",
                        index === 0 && "lg:col-span-2",
                      )}
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="mt-5 space-y-2.5">
                        <h3 className="text-xl font-semibold leading-7 text-slate-950">{item.title}</h3>
                        <p className={cn("text-sm leading-7 text-slate-600", index === 0 && "max-w-[44ch]")}>{item.description}</p>
                      </div>
                    </article>
                  </LandingReveal>
                );
              })}
            </div>
          </div>
        </section>

        <section id="modulos" className="scroll-mt-28 py-14 sm:py-16 lg:py-20">
          <div className="mx-auto max-w-[1580px] px-4 sm:px-6 lg:px-7 xl:px-8 2xl:px-10">
            <LandingSectionTitle
              eyebrow="Modulos e recursos"
              title="Módulos para a rotina real da aprovação municipal."
              description="Protocolo, documentos, financeiro, análise, histórico e administração trabalhando no mesmo ambiente."
            />

            <div className="mt-10 grid gap-4 lg:grid-cols-4">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <LandingReveal key={feature.title} delay={index * 0.02}>
                    <article
                      className={cn(
                        "flex h-full min-h-[178px] flex-col justify-start rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-[0_14px_38px_rgba(15,23,42,0.04)] sm:px-6 sm:py-6",
                        index === 0 && "lg:col-span-2",
                      )}
                    >
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-800">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="mt-4 space-y-2.5">
                        <h3 className="text-lg font-semibold leading-6 text-slate-950">{feature.title}</h3>
                        <p className="text-sm leading-7 text-slate-600">{feature.description}</p>
                      </div>
                    </article>
                  </LandingReveal>
                );
              })}
            </div>
          </div>
        </section>

        <section
          id="perfis"
          className="scroll-mt-28 border-y border-slate-200/80 bg-[linear-gradient(180deg,#f8fafc_0%,#f4f4f1_100%)] py-14 sm:py-16 lg:py-20"
        >
          <div className="mx-auto max-w-[1580px] px-4 sm:px-6 lg:px-7 xl:px-8 2xl:px-10">
            <LandingSectionTitle
              eyebrow="Perfis de uso"
              title="Uma plataforma preparada para a rotina da Prefeitura e para a jornada do profissional externo."
              description="A separacao dos perfis foi refinada para reforcar valor de uso sem criar excesso de blocos."
            />

            <div className="mt-12 grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
              {audienceGroups.map((group, index) => {
                const Icon = group.icon;
                return (
                  <LandingReveal key={group.title} delay={index * 0.05}>
                    <article
                      className={cn(
                        "h-full rounded-[32px] border p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-7 lg:p-8",
                        group.tone === "light" ? "border-slate-200 bg-white" : "border-slate-900 bg-slate-950 text-white",
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <span
                          className={cn(
                            "flex h-14 w-14 items-center justify-center rounded-2xl",
                            group.tone === "light" ? "bg-blue-50 text-blue-800" : "bg-white/10 text-white",
                          )}
                        >
                          <Icon className="h-6 w-6" />
                        </span>
                        <div>
                          <h3 className={cn("text-2xl font-semibold tracking-[-0.03em]", group.tone === "light" ? "text-slate-950" : "text-white")}>
                            {group.title}
                          </h3>
                          <p className={cn("mt-2 text-sm leading-7", group.tone === "light" ? "text-slate-600" : "text-slate-300")}>
                            {group.description}
                          </p>
                        </div>
                      </div>

                      <div className="mt-8 space-y-3">
                        {group.items.map((item) => (
                          <div
                            key={item}
                            className={cn(
                              "flex items-start gap-3 rounded-[22px] border px-4 py-4",
                              group.tone === "light" ? "border-slate-200 bg-slate-50/85" : "border-white/10 bg-white/5",
                            )}
                          >
                            <CheckCircle2 className={cn("mt-0.5 h-5 w-5 shrink-0", group.tone === "light" ? "text-blue-800" : "text-sky-300")} />
                            <p className={cn("text-sm leading-6", group.tone === "light" ? "text-slate-700" : "text-slate-200")}>
                              {item}
                            </p>
                          </div>
                        ))}
                      </div>
                    </article>
                  </LandingReveal>
                );
              })}
            </div>
          </div>
        </section>

        <section className="py-14 sm:py-16 lg:py-20">
          <div className="mx-auto grid max-w-[1580px] gap-8 px-4 sm:px-6 xl:grid-cols-[minmax(360px,0.86fr)_minmax(0,1.14fr)] xl:items-center lg:px-7 xl:px-8 2xl:px-10">
            <LandingReveal>
              <div className="max-w-[620px]">
                <LandingSectionTitle
                  eyebrow="Painel do sistema"
                  title="Um sistema que a equipe entende rápido e consegue operar no dia a dia."
                  description="A experiência foi estruturada para dar clareza ao processo, reduzir troca de informações fora do sistema e facilitar a gestão."
                />

                <div className="mt-8 space-y-3">
                  {showcaseHighlights.map((item) => (
                    <div key={item} className="flex items-start gap-3 rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-800" />
                      <p className="text-sm leading-6 text-slate-700">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </LandingReveal>

            <LandingReveal delay={0.06} className="min-w-0">
              <article className="rounded-[34px] border border-slate-200 bg-white p-5 shadow-[0_28px_74px_rgba(15,23,42,0.08)] sm:p-6 lg:p-7">
                <div className="rounded-[28px] border border-slate-200 bg-slate-950 p-5 text-white sm:p-6">
                  <div className="flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Workspace institucional</p>
                      <h2 className="mt-2 text-2xl font-semibold text-white">Operacao urbana em ambiente digital</h2>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200">
                      SIGAPRO
                    </span>
                  </div>

                  <div className="mt-5 grid gap-4">
                    <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
                      <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 sm:p-5">
                        <p className="text-sm font-semibold text-white">Visao do processo</p>
                        <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
                          {[
                            ["Protocolo", "SIG-URB-2026-0184"],
                            ["Etapa atual", "Analise tecnica"],
                            ["Status", "Comunique-se aberto"],
                            ["Setor", "Urbanismo municipal"],
                          ].map(([label, value]) => (
                            <div key={label} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
                              <p className="mt-2 text-sm font-semibold text-white">{value}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 sm:p-5">
                        <p className="text-sm font-semibold text-white">Checklist essencial</p>
                        <div className="mt-4 space-y-3">
                          {["Projeto arquitetonico", "Memorial descritivo", "ART ou RRT"].map((item) => (
                            <div key={item} className="flex items-center gap-3">
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-sky-300" />
                              <span className="text-sm text-slate-200">{item}</span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-5 rounded-[20px] border border-emerald-400/20 bg-emerald-400/10 px-4 py-3">
                          <p className="text-sm font-semibold text-emerald-200">Taxa validada e parecer tecnico registrado.</p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-white/10 bg-white/5 p-4 sm:p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-white">Resumo institucional</p>
                          <p className="mt-2 text-sm leading-6 text-slate-300">
                            Painel com protocolo, taxa, analise, comunique-se e rastreabilidade do fluxo municipal.
                          </p>
                        </div>
                        <ShieldCheck className="mt-1 h-6 w-6 shrink-0 text-sky-300" />
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            </LandingReveal>
          </div>
        </section>

        <section
          id="diferenciais"
          className="scroll-mt-28 border-y border-slate-200/80 bg-[#f8f8f6] py-14 sm:py-16 lg:py-20"
        >
          <div className="mx-auto max-w-[1580px] px-4 sm:px-6 lg:px-7 xl:px-8 2xl:px-10">
            <LandingSectionTitle
              eyebrow="Diferenciais"
              title="Governança municipal sem tornar a operação pesada."
              description="Identidade por prefeitura, perfis de acesso, histórico e comunicação vinculada ao processo."
            />

            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {differentiators.map((item, index) => {
                const Icon = item.icon;
                return (
                  <LandingReveal key={item.title} delay={index * 0.03}>
                    <article
                      className={cn(
                        "flex h-full min-h-[156px] items-start gap-4 rounded-[28px] border border-slate-200 bg-white px-5 py-5 shadow-[0_18px_44px_rgba(15,23,42,0.05)] sm:px-6 sm:py-6",
                        index === 0 && "lg:col-span-2",
                      )}
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="space-y-2">
                        <h3 className="text-lg font-semibold text-slate-950">
                          {item.title}
                        </h3>
                        <p className="text-sm leading-7 text-slate-600">
                          {item.description}
                        </p>
                      </div>
                    </article>
                  </LandingReveal>
                );
              })}
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-28 py-14 sm:py-16 lg:py-20">
          <div className="mx-auto max-w-[1100px] px-4 sm:px-6 lg:px-7">
            <LandingSectionTitle
              eyebrow="Perguntas frequentes"
              title="Dúvidas frequentes antes de levar o SIGAPRO para a operação."
              description="Respostas objetivas sobre uso, perfis, implantação e funcionamento da plataforma."
              align="center"
            />

            <LandingReveal className="mt-10">
              <LandingFAQ items={faqItems} />
            </LandingReveal>
          </div>
        </section>

        <section
          id="contato"
          className="scroll-mt-28 border-t border-slate-200 bg-[linear-gradient(135deg,#0b1f33_0%,#123f62_58%,#0d2f49_100%)] py-16 text-white sm:py-18 lg:py-20"
        >
          <div className="mx-auto grid max-w-[1580px] gap-8 px-4 sm:px-6 xl:grid-cols-[minmax(360px,1fr)_minmax(0,1fr)] xl:items-center lg:px-7 xl:px-8 2xl:px-10">
            <LandingReveal>
              <div className="max-w-[580px]">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Chamada comercial</p>
                <h2 className="mt-4 max-w-[14ch] text-balance text-4xl font-semibold leading-[1.04] tracking-[-0.05em] text-white sm:text-[3.25rem]">
                  Veja o SIGAPRO funcionando com o fluxo da sua Prefeitura.
                </h2>
                <p className="mt-5 max-w-[56ch] text-base leading-8 text-slate-300">
                  Apresentamos a plataforma com foco no processo real do município, nos setores envolvidos e na jornada do profissional externo.
                </p>

                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  {[
                    "Camada publica premium, mais clara e mais elegante.",
                    "Narrativa comercial alinhada a produto institucional.",
                    "Estrutura responsiva com menos ruido visual.",
                    "Leitura semantica consistente para SEO e IA.",
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3 rounded-[22px] border border-white/10 bg-white/5 px-4 py-4">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
                      <p className="text-sm leading-6 text-slate-200">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            </LandingReveal>

            <LandingReveal delay={0.06}>
              <div className="rounded-[34px] border border-white/12 bg-white/[0.07] p-7 shadow-[0_30px_90px_rgba(0,0,0,0.22)] backdrop-blur">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-100/90">Solicitar demonstracao</p>
                <h3 className="mt-3 max-w-[18ch] text-2xl font-semibold text-white">
                  Agende uma demonstração orientada ao seu fluxo municipal.
                </h3>
                <p className="mt-4 text-sm leading-7 text-slate-100/90">
                  Conheça os módulos, valide o fluxo de trabalho e veja como o SIGAPRO pode ser configurado para a sua Prefeitura.
                </p>

                <div className="mt-8 space-y-3">
                  <Button
                    type="button"
                    size="lg"
                    className="h-12 w-full rounded-full bg-white px-6 text-sm font-semibold text-slate-950 hover:bg-slate-100"
                    onClick={() => setDemoModalOpen(true)}
                  >
                    Solicitar demonstracao
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="h-12 w-full rounded-full border-white/15 bg-white/5 px-6 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    <Link to="/acesso">Acessar sistema</Link>
                  </Button>
                </div>

                <div className="mt-8 rounded-[24px] border border-white/14 bg-white/[0.06] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-50">Contato institucional</p>
                  <div className="mt-4 space-y-2 text-sm leading-7">
                    <p className="text-slate-50/95">Apresentação para Prefeituras, diretorias técnicas, protocolo e operação urbana.</p>
                    <p className="text-slate-50/95">Demonstração orientada aos módulos que sua equipe realmente utilizará.</p>
                    <p className="text-slate-100/90">Fluxo recomendado: demonstração, validação de escopo, configuração institucional e implantação.</p>
                  </div>
                </div>
              </div>
            </LandingReveal>
          </div>
        </section>
      </main>

      <LandingFooter navItems={navItems} onOpenDemo={() => setDemoModalOpen(true)} />
    </div>
  );
}
