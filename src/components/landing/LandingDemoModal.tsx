import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Headphones,
  Layers3,
  Loader2,
  MessageSquareMore,
  SearchCheck,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveDemoContactRequest } from "@/integrations/supabase/platform";

type LandingDemoModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const stageItems = [
  { title: "Protocolo recebido", description: "Cadastro técnico validado na entrada institucional.", status: "done" as const },
  { title: "Taxa validada", description: "Conciliação financeira vinculada ao processo.", status: "done" as const },
  { title: "Análise técnica", description: "Equipe de urbanismo em leitura ativa do projeto.", status: "active" as const },
] as const;

const projectFacts = [
  { label: "Protocolo", value: "SIG-2026-0148" },
  { label: "Empreendimento", value: "Centro comercial Horizonte" },
  { label: "Responsável", value: "Arq. Marina Almeida" },
  { label: "Setor atual", value: "Urbanismo municipal" },
] as const;

const checklistItems = [
  { label: "Projeto arquitetônico", status: "Validado" },
  { label: "Memorial descritivo", status: "Conferido" },
  { label: "ART / RRT", status: "Em análise" },
  { label: "Levantamento planialtimétrico", status: "Recebido" },
] as const;

const statusBars = [
  { label: "Triagem", value: 100 },
  { label: "Taxa", value: 100 },
  { label: "Análise", value: 72 },
] as const;

const statusDistribution = [
  { name: "Em análise", value: 52, fill: "#3b82f6" },
  { name: "Aguardando retorno", value: 18, fill: "#f59e0b" },
  { name: "Concluídos", value: 30, fill: "#22c55e" },
] as const;

const operationalBars = [
  { name: "Protocolados", total: 84 },
  { name: "Validados", total: 68 },
  { name: "Em análise", total: 52 },
  { name: "Concluídos", total: 30 },
] as const;

const demoChartConfig = {
  total: { label: "Volume", color: "#3b82f6" },
  value: { label: "Participação", color: "#93c5fd" },
};

const initialContactForm = {
  fullName: "",
  email: "",
  phone: "",
  organization: "",
  roleTitle: "",
  message: "",
};

export function LandingDemoModal({ open, onOpenChange }: LandingDemoModalProps) {
  const [contactOpen, setContactOpen] = useState(false);
  const [contactForm, setContactForm] = useState(initialContactForm);
  const [contactStatus, setContactStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [contactError, setContactError] = useState("");

  const updateContactField = (field: keyof typeof initialContactForm, value: string) => {
    setContactForm((current) => ({ ...current, [field]: value }));
    if (contactStatus === "error") {
      setContactStatus("idle");
      setContactError("");
    }
  };

  const handleContactSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const payload = {
      fullName: contactForm.fullName.trim(),
      email: contactForm.email.trim().toLowerCase(),
      phone: contactForm.phone.trim(),
      organization: contactForm.organization.trim(),
      roleTitle: contactForm.roleTitle.trim(),
      message: contactForm.message.trim(),
      origin: "demo_modal_contact",
      interest: "apresentacao_sigapro",
    };

    if (!payload.fullName || !payload.email || !payload.phone || !payload.organization || !payload.roleTitle) {
      setContactStatus("error");
      setContactError("Preencha os campos obrigatorios para solicitar o contato comercial.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      setContactStatus("error");
      setContactError("Informe um e-mail institucional valido.");
      return;
    }

    setContactStatus("sending");
    setContactError("");

    try {
      await saveDemoContactRequest(payload);
      setContactStatus("success");
      setContactForm(initialContactForm);
    } catch (error) {
      setContactStatus("error");
      setContactError(error instanceof Error ? error.message : "Nao foi possivel enviar a solicitacao agora.");
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(80vw,1320px)] max-w-none overflow-hidden border-white/70 bg-[linear-gradient(180deg,rgba(249,251,255,0.98)_0%,rgba(238,244,252,0.98)_100%)] p-0 shadow-[0_36px_120px_rgba(15,23,42,0.28)] sm:rounded-[32px]">
        <div className="max-h-[88vh] overflow-y-auto">
          <div className="border-b border-slate-200/80 bg-[linear-gradient(135deg,#0f1c2f_0%,#18304f_54%,#24456d_100%)] px-6 py-6 text-white sm:px-8 sm:py-7 lg:px-10">
            <DialogHeader className="space-y-3 text-left">
              <Badge className="w-fit rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-100 hover:bg-white/10">
                Demonstração guiada
              </Badge>
              <DialogTitle className="max-w-[22ch] text-balance text-[1.9rem] font-semibold leading-tight tracking-[-0.04em] text-white sm:text-[2.25rem]">
                Demonstração do sistema SIGAPRO
              </DialogTitle>
              <DialogDescription className="max-w-[68ch] text-sm leading-7 text-slate-200 sm:text-[15px]">
                Painel institucional simulado com protocolo, checklist documental, leitura visual de status e indicadores operacionais para apresentar a experiência do produto.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-6 px-6 py-6 sm:px-8 sm:py-8 lg:px-10">
            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
              <article className="min-w-0 rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_16px_42px_rgba(15,23,42,0.06)] sm:p-6">
                <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Protocolo exemplo</p>
                    <h3 className="mt-2 text-[1.55rem] font-semibold tracking-[-0.03em] text-slate-950">SIG-2026-0148</h3>
                    <p className="mt-2 max-w-[60ch] text-sm leading-7 text-slate-600">
                      Processo institucional de demonstração para aprovação de projeto comercial com leitura premium de etapas, documentos e situação operacional.
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Badge className="rounded-full bg-blue-50 px-3 py-1 text-blue-800 hover:bg-blue-50">Em análise</Badge>
                    <Badge className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 hover:bg-emerald-50">Conta institucional</Badge>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
                  {projectFacts.map((item) => (
                    <div key={item.label} className="min-w-0 rounded-[22px] border border-slate-200 bg-slate-50/85 px-4 py-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
                      <p className="mt-2 break-words text-sm font-semibold leading-6 text-slate-900">{item.value}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_16px_42px_rgba(15,23,42,0.06)] sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-blue-50 text-blue-800">
                    <SearchCheck className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-950">Status visual</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">Leitura rápida de avanço por bloco operacional do fluxo.</p>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  {statusBars.map((item) => (
                    <div key={item.label}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-slate-500">{item.label}</p>
                        <span className="text-sm font-semibold text-slate-900">{item.value}%</span>
                      </div>
                      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full bg-[linear-gradient(90deg,#2563eb_0%,#60a5fa_100%)]" style={{ width: `${item.value}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-[22px] border border-blue-100 bg-[linear-gradient(135deg,#eff6ff_0%,#f8fbff_100%)] px-4 py-4">
                  <div className="flex items-start gap-3">
                    <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
                    <p className="text-sm leading-6 text-slate-700">
                      Ambiente demonstrativo com status executivo, rastreabilidade documental e narrativa visual de operação pública.
                    </p>
                  </div>
                </div>
              </article>
            </section>

            <section className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))]">
              <article className="min-w-0 rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_16px_42px_rgba(15,23,42,0.06)] sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-slate-950 text-white">
                    <Building2 className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Dados do projeto</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">Resumo técnico e institucional do protocolo.</p>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {[
                    "Uso: comercial de médio porte",
                    "Área construída: 3.480 m²",
                    "Endereço: Av. Central das Palmeiras",
                    "Previsão de despacho: 3 dias úteis",
                  ].map((item) => (
                    <div key={item} className="rounded-[18px] border border-slate-200 bg-slate-50/85 px-4 py-3 text-sm leading-6 text-slate-700">
                      {item}
                    </div>
                  ))}
                </div>
              </article>

              <article className="min-w-0 rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_16px_42px_rgba(15,23,42,0.06)] sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-emerald-50 text-emerald-700">
                    <ClipboardCheck className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Checklist de documentos</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">Itens apresentados no fluxo de análise.</p>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {checklistItems.map((item) => (
                    <div key={item.label} className="flex min-w-0 items-start gap-3 rounded-[18px] border border-slate-200 bg-slate-50/85 px-4 py-3">
                      <CheckCircle2 className="mt-0.5 h-4.5 w-4.5 shrink-0 text-blue-700" />
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-semibold leading-6 text-slate-900">{item.label}</p>
                        <p className="text-[13px] leading-6 text-slate-500">{item.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="min-w-0 rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_16px_42px_rgba(15,23,42,0.06)] sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-amber-50 text-amber-700">
                    <Layers3 className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Etapas do fluxo</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">Progresso premium por fase da tramitação.</p>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {stageItems.map((item) => (
                    <div key={item.title} className="rounded-[18px] border border-slate-200 bg-slate-50/85 px-4 py-4">
                      <div className="flex items-start gap-3">
                        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${item.status === "done" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                          {item.status === "done" ? <CheckCircle2 className="h-4 w-4" /> : <MessageSquareMore className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                          <p className="mt-1 text-[13px] leading-6 text-slate-600">{item.description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </section>

            <section className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))] xl:[grid-template-columns:minmax(0,1.08fr)_minmax(320px,0.92fr)]">
              <article className="min-w-0 rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_16px_42px_rgba(15,23,42,0.06)] sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-blue-50 text-blue-800">
                    <BarChart3 className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Leitura de status</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">Simulação de volume por fase operacional do processo.</p>
                  </div>
                </div>

                <ChartContainer config={demoChartConfig} className="mt-5 w-full min-w-0" ratio={2.05} minHeight={240} maxHeight={320}>
                  <BarChart data={operationalBars} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={10} />
                    <YAxis tickLine={false} axisLine={false} />
                    <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                    <Bar dataKey="total" radius={[10, 10, 0, 0]} fill="var(--color-total)">
                      {operationalBars.map((entry) => (
                        <Cell key={entry.name} fill="#3b82f6" />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </article>

              <article className="min-w-0 rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_16px_42px_rgba(15,23,42,0.06)] sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-slate-950 text-white">
                    <FileCheck2 className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Distribuição visual</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">Composição do status atual do painel institucional.</p>
                  </div>
                </div>

                <div className="mt-5 grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))] xl:[grid-template-columns:180px_minmax(0,1fr)] xl:items-center">
                  <ChartContainer config={demoChartConfig} className="mx-auto w-full max-w-[220px]" ratio={1} minHeight={180} maxHeight={220}>
                    <PieChart>
                      <Pie data={statusDistribution} dataKey="value" nameKey="name" innerRadius="54%" outerRadius="86%" paddingAngle={4}>
                        {statusDistribution.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent hideLabel />} />
                    </PieChart>
                  </ChartContainer>

                  <div className="min-w-0 space-y-3">
                    {statusDistribution.map((item) => (
                      <div key={item.name} className="flex min-w-0 items-center gap-3 rounded-[18px] border border-slate-200 bg-slate-50/85 px-4 py-3">
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.fill }} />
                        <span className="min-w-0 flex-1 break-words text-sm font-medium text-slate-700">{item.name}</span>
                        <span className="shrink-0 text-sm font-semibold text-slate-950">{item.value}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </article>
            </section>

            <section className="flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3 text-sm leading-7 text-slate-600">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
                <p className="max-w-[64ch]">
                  Esta experiência é uma simulação institucional da plataforma, criada para apresentação comercial com identidade visual alinhada ao ambiente real do SIGAPRO.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Button asChild className="h-12 rounded-full bg-slate-950 px-6 text-sm font-semibold shadow-[0_12px_30px_rgba(15,23,42,0.14)] hover:bg-slate-900">
                  <Link to="/acesso">
                    Acessar sistema
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button type="button" variant="outline" className="h-12 rounded-full border-slate-300 bg-white px-6 text-sm font-semibold text-slate-900 hover:bg-slate-50" onClick={() => setContactOpen(true)}>
                  Falar com atendimento
                </Button>
                <Button type="button" variant="outline" className="h-12 rounded-full border-slate-300 bg-slate-50 px-6 text-sm font-semibold text-slate-700 hover:bg-slate-100" onClick={() => onOpenChange(false)}>
                  Fechar
                </Button>
              </div>
            </section>
          </div>
        </div>
      </DialogContent>
    </Dialog>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent className="w-[min(92vw,760px)] max-w-none overflow-hidden border-white/80 bg-white p-0 shadow-[0_36px_120px_rgba(15,23,42,0.26)] sm:rounded-[32px]">
          <div className="grid min-h-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.10),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)]">
            <div className="border-b border-slate-200/80 px-6 py-6 sm:px-8">
              <DialogHeader className="space-y-3 text-left">
                <div className="flex items-start gap-4">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-slate-950 text-white shadow-[0_16px_34px_rgba(15,23,42,0.20)]">
                    <Headphones className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <Badge className="mb-3 w-fit rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-800 hover:bg-blue-50">
                      Atendimento institucional
                    </Badge>
                    <DialogTitle className="text-[1.75rem] font-semibold leading-tight tracking-[-0.04em] text-slate-950">
                      Solicitar contato comercial
                    </DialogTitle>
                    <DialogDescription className="mt-2 max-w-[64ch] text-sm leading-7 text-slate-600">
                      Nossa equipe entrara em contato para apresentar a plataforma, tirar duvidas e orientar a melhor forma de implantacao do SIGAPRO.
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>
            </div>

            <div className="grid gap-6 px-6 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_240px]">
              <form className="min-w-0 space-y-4" onSubmit={handleContactSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="demo-contact-name">Nome completo</Label>
                    <Input id="demo-contact-name" value={contactForm.fullName} onChange={(event) => updateContactField("fullName", event.target.value)} placeholder="Nome do responsavel" className="h-12 rounded-2xl border-slate-200 bg-white" autoComplete="name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="demo-contact-email">E-mail institucional</Label>
                    <Input id="demo-contact-email" type="email" value={contactForm.email} onChange={(event) => updateContactField("email", event.target.value)} placeholder="nome@prefeitura.gov.br" className="h-12 rounded-2xl border-slate-200 bg-white" autoComplete="email" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="demo-contact-phone">Telefone / WhatsApp</Label>
                    <Input id="demo-contact-phone" value={contactForm.phone} onChange={(event) => updateContactField("phone", event.target.value)} placeholder="(00) 00000-0000" className="h-12 rounded-2xl border-slate-200 bg-white" autoComplete="tel" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="demo-contact-organization">Orgao / Prefeitura</Label>
                    <Input id="demo-contact-organization" value={contactForm.organization} onChange={(event) => updateContactField("organization", event.target.value)} placeholder="Prefeitura ou secretaria" className="h-12 rounded-2xl border-slate-200 bg-white" autoComplete="organization" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="demo-contact-role">Cargo</Label>
                  <Input id="demo-contact-role" value={contactForm.roleTitle} onChange={(event) => updateContactField("roleTitle", event.target.value)} placeholder="Cargo ou area de atuacao" className="h-12 rounded-2xl border-slate-200 bg-white" />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="demo-contact-message">Mensagem opcional</Label>
                  <Textarea id="demo-contact-message" value={contactForm.message} onChange={(event) => updateContactField("message", event.target.value)} placeholder="Conte brevemente o contexto da Prefeitura ou a duvida principal." className="min-h-[118px] resize-none rounded-2xl border-slate-200 bg-white leading-6" />
                </div>

                {contactStatus === "success" ? (
                  <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium leading-6 text-emerald-800">
                    Solicitação enviada com sucesso. Nossa equipe comercial entrará em contato em breve.
                  </div>
                ) : null}

                {contactStatus === "error" ? (
                  <div className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium leading-6 text-rose-800">
                    {contactError}
                  </div>
                ) : null}

                <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap">
                  <Button type="submit" disabled={contactStatus === "sending"} className="h-12 rounded-full bg-slate-950 px-6 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(15,23,42,0.18)] hover:bg-slate-900">
                    {contactStatus === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Solicitar contato
                  </Button>
                  <Button type="button" variant="outline" className="h-12 rounded-full border-slate-300 bg-white px-6 text-sm font-semibold text-slate-800 hover:bg-slate-50" onClick={() => setContactOpen(false)}>
                    Voltar
                  </Button>
                </div>
              </form>

              <aside className="min-w-0 rounded-[26px] border border-slate-200 bg-slate-950 p-5 text-white shadow-[0_20px_48px_rgba(15,23,42,0.14)]">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15 text-sky-200">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-200">Solicitacao vinculada</p>
                <h3 className="mt-2 text-lg font-semibold leading-7 text-white">Demonstracao institucional do SIGAPRO</h3>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  O contato sera registrado como interesse comercial da demonstracao, com prioridade para prefeituras, diretorias tecnicas e equipes de implantacao.
                </p>
                <div className="mt-5 space-y-3">
                  {["Retorno comercial em ate 1 dia util.", "Apresentacao consultiva do fluxo institucional.", "Orientacao sobre implantacao, planos e proximos passos."].map((item) => (
                    <div key={item} className="flex min-w-0 items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm leading-6 text-slate-200">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                      <span className="min-w-0">{item}</span>
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
