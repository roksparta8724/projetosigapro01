import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  FileDown,
  FileText,
  Image as ImageIcon,
  Layers3,
  PencilLine,
  Plus,
  Presentation,
  Share2,
  Sparkles,
  Star,
  Wand2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MetricCard } from "@/components/platform/MetricCard";
import { InternalSectionNav } from "@/components/platform/PageLayout";
import { PageHero } from "@/components/platform/PageHero";
import { PageMainContent, PageMainGrid, PageShell, PageSideContent, PageStatsRow } from "@/components/platform/PageShell";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionCard } from "@/components/platform/SectionCard";
import { TableCard } from "@/components/platform/TableCard";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { uploadFile } from "@/integrations/r2/client";
import { hasSupabaseEnv } from "@/integrations/supabase/client";
import { saveRemoteClientPlanAssignment, saveRemoteCommercialMaterial, upsertRemotePlan } from "@/integrations/supabase/platform";
import { buildCommercialPdfBlob } from "@/lib/commercialPdf";
import { cn } from "@/lib/utils";
import { type ClientPlanAssignment, type PlanBillingCycle, type PlanContractStatus, type PlanItem } from "@/lib/platform";

type PlansView = "visao-geral" | "planos" | "contratos" | "compartilhamento" | "gerador";
type CommercialMaterialType = "banner" | "folder" | "proposta";
type CommercialTemplateId = "executivo" | "premium" | "comparativo" | "personalizada";
type PlanDraft = Omit<PlanItem, "featuresIncluded" | "featuresExcluded" | "modulesIncluded"> & {
  featuresIncludedText: string;
  featuresExcludedText: string;
  modulesIncludedText: string;
};

type GeneratedMaterialRecord = {
  id: string;
  planIds: string[];
  materialType: CommercialMaterialType;
  templateId: CommercialTemplateId;
  customerName: string;
  customerContact: string;
  title: string;
  subtitle: string;
  shareSlug: string;
  createdAt: string;
};

const commercialMaterialTypes: Array<{
  id: CommercialMaterialType;
  title: string;
  description: string;
  icon: typeof ImageIcon;
}> = [
  {
    id: "banner",
    title: "Banner comercial",
    description: "Peca visual direta para destacar plano, valor, beneficios e CTA.",
    icon: ImageIcon,
  },
  {
    id: "folder",
    title: "Folder institucional",
    description: "Material completo com contexto, comparativo e diferenciais do SIGAPRO.",
    icon: Presentation,
  },
  {
    id: "proposta",
    title: "Proposta resumida",
    description: "Documento executivo com cliente, condicoes, validade e proximos passos.",
    icon: FileText,
  },
];

const commercialTemplates: Array<{
  id: CommercialTemplateId;
  title: string;
  description: string;
  tone: string;
}> = [
  {
    id: "executivo",
    title: "Executivo",
    description: "Limpo, institucional e direto para decisores publicos.",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
  },
  {
    id: "premium",
    title: "Comercial premium",
    description: "Mais visual, com maior foco em valor percebido e conversao.",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  {
    id: "comparativo",
    title: "Comparativo",
    description: "Organiza dois ou mais planos lado a lado para tomada de decisao.",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
  {
    id: "personalizada",
    title: "Proposta personalizada",
    description: "Inclui cliente, responsavel, mensagem, validade e fechamento comercial.",
    tone: "border-rose-200 bg-rose-50 text-rose-700",
  },
];

const billingLabels: Record<PlanBillingCycle, string> = {
  mensal: "mensal",
  anual: "anual",
  personalizado: "personalizado",
};

const contractLabels: Record<PlanContractStatus, string> = {
  rascunho: "Rascunho",
  ativo: "Ativo",
  trial: "Trial",
  suspenso: "Suspenso",
  upgrade: "Upgrade",
  downgrade: "Downgrade",
  encerrado: "Encerrado",
};

const makeId = (prefix: string) => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const toList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];

const parseLines = (value: string) =>
  value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

const formatCurrency = (value: number) =>
  value <= 0 ? "Sob consulta" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const normalizeBillingCycle = (value: unknown): PlanBillingCycle =>
  value === "anual" || value === "personalizado" ? value : "mensal";

const normalizePlan = (plan: Partial<PlanItem> | null | undefined, index = 0): PlanItem => {
  const now = new Date().toISOString();
  const name = String(plan?.name || plan?.accountLevel || `Plano ${index + 1}`).trim();
  return {
    id: String(plan?.id || makeId("plan")),
    accountLevel: String(plan?.accountLevel || name).trim(),
    name,
    subtitle: String(plan?.subtitle || "Plano institucional configurável").trim(),
    description: String(plan?.description || "Plano comercial com regras, limites e benefícios definidos pelo ambiente master.").trim(),
    price: Number.isFinite(Number(plan?.price)) ? Number(plan?.price) : 0,
    billingCycle: normalizeBillingCycle(plan?.billingCycle),
    badge: String(plan?.badge || "").trim(),
    badgeVariant: plan?.badgeVariant || "default",
    featuresIncluded: toList(plan?.featuresIncluded),
    featuresExcluded: toList(plan?.featuresExcluded),
    modulesIncluded: toList(plan?.modulesIncluded),
    maxUsers: plan?.maxUsers ?? null,
    maxProcesses: plan?.maxProcesses ?? null,
    maxDepartments: plan?.maxDepartments ?? null,
    maxStorageGb: plan?.maxStorageGb ?? null,
    isFeatured: Boolean(plan?.isFeatured),
    isActive: plan?.isActive ?? true,
    isPublic: Boolean(plan?.isPublic),
    isInternalOnly: Boolean(plan?.isInternalOnly),
    isCustom: Boolean(plan?.isCustom),
    isVisibleInMaster: plan?.isVisibleInMaster ?? true,
    displayOrder: Number.isFinite(Number(plan?.displayOrder)) ? Number(plan?.displayOrder) : index + 1,
    accentColor: String(plan?.accentColor || "#1d4ed8"),
    notes: String(plan?.notes || ""),
    createdAt: plan?.createdAt || now,
    updatedAt: plan?.updatedAt || now,
  };
};

const buildPlanDraft = (plan?: Partial<PlanItem> | null): PlanDraft => {
  const normalized = normalizePlan(plan, 0);
  return {
    ...normalized,
    id: plan?.id ? normalized.id : makeId("plan"),
    featuresIncludedText: normalized.featuresIncluded.join("\n"),
    featuresExcludedText: normalized.featuresExcluded.join("\n"),
    modulesIncludedText: normalized.modulesIncluded.join("\n"),
  };
};

const toPlan = (draft: PlanDraft): PlanItem => ({
  ...draft,
  id: draft.id || makeId("plan"),
  accountLevel: draft.accountLevel.trim() || draft.name.trim(),
  name: draft.name.trim(),
  subtitle: draft.subtitle.trim(),
  description: draft.description.trim(),
  price: Number.isFinite(Number(draft.price)) ? Number(draft.price) : 0,
  billingCycle: normalizeBillingCycle(draft.billingCycle),
  badge: draft.badge.trim(),
  featuresIncluded: parseLines(draft.featuresIncludedText),
  featuresExcluded: parseLines(draft.featuresExcludedText),
  modulesIncluded: parseLines(draft.modulesIncludedText),
  notes: draft.notes.trim(),
  updatedAt: new Date().toISOString(),
});

function getPlanTone(plan: PlanItem) {
  if (!plan.isActive) return "border-slate-300 bg-slate-100 text-slate-600";
  if (plan.isFeatured) return "border-sky-200 bg-sky-50 text-sky-700";
  if (plan.isCustom) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const buildCommercialHeadline = (plans: PlanItem[], materialType: CommercialMaterialType, customerName: string) => {
  const audience = customerName.trim() || "sua Prefeitura";
  const leadPlan = plans.find((plan) => plan.isFeatured) ?? plans[0];
  if (materialType === "banner") return `${leadPlan?.name ?? "SIGAPRO"} para ${audience}`;
  if (materialType === "folder") return `SIGAPRO como plataforma institucional para ${audience}`;
  return `Proposta SIGAPRO para ${audience}`;
};

const buildCommercialSubtitle = (plans: PlanItem[], templateId: CommercialTemplateId) => {
  const planNames = plans.map((plan) => plan.name).join(", ");
  if (templateId === "comparativo") {
    return `Comparativo comercial dos planos ${planNames || "selecionados"}, com beneficios, limites e escopo de implantacao.`;
  }
  if (templateId === "premium") {
    return "Uma apresentacao comercial de alto impacto para demonstrar valor, governanca e retorno operacional.";
  }
  if (templateId === "personalizada") {
    return "Documento comercial personalizado com condicoes, escopo e proximos passos de contratacao.";
  }
  return "Resumo executivo para decisao institucional, com linguagem clara, segura e orientada a gestao publica.";
};

const getPlanHighlights = (plans: PlanItem[]) => {
  const highlights = plans.flatMap((plan) => plan.featuresIncluded).filter(Boolean);
  return highlights.length > 0
    ? Array.from(new Set(highlights)).slice(0, 8)
    : [
        "Protocolo digital institucional",
        "Analise tecnica com trilha de decisao",
        "Dashboards executivos por perfil",
        "Fluxo seguro para profissionais externos",
      ];
};

const slugifyPdfName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "material-comercial";

/*
const buildCommercialPdfBlob = ({
  plans,
  materialType,
  templateTitle,
  title,
  subtitle,
  customerName,
  customerContact,
  responsibleName,
  responsibleRole,
  customMessage,
  validityDate,
  observations,
  hidePrices,
}: {
  plans: PlanItem[];
  materialType: CommercialMaterialType;
  templateTitle: string;
  title: string;
  subtitle: string;
  customerName: string;
  customerContact: string;
  responsibleName: string;
  responsibleRole: string;
  customMessage: string;
  validityDate: string;
  observations: string;
  hidePrices: boolean;
}) => {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 16;
  let y = 18;

  const ensureSpace = (height: number) => {
    if (y + height <= pageHeight - 18) return;
    pdf.addPage();
    y = 18;
  };

  const writeWrapped = (text: string, x: number, maxWidth: number, lineHeight = 5.2) => {
    const lines = pdf.splitTextToSize(text || "", maxWidth);
    pdf.text(lines, x, y);
    y += lines.length * lineHeight;
  };

  pdf.setFillColor(7, 17, 31);
  pdf.roundedRect(10, 10, pageWidth - 20, 62, 8, 8, "F");
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(18, 18, 16, 16, 5, 5, "F");
  pdf.setTextColor(15, 118, 110);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text("S", 24, 28, { align: "center" });
  pdf.setTextColor(226, 232, 240);
  pdf.setFontSize(8);
  pdf.text(`SIGAPRO • ${templateTitle.toUpperCase()} • ${materialType.toUpperCase()}`, 40, 23);
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(24);
  pdf.text(pdf.splitTextToSize(title, pageWidth - 48), 18, 45);
  y = 76;

  pdf.setTextColor(71, 85, 105);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  writeWrapped(subtitle, margin, pageWidth - margin * 2, 5);

  y += 4;
  const meta = [
    ["Cliente", customerName || "Cliente institucional"],
    ["Contato", customerContact || "A definir"],
    ["Responsavel", responsibleName || "Equipe SIGAPRO"],
    ["Validade", validityDate || "Sob alinhamento"],
  ];
  const cardWidth = (pageWidth - margin * 2 - 9) / 4;
  meta.forEach(([label, value], index) => {
    const x = margin + index * (cardWidth + 3);
    pdf.setFillColor(248, 250, 252);
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(x, y, cardWidth, 22, 4, 4, "FD");
    pdf.setTextColor(100, 116, 139);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.8);
    pdf.text(label.toUpperCase(), x + 3, y + 7);
    pdf.setTextColor(15, 23, 42);
    pdf.setFontSize(8);
    pdf.text(pdf.splitTextToSize(value, cardWidth - 6).slice(0, 2), x + 3, y + 14);
  });
  y += 32;

  pdf.setTextColor(15, 23, 42);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("Leitura comercial", margin, y);
  y += 8;
  pdf.setTextColor(51, 65, 85);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  writeWrapped(
    customMessage ||
      "O SIGAPRO centraliza protocolo, analise, financeiro, documentos e governanca municipal em uma plataforma segura, visual e preparada para operacoes publicas de alto padrao.",
    margin,
    pageWidth - margin * 2,
  );

  y += 6;
  ensureSpace(28);
  pdf.setTextColor(15, 23, 42);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("Planos selecionados", margin, y);
  y += 8;

  plans.forEach((plan) => {
    ensureSpace(48);
    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(203, 213, 225);
    pdf.roundedRect(margin, y, pageWidth - margin * 2, 42, 5, 5, "FD");
    pdf.setTextColor(14, 116, 144);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    pdf.text(plan.accountLevel.toUpperCase(), margin + 5, y + 8);
    pdf.setTextColor(15, 23, 42);
    pdf.setFontSize(15);
    pdf.text(plan.name, margin + 5, y + 17);
    pdf.setTextColor(51, 65, 85);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
    pdf.text(pdf.splitTextToSize(plan.subtitle, 86), margin + 5, y + 24);
    pdf.setTextColor(15, 23, 42);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(17);
    pdf.text(hidePrices ? "Sob consulta" : formatCurrency(plan.price), pageWidth - margin - 5, y + 17, { align: "right" });
    pdf.setTextColor(100, 116, 139);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(billingLabels[plan.billingCycle], pageWidth - margin - 5, y + 24, { align: "right" });
    const features = (plan.featuresIncluded.length ? plan.featuresIncluded : ["Beneficios configuraveis pelo ambiente master."]).slice(0, 3);
    pdf.setTextColor(51, 65, 85);
    pdf.setFontSize(8);
    pdf.text(pdf.splitTextToSize(features.join(" • "), pageWidth - margin * 2 - 10).slice(0, 2), margin + 5, y + 33);
    y += 49;
  });

  ensureSpace(38);
  pdf.setTextColor(15, 23, 42);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text("Diferenciais para decisao", margin, y);
  y += 8;
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(51, 65, 85);
  pdf.setFontSize(9);
  getPlanHighlights(plans)
    .slice(0, 8)
    .forEach((highlight) => {
      ensureSpace(7);
      pdf.setTextColor(2, 132, 199);
      pdf.text("•", margin, y);
      pdf.setTextColor(51, 65, 85);
      pdf.text(pdf.splitTextToSize(highlight, pageWidth - margin * 2 - 6), margin + 5, y);
      y += 6.5;
    });

  ensureSpace(32);
  y += 4;
  pdf.setFillColor(239, 246, 255);
  pdf.setDrawColor(191, 219, 254);
  pdf.roundedRect(margin, y, pageWidth - margin * 2, 28, 5, 5, "FD");
  pdf.setTextColor(15, 23, 42);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("Proximos passos", margin + 5, y + 9);
  pdf.setTextColor(51, 65, 85);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.text(
    pdf.splitTextToSize(
      observations || "Validacao de escopo, parametrizacao municipal, implantacao guiada e ativacao dos perfis de acesso.",
      pageWidth - margin * 2 - 10,
    ),
    margin + 5,
    y + 17,
  );

  const totalPages = pdf.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    pdf.setTextColor(100, 116, 139);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text("SIGAPRO - Sistema integrado de gestao e aprovacao de projetos", margin, pageHeight - 8);
    pdf.text(`${responsibleRole || "Comercial institucional"} • ${page}/${totalPages}`, pageWidth - margin, pageHeight - 8, { align: "right" });
  }

  return pdf.output("blob");
};

const buildPdfHtml = ({
  plans,
  materialType,
  templateTitle,
  title,
  subtitle,
  customerName,
  customerContact,
  responsibleName,
  responsibleRole,
  customMessage,
  validityDate,
  observations,
  hidePrices,
}: {
  plans: PlanItem[];
  materialType: CommercialMaterialType;
  templateTitle: string;
  title: string;
  subtitle: string;
  customerName: string;
  customerContact: string;
  responsibleName: string;
  responsibleRole: string;
  customMessage: string;
  validityDate: string;
  observations: string;
  hidePrices: boolean;
}) => {
  const safePlans = plans.length > 0 ? plans : [normalizePlan(null)];
  const highlights = getPlanHighlights(safePlans);
  const generatedAt = new Intl.DateTimeFormat("pt-BR").format(new Date());
  const rows = safePlans
    .map(
      (plan) => `
        <section class="plan-card">
          <div class="plan-head">
            <div>
              <small>${escapeHtml(plan.accountLevel)}</small>
              <h3>${escapeHtml(plan.name)}</h3>
              <p>${escapeHtml(plan.subtitle)}</p>
            </div>
            ${plan.badge ? `<span>${escapeHtml(plan.badge)}</span>` : ""}
          </div>
          <strong class="price">${hidePrices ? "Sob consulta" : escapeHtml(formatCurrency(plan.price))}</strong>
          <p class="cycle">${escapeHtml(billingLabels[plan.billingCycle])}</p>
          <p>${escapeHtml(plan.description)}</p>
          <ul>
            ${(plan.featuresIncluded.length ? plan.featuresIncluded : ["Beneficios configuraveis pelo ambiente master."])
              .slice(0, 7)
              .map((feature) => `<li>${escapeHtml(feature)}</li>`)
              .join("")}
          </ul>
        </section>
      `,
    )
    .join("");

  return `
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          @page { size: A4; margin: 14mm; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; background: #f8fafc; }
          .page { min-height: 100vh; padding: 28px; background: linear-gradient(135deg, #ffffff 0%, #eff6ff 55%, #ecfeff 100%); }
          .cover { overflow: hidden; border: 1px solid #dbeafe; border-radius: 30px; background: #ffffff; box-shadow: 0 24px 80px rgba(15, 23, 42, 0.13); }
          .hero { padding: 34px; color: #fff; background: radial-gradient(circle at 20% 0%, rgba(56,189,248,0.34), transparent 35%), linear-gradient(135deg, #07111f, #0f2a44 62%, #0f766e); }
          .brand { display: flex; align-items: center; gap: 14px; letter-spacing: .22em; text-transform: uppercase; font-weight: 800; }
          .mark { display: grid; width: 48px; height: 48px; place-items: center; border-radius: 18px; background: #fff; color: #0f766e; font-weight: 900; letter-spacing: -.08em; }
          .hero h1 { max-width: 820px; margin: 30px 0 12px; font-size: 44px; line-height: .98; letter-spacing: -.055em; }
          .hero p { max-width: 760px; margin: 0; color: #dbeafe; font-size: 16px; line-height: 1.65; }
          .meta { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; padding: 18px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
          .meta div { min-width: 0; border: 1px solid #e2e8f0; border-radius: 18px; padding: 14px; background: #fff; }
          .meta small, .plan-card small, .block small { display: block; color: #64748b; font-size: 10px; letter-spacing: .18em; text-transform: uppercase; font-weight: 800; }
          .meta strong { display: block; margin-top: 6px; font-size: 13px; overflow-wrap: anywhere; }
          .section { padding: 26px; border-bottom: 1px solid #e2e8f0; }
          .section h2 { margin: 0 0 12px; font-size: 20px; letter-spacing: -.025em; }
          .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
          .plan-card, .block { min-width: 0; border: 1px solid #e2e8f0; border-radius: 24px; padding: 20px; background: #fff; break-inside: avoid; }
          .plan-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
          .plan-head h3 { margin: 7px 0 4px; font-size: 24px; letter-spacing: -.04em; }
          .plan-head p, .cycle { margin: 0; color: #64748b; line-height: 1.5; }
          .plan-head span { border: 1px solid #bfdbfe; border-radius: 999px; padding: 7px 10px; background: #eff6ff; color: #1d4ed8; font-size: 11px; font-weight: 800; }
          .price { display: block; margin-top: 18px; font-size: 30px; letter-spacing: -.05em; }
          ul { margin: 16px 0 0; padding: 0; list-style: none; }
          li { margin-top: 9px; padding-left: 22px; position: relative; line-height: 1.45; color: #334155; }
          li:before { content: ""; position: absolute; left: 0; top: 8px; width: 8px; height: 8px; border-radius: 99px; background: #0284c7; }
          .footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 26px; color: #64748b; font-size: 12px; }
          @media print { body { background: #fff; } .page { padding: 0; background: #fff; } .cover { box-shadow: none; border-radius: 0; } }
          @media (max-width: 760px) { .meta, .grid { grid-template-columns: 1fr; } .hero h1 { font-size: 34px; } }
        </style>
      </head>
      <body>
        <main class="page">
          <article class="cover">
            <header class="hero">
              <div class="brand"><div class="mark">S</div><div>SIGAPRO<br/><small>${escapeHtml(templateTitle)} - ${escapeHtml(materialType)}</small></div></div>
              <h1>${escapeHtml(title)}</h1>
              <p>${escapeHtml(subtitle)}</p>
            </header>
            <section class="meta">
              <div><small>Cliente</small><strong>${escapeHtml(customerName || "Cliente institucional")}</strong></div>
              <div><small>Contato</small><strong>${escapeHtml(customerContact || "A definir")}</strong></div>
              <div><small>Responsavel</small><strong>${escapeHtml(responsibleName || "Equipe SIGAPRO")}</strong></div>
              <div><small>Validade</small><strong>${escapeHtml(validityDate || "Sob alinhamento")}</strong></div>
            </section>
            <section class="section">
              <h2>Leitura comercial</h2>
              <p>${escapeHtml(customMessage || "O SIGAPRO centraliza protocolo, analise, financeiro, documentos e governanca municipal em uma plataforma segura, visual e preparada para operacoes publicas de alto padrao.")}</p>
            </section>
            <section class="section">
              <h2>Planos selecionados</h2>
              <div class="grid">${rows}</div>
            </section>
            <section class="section">
              <h2>Diferenciais para decisao</h2>
              <div class="grid">
                ${highlights
                  .slice(0, 6)
                  .map((highlight) => `<div class="block"><small>Diferencial</small><p>${escapeHtml(highlight)}</p></div>`)
                  .join("")}
              </div>
            </section>
            <section class="section">
              <h2>Proximos passos</h2>
              <div class="grid">
                <div class="block"><small>Implantacao</small><p>Validacao do escopo, parametrizacao municipal e configuracao dos perfis de acesso.</p></div>
                <div class="block"><small>Suporte</small><p>Acompanhamento de ativacao com leitura operacional, ajustes de fluxo e apoio institucional.</p></div>
              </div>
              ${observations ? `<p><strong>Observacoes:</strong> ${escapeHtml(observations)}</p>` : ""}
            </section>
            <footer class="footer"><span>SIGAPRO - Sistema integrado de gestao e aprovacao de projetos</span><span>${escapeHtml(responsibleRole || "Comercial institucional")} - ${generatedAt}</span></footer>
          </article>
        </main>
      </body>
    </html>
  `;
};
*/

export function MasterPlansPage() {
  const navigate = useNavigate();
  const {
    institutions,
    plans,
    planAssignments,
    upsertPlan,
    duplicatePlan,
    saveClientPlanAssignment,
    getInstitutionPlanAssignment,
    getInstitutionSettings,
    getUserProfile,
  } = usePlatformData();
  const { session } = usePlatformSession();
  const [view, setView] = useState<PlansView>("visao-geral");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<PlanDraft>(() => buildPlanDraft(null));
  const [selectedInstitutionId, setSelectedInstitutionId] = useState("");
  const [assignmentPlanId, setAssignmentPlanId] = useState("");
  const [assignmentStatus, setAssignmentStatus] = useState<PlanContractStatus>("ativo");
  const [assignmentCycle, setAssignmentCycle] = useState<PlanBillingCycle>("mensal");
  const [assignmentStart, setAssignmentStart] = useState("");
  const [assignmentEnd, setAssignmentEnd] = useState("");
  const [assignmentCustomPrice, setAssignmentCustomPrice] = useState("");
  const [assignmentIsCustom, setAssignmentIsCustom] = useState(false);
  const [assignmentNotes, setAssignmentNotes] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [remoteError, setRemoteError] = useState("");
  const [commercialMaterialType, setCommercialMaterialType] = useState<CommercialMaterialType>("proposta");
  const [commercialTemplateId, setCommercialTemplateId] = useState<CommercialTemplateId>("executivo");
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [responsibleName, setResponsibleName] = useState("Direção SIGAPRO");
  const [responsibleRole, setResponsibleRole] = useState("Diretor responsável SIGAPRO");
  const [responsibleEmail, setResponsibleEmail] = useState("");
  const [customMessage, setCustomMessage] = useState("");
  const [proposalValidity, setProposalValidity] = useState("");
  const [commercialObservations, setCommercialObservations] = useState("");
  const [hideCommercialPrices, setHideCommercialPrices] = useState(false);
  const [generatedMaterials, setGeneratedMaterials] = useState<GeneratedMaterialRecord[]>([]);

  const safePlans = useMemo(
    () =>
      (Array.isArray(plans) ? plans : [])
        .map((plan, index) => normalizePlan(plan, index))
        .sort((left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name, "pt-BR")),
    [plans],
  );
  const safeInstitutions = useMemo(
    () => (Array.isArray(institutions) ? institutions : []),
    [institutions],
  );
  const safeAssignments = Array.isArray(planAssignments) ? planAssignments : [];
  const activePlans = safePlans.filter((plan) => plan.isActive);
  const publicPlans = safePlans.filter((plan) => plan.isActive && plan.isPublic);
  const featuredPlan = safePlans.find((plan) => plan.isFeatured);
  const shareLink = typeof window === "undefined" ? "/planos-publicos" : `${window.location.origin}/planos-publicos`;
  const selectedCommercialPlans = safePlans.filter((plan) => selectedPlanIds.includes(plan.id));
  const commercialTemplate = commercialTemplates.find((template) => template.id === commercialTemplateId) ?? commercialTemplates[0];
  const commercialTitle = buildCommercialHeadline(selectedCommercialPlans, commercialMaterialType, customerName);
  const commercialSubtitle = buildCommercialSubtitle(selectedCommercialPlans, commercialTemplateId);
  const commercialHighlights = getPlanHighlights(selectedCommercialPlans);
  const activeProfile = useMemo(() => getUserProfile(session.id, session.email), [getUserProfile, session.email, session.id]);
  const selectedInstitution = useMemo(
    () => safeInstitutions.find((institution) => institution.id === selectedInstitutionId),
    [safeInstitutions, selectedInstitutionId],
  );
  const selectedInstitutionSettings = useMemo(
    () => getInstitutionSettings(selectedInstitutionId),
    [getInstitutionSettings, selectedInstitutionId],
  );
  const selectedAdministrator = useMemo(
    () => selectedInstitutionSettings?.adminContacts?.[0],
    [selectedInstitutionSettings],
  );

  useEffect(() => {
    if (!selectedInstitutionId && safeInstitutions[0]?.id) {
      setSelectedInstitutionId(safeInstitutions[0].id);
    }
  }, [safeInstitutions, selectedInstitutionId]);

  useEffect(() => {
    if (!assignmentPlanId && safePlans[0]?.id) {
      setAssignmentPlanId(safePlans[0].id);
    }
  }, [assignmentPlanId, safePlans]);

  useEffect(() => {
    const fallbackName = activeProfile?.fullName?.trim() || session.name?.trim() || "Direção SIGAPRO";
    const fallbackRole = session.title?.trim() || "Diretor responsável SIGAPRO";
    const fallbackEmail = activeProfile?.email?.trim() || session.email?.trim() || "contato@sigapro.govtech";

    setResponsibleName((current) =>
      !current.trim() || current === "Equipe SIGAPRO" || current === "Direção SIGAPRO" ? fallbackName : current,
    );
    setResponsibleRole((current) =>
      !current.trim() || current === "Comercial institucional" || current === "Diretor responsável SIGAPRO" ? fallbackRole : current,
    );
    setResponsibleEmail((current) => (!current.trim() ? fallbackEmail : current));
  }, [activeProfile?.email, activeProfile?.fullName, session.email, session.name, session.title]);

  useEffect(() => {
    if (!selectedInstitutionId) return;
    const assignment = getInstitutionPlanAssignment(selectedInstitutionId);
    setAssignmentPlanId(assignment?.planId ?? safePlans[0]?.id ?? "");
    setAssignmentStatus(assignment?.contractStatus ?? "ativo");
    setAssignmentCycle(assignment?.billingCycle ?? "mensal");
    setAssignmentStart(assignment?.startsAt ?? "");
    setAssignmentEnd(assignment?.endsAt ?? "");
    setAssignmentCustomPrice(assignment?.customPrice?.toString() ?? "");
    setAssignmentIsCustom(assignment?.isCustom ?? false);
    setAssignmentNotes(assignment?.billingNotes ?? "");
  }, [getInstitutionPlanAssignment, safePlans, selectedInstitutionId]);

  useEffect(() => {
    if (selectedPlanIds.length > 0 || safePlans.length === 0) return;
    const defaults = safePlans.filter((plan) => plan.isFeatured || plan.isPublic).slice(0, 3);
    setSelectedPlanIds((defaults.length > 0 ? defaults : safePlans.slice(0, 2)).map((plan) => plan.id));
  }, [safePlans, selectedPlanIds.length]);

  useEffect(() => {
    if (!selectedInstitution) return;
    setCustomerName(selectedInstitution.name || "");
    setCustomerContact((current) => {
      if (current.trim() && current !== "Nao informado") return current;
      return (
        selectedInstitutionSettings?.email ||
        selectedInstitutionSettings?.diretoriaEmail ||
        selectedAdministrator?.email ||
        selectedInstitutionSettings?.telefone ||
        "Nao informado"
      );
    });
  }, [
    selectedAdministrator?.email,
    selectedInstitution,
    selectedInstitutionSettings?.diretoriaEmail,
    selectedInstitutionSettings?.email,
    selectedInstitutionSettings?.telefone,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem("sigapro-commercial-materials");
      const parsed = stored ? JSON.parse(stored) : [];
      setGeneratedMaterials(Array.isArray(parsed) ? parsed.slice(0, 8) : []);
    } catch {
      setGeneratedMaterials([]);
    }
  }, []);

  const assignedMunicipalities = safeAssignments.filter((assignment) =>
    safeInstitutions.some((institution) => institution.id === assignment.municipalityId),
  );
  const municipalityProfile = selectedInstitution
    ? {
        name: selectedInstitution.name || "Nao informado",
        cnpj: selectedInstitutionSettings?.cnpj || "Nao informado",
        address: selectedInstitutionSettings?.endereco || "Nao informado",
        city: selectedInstitution.city || "Nao informado",
        state: selectedInstitution.state || "Nao informado",
        phone: selectedInstitutionSettings?.telefone || selectedInstitutionSettings?.diretoriaTelefone || "Nao informado",
        email: selectedInstitutionSettings?.email || selectedInstitutionSettings?.diretoriaEmail || "Nao informado",
        secretariat: selectedInstitutionSettings?.secretariaResponsavel || "Nao informado",
        directorate: selectedInstitutionSettings?.diretoriaResponsavel || "Nao informado",
        primaryResponsibleName: selectedAdministrator?.fullName || "Nao informado",
        primaryResponsibleRole: selectedAdministrator?.title || "Nao informado",
        administratorName: selectedAdministrator?.fullName || "Nao informado",
        administratorEmail: selectedAdministrator?.email || "Nao informado",
        status: selectedInstitution.status || "prospeccao",
        subdomain: selectedInstitution.subdomain || "",
        plan: selectedInstitution.plan || "Nao informado",
        activeModules: selectedInstitution.activeModules || [],
        users: selectedInstitution.users || 0,
        processes: selectedInstitution.processes || 0,
      }
    : null;
  const monthlyRevenue = assignedMunicipalities.reduce((sum, assignment) => {
    const linkedPlan = safePlans.find((item) => item.id === assignment.planId);
    const price = assignment.customPrice ?? linkedPlan?.price ?? 0;
    if (assignment.contractStatus !== "ativo") return sum;
    return sum + (assignment.billingCycle === "anual" ? price / 12 : price);
  }, 0);

  const syncRemotePlan = async (plan: PlanItem) => {
    if (!hasSupabaseEnv) return true;
    try {
      await upsertRemotePlan(plan);
      setRemoteError("");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao sincronizar plano no Supabase.";
      setRemoteError(message);
      return false;
    }
  };

  const syncRemoteAssignment = async (assignment: ClientPlanAssignment) => {
    if (!hasSupabaseEnv) return true;
    try {
      await saveRemoteClientPlanAssignment(assignment);
      setRemoteError("");
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao sincronizar vínculo comercial no Supabase.";
      setRemoteError(message);
      return false;
    }
  };

  const openPlanDialog = (plan?: PlanItem) => {
    setDraft(buildPlanDraft(plan ?? null));
    setDialogOpen(true);
  };

  const handleSavePlan = async (event: FormEvent) => {
    event.preventDefault();
    const plan = toPlan(draft);
    if (!plan.name || !plan.subtitle || !plan.description) {
      setStatusMessage("Informe nome, subtítulo e descrição do plano.");
      return;
    }
    const saved = upsertPlan(plan);
    const synced = await syncRemotePlan(saved);
    setStatusMessage(
      synced
        ? `${saved.name} atualizado com sucesso.`
        : `${saved.name} foi mantido no painel, mas precisa aplicar a migration/sincronizar o Supabase.`,
    );
    setDialogOpen(false);
  };

  const handleDuplicate = async (planId: string) => {
    const duplicated = duplicatePlan(planId);
    if (!duplicated) {
      setStatusMessage("Não foi possível duplicar o plano selecionado.");
      return;
    }
    const synced = await syncRemotePlan(duplicated);
    setStatusMessage(synced ? `${duplicated.name} criado com sucesso.` : `${duplicated.name} criado no painel e pendente de sincronização.`);
  };

  const handleTogglePlan = async (plan: PlanItem, field: "isActive" | "isPublic" | "isFeatured" | "isInternalOnly") => {
    const nextPlan = upsertPlan({ ...plan, [field]: !plan[field] });
    const synced = await syncRemotePlan(nextPlan);
    setStatusMessage(synced ? `${nextPlan.name} atualizado.` : `${nextPlan.name} atualizado localmente e pendente no Supabase.`);
  };

  const handleSaveAssignment = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedInstitutionId || !assignmentPlanId) {
      setStatusMessage("Selecione uma prefeitura e um plano antes de salvar.");
      return;
    }
    const previous = safeAssignments.find((assignment) => assignment.municipalityId === selectedInstitutionId);
    const assignment = saveClientPlanAssignment({
      id: previous?.id,
      municipalityId: selectedInstitutionId,
      planId: assignmentPlanId,
      contractStatus: assignmentStatus,
      startsAt: assignmentStart,
      endsAt: assignmentEnd,
      billingCycle: assignmentCycle,
      billingNotes: assignmentNotes,
      customPrice: assignmentCustomPrice ? Number(assignmentCustomPrice) : null,
      isCustom: assignmentIsCustom,
    });
    const synced = await syncRemoteAssignment(assignment);
    setStatusMessage(synced ? "Vínculo comercial atualizado com sucesso." : "Vínculo atualizado no painel e pendente de sincronização remota.");
  };

  const handleCopyShareLink = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareLink);
      }
      setStatusMessage("Link compartilhável copiado.");
    } catch {
      setStatusMessage(`Link compartilhável: ${shareLink}`);
    }
  };

  const toggleCommercialPlan = (planId: string) => {
    setSelectedPlanIds((current) =>
      current.includes(planId) ? current.filter((id) => id !== planId) : [...current, planId],
    );
  };

  const persistGeneratedMaterials = (records: GeneratedMaterialRecord[]) => {
    const nextRecords = records.slice(0, 8);
    setGeneratedMaterials(nextRecords);
    if (typeof window === "undefined") return;
    window.localStorage.setItem("sigapro-commercial-materials", JSON.stringify(nextRecords));
  };

  const handleSaveCommercialMaterial = async (storage?: { pdfUrl?: string; objectKey?: string }) => {
    if (!selectedInstitutionId || !selectedInstitution) {
      setStatusMessage("Selecione uma prefeitura antes de gerar a proposta.");
      return null;
    }
    if (selectedCommercialPlans.length === 0) {
      setStatusMessage("Selecione pelo menos um plano para gerar o material comercial.");
      return null;
    }
    const record: GeneratedMaterialRecord = {
      id: makeId("material"),
      planIds: selectedCommercialPlans.map((plan) => plan.id),
      materialType: commercialMaterialType,
      templateId: commercialTemplateId,
      customerName: customerName.trim(),
      customerContact: customerContact.trim(),
      title: commercialTitle,
      subtitle: commercialSubtitle,
      shareSlug: `sigapro-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
    };
    persistGeneratedMaterials([record, ...generatedMaterials]);
    if (hasSupabaseEnv) {
      try {
        await saveRemoteCommercialMaterial({
          planIds: record.planIds,
          materialType: record.materialType,
          modelType: record.templateId,
          customerName: record.customerName,
          customerContact: record.customerContact,
          responsibleName,
          responsibleRole,
          title: record.title,
          subtitle: record.subtitle,
          shareSlug: record.shareSlug,
          isPublic: false,
          status: "draft",
          validUntil: proposalValidity,
          notes: commercialObservations,
          pdfUrl: storage?.pdfUrl,
          generatedContent: {
            customMessage,
            hidePrices: hideCommercialPrices,
            pdfObjectKey: storage?.objectKey,
            plans: selectedCommercialPlans.map((plan) => ({
              id: plan.id,
              name: plan.name,
              price: plan.price,
              billingCycle: plan.billingCycle,
              featuresIncluded: plan.featuresIncluded,
            })),
          },
        });
        setRemoteError("");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao sincronizar material comercial no Supabase.";
        setRemoteError(message);
      }
    }
    setStatusMessage("Material comercial salvo no historico do painel.");
    return record;
  };

  const handleCopyMaterialLink = async () => {
    const record = await handleSaveCommercialMaterial();
    if (!record) return;
    const materialLink =
      typeof window === "undefined" ? `/planos-publicos?material=${record.shareSlug}` : `${window.location.origin}/planos-publicos?material=${record.shareSlug}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(materialLink);
      }
      setStatusMessage("Link comercial controlado copiado.");
    } catch {
      setStatusMessage(`Link comercial: ${materialLink}`);
    }
  };

  const handleExportCommercialPdf = async () => {
    if (!selectedInstitutionId || !selectedInstitution) {
      setStatusMessage("Selecione uma prefeitura antes de gerar a proposta.");
      return;
    }
    if (selectedCommercialPlans.length === 0) {
      setStatusMessage("Selecione pelo menos um plano antes de exportar o PDF.");
      return;
    }
    const pdfBlob = await buildCommercialPdfBlob({
      plans: selectedCommercialPlans,
      materialType: commercialMaterialType,
      templateTitle: commercialTemplate.title,
      title: commercialTitle,
      subtitle: commercialSubtitle,
      customerName,
      customerContact,
      responsibleName,
      responsibleRole,
      responsibleEmail,
      customMessage,
      validityDate: proposalValidity,
      observations: commercialObservations,
      hidePrices: hideCommercialPrices,
      municipalityProfile,
    });
    const slug = `${slugifyPdfName(customerName || commercialTitle)}-${Date.now().toString(36)}`;
    const fileName = `${slug}.pdf`;
    const file = new File([pdfBlob], fileName, { type: "application/pdf" });
    const downloadUrl = URL.createObjectURL(pdfBlob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1200);

    let storageMeta: { pdfUrl?: string; objectKey?: string } = {};
    try {
      const bucket = (import.meta.env.VITE_R2_BUCKET_DOCUMENTOS as string | undefined) || "sigapro-documentos";
      const objectKey = `platform/commercial-materials/${fileName}`;
      const uploaded = await uploadFile({ bucket, objectKey, file });
      storageMeta = { pdfUrl: uploaded.publicUrl, objectKey: uploaded.objectKey };
      setRemoteError("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao enviar o PDF para o R2.";
      setRemoteError(message);
    }

    await handleSaveCommercialMaterial(storageMeta);
    setStatusMessage(storageMeta.pdfUrl ? "PDF gerado, enviado ao R2 e salvo no historico comercial." : "PDF gerado e salvo; envio ao R2 ficou pendente.");
  };

  const renderPlanCard = (rawPlan: PlanItem, editable = true) => {
    const plan = normalizePlan(rawPlan);
    const included = plan.featuresIncluded.length > 0 ? plan.featuresIncluded : ["Benefícios configuráveis pelo ambiente master."];

    return (
      <article key={plan.id} className="sig-dark-panel flex h-full min-w-0 flex-col overflow-hidden rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_14px_32px_rgba(15,23,42,0.07)]">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="sig-fit-title text-xl font-semibold text-slate-950" title={plan.name}>{plan.name}</p>
              {plan.badge ? <Badge className="rounded-full bg-slate-950 px-3 py-1 text-white hover:bg-slate-950">{plan.badge}</Badge> : null}
            </div>
            <p className="mt-1 sig-fit-copy text-sm leading-6 text-slate-500" title={plan.subtitle}>{plan.subtitle}</p>
          </div>
          <Badge className={cn("rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]", getPlanTone(plan))}>
            {plan.isActive ? "Ativo" : "Inativo"}
          </Badge>
        </div>

        <div className="mt-5 rounded-[22px] border border-slate-200 bg-slate-50 p-4">
          <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{plan.accountLevel}</p>
          <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-slate-950">{formatCurrency(plan.price)}</p>
          <p className="mt-1 text-sm text-slate-500">{billingLabels[plan.billingCycle]}</p>
        </div>

        <p className="mt-4 sig-fit-copy text-sm leading-6 text-slate-600" title={plan.description}>{plan.description}</p>

        <div className="mt-5 grid gap-2">
          {included.slice(0, 6).map((feature) => (
            <div key={feature} className="flex min-w-0 items-start gap-2 text-sm leading-6 text-slate-700">
              <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
              <span className="sig-fit-copy">{feature}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-2 rounded-[20px] border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 sm:grid-cols-2">
          <span>Usuários: {plan.maxUsers ?? "Ilimitado"}</span>
          <span>Processos: {plan.maxProcesses ?? "Ilimitado"}</span>
          <span>Órgãos: {plan.maxDepartments ?? "Ilimitado"}</span>
          <span>Arquivos: {plan.maxStorageGb ? `${plan.maxStorageGb} GB` : "Sob contrato"}</span>
        </div>

        {editable ? (
          <div className="mt-auto flex flex-wrap gap-2 pt-5">
            <Button type="button" variant="outline" className="sig-dark-action-btn h-10 rounded-full text-slate-50" onClick={() => openPlanDialog(plan)}>
              <PencilLine className="mr-2 h-4 w-4 text-sky-200" />
              Editar
            </Button>
            <Button type="button" variant="outline" className="sig-dark-action-btn h-10 rounded-full text-slate-50" onClick={() => handleDuplicate(plan.id)}>
              <Copy className="mr-2 h-4 w-4 text-sky-200" />
              Duplicar
            </Button>
            <Button type="button" variant="outline" className="sig-dark-action-btn h-10 rounded-full text-slate-50" onClick={() => handleTogglePlan(plan, "isActive")}>
              {plan.isActive ? <EyeOff className="mr-2 h-4 w-4 text-sky-200" /> : <Eye className="mr-2 h-4 w-4 text-sky-200" />}
              {plan.isActive ? "Desativar" : "Ativar"}
            </Button>
          </div>
        ) : null}
      </article>
    );
  };

  return (
    <PortalFrame eyebrow="Administrador Geral" title="Planos e níveis de conta">
      <PageShell>
        <PageHero
          eyebrow="Comercial master"
          title="Planos, níveis e contratos do SIGAPRO"
          description="Gerencie níveis de cliente, valores, benefícios, visibilidade comercial e vínculo de cada prefeitura sem expor preços na landing pública."
          icon={CreditCard}
          actions={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="button" variant="outline" className="sig-dark-action-btn rounded-full text-slate-50" onClick={() => navigate("/master")}>
                <ArrowLeft className="mr-2 h-4 w-4 text-sky-200" />
                Voltar ao master
              </Button>
              <Button type="button" variant="outline" className="sig-dark-action-btn rounded-full text-slate-50" onClick={() => setView("gerador")}>
                <Wand2 className="mr-2 h-4 w-4 text-sky-200" />
                Gerar material
              </Button>
              <Button type="button" className="rounded-full bg-slate-950 hover:bg-slate-900" onClick={() => openPlanDialog()}>
                <Plus className="mr-2 h-4 w-4" />
                Novo plano
              </Button>
            </div>
          }
        />

        <InternalSectionNav
          value={view}
          onChange={(value) => setView(value as PlansView)}
          items={[
            { value: "visao-geral", label: "Visão geral", helper: "Resumo comercial" },
            { value: "planos", label: "Planos", helper: "Cards e edição" },
            { value: "contratos", label: "Contratos", helper: "Vínculo por prefeitura" },
            { value: "compartilhamento", label: "Compartilhamento", helper: "Página externa" },
            { value: "gerador", label: "Gerador comercial", helper: "PDF e proposta" },
          ]}
        />

        {statusMessage ? (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-700">
            {statusMessage}
          </div>
        ) : null}
        {remoteError ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
            {remoteError}
          </div>
        ) : null}

        {view === "visao-geral" ? (
          <>
            <PageStatsRow className="xl:grid-cols-4">
              <MetricCard title="Planos ativos" value={String(activePlans.length)} helper="Disponíveis para operação comercial." icon={CreditCard} tone="blue" />
              <MetricCard title="Compartilháveis" value={String(publicPlans.length)} helper="Aparecem apenas no link público controlado." icon={Share2} tone="emerald" />
              <MetricCard title="Contratos vinculados" value={String(assignedMunicipalities.length)} helper="Prefeituras com plano associado." icon={Building2} tone="amber" />
              <MetricCard title="MRR estimado" value={formatCurrency(monthlyRevenue)} helper="Receita mensal recorrente dos contratos ativos." icon={Sparkles} tone="rose" />
            </PageStatsRow>
            <PageMainGrid>
              <PageMainContent>
                <TableCard title="Planos em destaque" description="Visual comercial interno dos níveis configurados pelo master." icon={Layers3}>
                  {safePlans.length === 0 ? (
                    <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
                      Nenhum plano configurado. Crie o primeiro plano para iniciar a carteira comercial.
                    </div>
                  ) : (
                    <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                      {safePlans.filter((plan) => plan.isVisibleInMaster).slice(0, 6).map((plan) => renderPlanCard(plan))}
                    </div>
                  )}
                </TableCard>
              </PageMainContent>
              <PageSideContent>
                <SectionCard title="Plano em evidência" description="Nível marcado como destaque comercial." icon={Star}>
                  {featuredPlan ? renderPlanCard(featuredPlan, false) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
                      Nenhum plano marcado como destaque comercial.
                    </div>
                  )}
                </SectionCard>
                <SectionCard title="Link comercial" description="Página separada da landing para enviar quando quiser." icon={Share2}>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="sig-fit-copy text-sm font-medium text-slate-900" title={shareLink}>{shareLink}</p>
                    <Button type="button" className="mt-4 w-full rounded-full bg-slate-950 hover:bg-slate-900" onClick={handleCopyShareLink}>
                      <Copy className="mr-2 h-4 w-4" />
                      Copiar link
                    </Button>
                  </div>
                </SectionCard>
              </PageSideContent>
            </PageMainGrid>
          </>
        ) : null}

        {view === "planos" ? (
          <TableCard
            title="Catálogo de planos"
            description="Crie, edite, duplique, desative e controle visibilidade comercial."
            icon={CreditCard}
            actions={<Button type="button" className="rounded-full bg-slate-950 hover:bg-slate-900" onClick={() => openPlanDialog()}><Plus className="mr-2 h-4 w-4" />Novo plano</Button>}
          >
            {safePlans.length === 0 ? (
              <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
                Nenhum plano cadastrado.
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                {safePlans.map((plan) => renderPlanCard(plan))}
              </div>
            )}
          </TableCard>
        ) : null}

        {view === "contratos" ? (
          <PageMainGrid>
            <PageMainContent>
              <TableCard title="Contratos por prefeitura" description="Vincule cada cliente ao nível comercial correto e registre observações contratuais." icon={Building2}>
                <div className="grid gap-4">
                  {safeInstitutions.length === 0 ? (
                    <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
                      Nenhuma prefeitura cadastrada para vínculo comercial.
                    </div>
                  ) : null}
                  {safeInstitutions.map((institution) => {
                    const assignment = getInstitutionPlanAssignment(institution.id);
                    const plan = safePlans.find((item) => item.id === assignment?.planId);
                    return (
                      <div key={institution.id} className="sig-dark-panel rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0">
                            <p className="sig-fit-title text-base font-semibold text-slate-950">{institution.name}</p>
                            <p className="mt-1 text-sm text-slate-500">{institution.city}/{institution.state}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className="rounded-full bg-slate-950 px-3 py-1 text-white hover:bg-slate-950">{plan?.name ?? "Sem plano"}</Badge>
                            <Badge variant="outline" className="rounded-full border-slate-300 text-slate-600">{assignment ? contractLabels[assignment.contractStatus] : "Não vinculado"}</Badge>
                            <Button type="button" variant="outline" className="sig-dark-action-btn h-10 rounded-full text-slate-50" onClick={() => setSelectedInstitutionId(institution.id)}>
                              <PencilLine className="mr-2 h-4 w-4 text-sky-200" />
                              Vincular
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </TableCard>
            </PageMainContent>
            <PageSideContent>
              <SectionCard title="Vínculo comercial" description="Atualize plano, recorrência e observações da prefeitura selecionada." icon={CreditCard}>
                <form className="space-y-4" onSubmit={handleSaveAssignment}>
                  <div className="space-y-2">
                    <Label>Prefeitura</Label>
                    <Select value={selectedInstitutionId} onValueChange={setSelectedInstitutionId}>
                      <SelectTrigger className="h-11 rounded-2xl"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {safeInstitutions.map((institution) => <SelectItem key={institution.id} value={institution.id}>{institution.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Plano atual</Label>
                    <Select value={assignmentPlanId} onValueChange={setAssignmentPlanId}>
                      <SelectTrigger className="h-11 rounded-2xl"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {safePlans.map((plan) => <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={assignmentStatus} onValueChange={(value) => setAssignmentStatus(value as PlanContractStatus)}>
                        <SelectTrigger className="h-11 rounded-2xl"><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(contractLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Recorrência</Label>
                      <Select value={assignmentCycle} onValueChange={(value) => setAssignmentCycle(value as PlanBillingCycle)}>
                        <SelectTrigger className="h-11 rounded-2xl"><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(billingLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2"><Label>Início</Label><Input type="date" value={assignmentStart} onChange={(event) => setAssignmentStart(event.target.value)} /></div>
                    <div className="space-y-2"><Label>Fim</Label><Input type="date" value={assignmentEnd} onChange={(event) => setAssignmentEnd(event.target.value)} /></div>
                  </div>
                  <div className="space-y-2">
                    <Label>Preço customizado</Label>
                    <Input type="number" min="0" value={assignmentCustomPrice} onChange={(event) => setAssignmentCustomPrice(event.target.value)} placeholder="Opcional" />
                  </div>
                  <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                    Plano customizado para este cliente
                    <Switch checked={assignmentIsCustom} onCheckedChange={setAssignmentIsCustom} />
                  </label>
                  <div className="space-y-2">
                    <Label>Observações comerciais</Label>
                    <Textarea value={assignmentNotes} onChange={(event) => setAssignmentNotes(event.target.value)} rows={4} />
                  </div>
                  <Button type="submit" className="w-full rounded-full bg-slate-950 hover:bg-slate-900" disabled={!safePlans.length || !safeInstitutions.length}>
                    Salvar vínculo
                  </Button>
                </form>
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        ) : null}

        {view === "compartilhamento" ? (
          <PageMainGrid>
            <PageMainContent>
              <TableCard title="Prévia compartilhável" description="Planos ativos e públicos que aparecerão somente para quem receber o link." icon={Share2}>
                <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                  {publicPlans.length === 0 ? (
                    <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
                      Nenhum plano público ativo. Marque pelo menos um plano como compartilhável.
                    </div>
                  ) : publicPlans.map((plan) => renderPlanCard(plan, false))}
                </div>
              </TableCard>
            </PageMainContent>
            <PageSideContent>
              <SectionCard title="Controle de exposição" description="A página pública não aparece na landing principal." icon={Eye}>
                <div className="space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="sig-label">Link atual</p>
                    <p className="mt-2 sig-fit-copy text-sm font-medium text-slate-900" title={shareLink}>{shareLink}</p>
                  </div>
                  <Button type="button" className="w-full rounded-full bg-slate-950 hover:bg-slate-900" onClick={handleCopyShareLink}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copiar link compartilhável
                  </Button>
                </div>
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        ) : null}

        {view === "gerador" ? (
          <PageMainGrid className="xl:grid-cols-[minmax(0,1.05fr)_minmax(380px,0.95fr)]">
            <PageMainContent>
              <TableCard
                title="Gerador comercial"
                description="Crie banner, folder e proposta em PDF usando os planos reais do ambiente master."
                icon={Wand2}
                actions={
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" className="sig-dark-action-btn rounded-full text-slate-50" onClick={handleCopyMaterialLink} disabled={!selectedCommercialPlans.length}>
                      <Copy className="mr-2 h-4 w-4 text-sky-200" />
                      Copiar link
                    </Button>
                    <Button type="button" className="rounded-full bg-slate-950 hover:bg-slate-900" onClick={handleExportCommercialPdf} disabled={!selectedCommercialPlans.length}>
                      <FileDown className="mr-2 h-4 w-4" />
                      Exportar PDF
                    </Button>
                  </div>
                }
              >
                <div className="grid gap-6">
                  <section className="grid gap-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <p className="sig-label">1. Planos</p>
                        <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-slate-950">Selecione o material de venda</h3>
                      </div>
                      <Badge className="w-fit rounded-full bg-slate-950 px-3 py-1 text-white hover:bg-slate-950">
                        {selectedCommercialPlans.length} selecionado(s)
                      </Badge>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {safePlans.length === 0 ? (
                        <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
                          Cadastre planos antes de gerar materiais comerciais.
                        </div>
                      ) : null}
                      {safePlans.map((plan) => (
                        <button
                          key={plan.id}
                          type="button"
                          className={cn(
                            "min-w-0 rounded-[24px] border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(15,23,42,0.10)]",
                            selectedPlanIds.includes(plan.id) ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white",
                          )}
                          onClick={() => toggleCommercialPlan(plan.id)}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="sig-fit-title text-base font-semibold text-slate-950">{plan.name}</p>
                              <p className="mt-1 sig-fit-copy text-sm leading-5 text-slate-600">{plan.subtitle}</p>
                            </div>
                            <span onClick={(event) => event.stopPropagation()}>
                              <Checkbox checked={selectedPlanIds.includes(plan.id)} onCheckedChange={() => toggleCommercialPlan(plan.id)} />
                            </span>
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                            <span className="rounded-full bg-slate-100 px-3 py-1">{hideCommercialPrices ? "Sob consulta" : formatCurrency(plan.price)}</span>
                            <span className="rounded-full bg-slate-100 px-3 py-1">{billingLabels[plan.billingCycle]}</span>
                            {plan.badge ? <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-700">{plan.badge}</span> : null}
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="grid gap-4">
                    <div>
                      <p className="sig-label">2. Formato</p>
                      <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-slate-950">Escolha o tipo de material</h3>
                    </div>
                    <div className="grid gap-3 xl:grid-cols-3">
                      {commercialMaterialTypes.map((material) => {
                        const Icon = material.icon;
                        return (
                          <button
                            key={material.id}
                            type="button"
                            className={cn(
                              "min-w-0 rounded-[24px] border p-4 text-left transition hover:-translate-y-0.5",
                              commercialMaterialType === material.id ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-950",
                            )}
                            onClick={() => setCommercialMaterialType(material.id)}
                          >
                            <Icon className={cn("h-5 w-5", commercialMaterialType === material.id ? "text-sky-200" : "text-sky-600")} />
                            <p className="mt-4 font-semibold">{material.title}</p>
                            <p className={cn("mt-2 text-sm leading-5", commercialMaterialType === material.id ? "text-slate-300" : "text-slate-600")}>{material.description}</p>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="grid gap-4">
                    <div>
                      <p className="sig-label">3. Modelo</p>
                      <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-slate-950">Defina a narrativa comercial</h3>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      {commercialTemplates.map((template) => (
                        <button
                          key={template.id}
                          type="button"
                          className={cn(
                            "min-w-0 rounded-[24px] border p-4 text-left transition hover:-translate-y-0.5",
                            commercialTemplateId === template.id ? "border-sky-300 bg-sky-50" : "border-slate-200 bg-white",
                          )}
                          onClick={() => setCommercialTemplateId(template.id)}
                        >
                          <Badge className={cn("rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]", template.tone)}>
                            {template.title}
                          </Badge>
                          <p className="mt-3 sig-fit-copy text-sm leading-6 text-slate-600">{template.description}</p>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="grid gap-4">
                    <div>
                      <p className="sig-label">4. Personalizacao</p>
                      <h3 className="mt-1 text-xl font-semibold tracking-[-0.03em] text-slate-950">Dados do cliente e condicoes</h3>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-2"><Label>Prefeitura / cliente</Label><Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Prefeitura Municipal de..." /></div>
                      <div className="space-y-2"><Label>Contato do cliente</Label><Input value={customerContact} onChange={(event) => setCustomerContact(event.target.value)} placeholder="Secretaria, gestor ou e-mail" /></div>
                      <div className="space-y-2"><Label>Responsavel SIGAPRO</Label><Input value={responsibleName} onChange={(event) => setResponsibleName(event.target.value)} /></div>
                      <div className="space-y-2"><Label>Cargo / assinatura</Label><Input value={responsibleRole} onChange={(event) => setResponsibleRole(event.target.value)} /></div>
                      <div className="space-y-2"><Label>E-mail institucional da assinatura</Label><Input type="email" value={responsibleEmail} onChange={(event) => setResponsibleEmail(event.target.value)} placeholder="contato@sigapro.govtech" /></div>
                      <div className="space-y-2"><Label>Validade da proposta</Label><Input type="date" value={proposalValidity} onChange={(event) => setProposalValidity(event.target.value)} /></div>
                      <label className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                        Ocultar valores no material
                        <Switch checked={hideCommercialPrices} onCheckedChange={setHideCommercialPrices} />
                      </label>
                    </div>
                    <div className="space-y-2">
                      <Label>Mensagem personalizada</Label>
                      <Textarea rows={4} value={customMessage} onChange={(event) => setCustomMessage(event.target.value)} placeholder="Mensagem comercial opcional para abrir o material." />
                    </div>
                    <div className="space-y-2">
                      <Label>Observacoes comerciais</Label>
                      <Textarea rows={3} value={commercialObservations} onChange={(event) => setCommercialObservations(event.target.value)} placeholder="Condicoes, implantacao, suporte, proximos passos..." />
                    </div>
                  </section>
                </div>
              </TableCard>
            </PageMainContent>

            <PageSideContent>
              <SectionCard title="Preview premium" description="Visual de como o cliente recebera a proposta." icon={Presentation}>
                  <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_22px_56px_rgba(15,23,42,0.12)]">
                    <div className="bg-[radial-gradient(circle_at_15%_0%,rgba(56,189,248,0.38),transparent_34%),linear-gradient(135deg,#07111f,#10243a_58%,#0f766e)] p-6 text-white">
                      <div className="flex items-center gap-3">
                        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-sm font-black tracking-[-0.08em] text-emerald-700">S</div>
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.24em] text-sky-100">SIGAPRO</p>
                          <p className="text-xs text-slate-200">Material comercial inteligente</p>
                        </div>
                      </div>
                      <h3 className="mt-8 text-3xl font-semibold tracking-[-0.06em] text-white">{commercialTitle}</h3>
                      <p className="mt-3 text-sm leading-6 text-slate-100">{commercialSubtitle}</p>
                    </div>
                  <div className="grid gap-4 p-5">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="sig-label">Cliente</p>
                        <p className="mt-2 sig-fit-copy text-sm font-semibold text-slate-950">{customerName || "Cliente institucional"}</p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="sig-label">Modelo</p>
                        <p className="mt-2 text-sm font-semibold text-slate-950">{commercialTemplate.title}</p>
                      </div>
                    </div>
                    <div className="grid gap-3">
                      {(selectedCommercialPlans.length > 0 ? selectedCommercialPlans : safePlans.slice(0, 2)).map((plan) => (
                        <div key={plan.id} className="rounded-[22px] border border-slate-200 bg-white p-4">
                          <div className="flex min-w-0 items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="sig-fit-title text-base font-semibold text-slate-950">{plan.name}</p>
                              <p className="mt-1 sig-fit-copy text-sm text-slate-600">{plan.subtitle}</p>
                            </div>
                            <p className="shrink-0 text-sm font-semibold text-slate-950">{hideCommercialPrices ? "Sob consulta" : formatCurrency(plan.price)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-[22px] border border-slate-200 bg-slate-50 p-4">
                      <p className="sig-label">Diferenciais automaticos</p>
                      <div className="mt-3 grid gap-2">
                        {commercialHighlights.slice(0, 5).map((highlight) => (
                          <div key={highlight} className="flex min-w-0 items-start gap-2 text-sm leading-6 text-slate-700">
                            <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-sky-600" />
                            <span className="sig-fit-copy">{highlight}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Button type="button" className="w-full rounded-full bg-slate-950 hover:bg-slate-900" onClick={handleExportCommercialPdf} disabled={!selectedCommercialPlans.length}>
                        <FileDown className="mr-2 h-4 w-4" />
                        Gerar PDF profissional
                      </Button>
                      <Button type="button" variant="outline" className="sig-dark-action-btn w-full rounded-full text-slate-50" onClick={handleSaveCommercialMaterial} disabled={!selectedCommercialPlans.length}>
                        <Sparkles className="mr-2 h-4 w-4 text-sky-200" />
                        Salvar material
                      </Button>
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Historico recente" description="Materiais montados nesta estacao do painel master." icon={FileText}>
                <div className="grid gap-3">
                  {generatedMaterials.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                      Nenhum material salvo ainda.
                    </div>
                  ) : null}
                  {generatedMaterials.map((material) => (
                    <div key={material.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="sig-fit-title text-sm font-semibold text-slate-950">{material.title}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">{material.materialType} / {material.templateId}</p>
                        </div>
                        <Badge variant="outline" className="rounded-full border-slate-300 text-slate-600">{material.planIds.length} plano(s)</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        ) : null}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="w-[min(94vw,1180px)] max-w-none overflow-hidden border-slate-200 p-0 sm:rounded-[28px]">
            <div className="max-h-[88vh] overflow-y-auto p-6">
              <DialogHeader className="space-y-2 text-left">
                <DialogTitle className="text-2xl font-semibold text-slate-950">Configurar plano comercial</DialogTitle>
                <DialogDescription className="max-w-[78ch] text-sm leading-6 text-slate-600">
                  Defina nível, valor, limites, benefícios, visibilidade e regras comerciais do plano.
                </DialogDescription>
              </DialogHeader>

              <form className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]" onSubmit={handleSavePlan}>
                <div className="grid gap-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2"><Label>Nome do plano</Label><Input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></div>
                    <div className="space-y-2"><Label>Nível de conta</Label><Input value={draft.accountLevel} onChange={(event) => setDraft((current) => ({ ...current, accountLevel: event.target.value }))} /></div>
                  </div>
                  <div className="space-y-2"><Label>Subtítulo</Label><Input value={draft.subtitle} onChange={(event) => setDraft((current) => ({ ...current, subtitle: event.target.value }))} /></div>
                  <div className="space-y-2"><Label>Descrição curta</Label><Textarea rows={3} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2"><Label>Preço</Label><Input type="number" min="0" value={draft.price} onChange={(event) => setDraft((current) => ({ ...current, price: Number(event.target.value) }))} /></div>
                    <div className="space-y-2"><Label>Periodicidade</Label><Select value={draft.billingCycle} onValueChange={(value) => setDraft((current) => ({ ...current, billingCycle: value as PlanBillingCycle }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(billingLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-2"><Label>Ordem</Label><Input type="number" value={draft.displayOrder} onChange={(event) => setDraft((current) => ({ ...current, displayOrder: Number(event.target.value) }))} /></div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2"><Label>Selo</Label><Input value={draft.badge} onChange={(event) => setDraft((current) => ({ ...current, badge: event.target.value }))} /></div>
                    <div className="space-y-2"><Label>Cor de destaque</Label><Input type="color" value={draft.accentColor} onChange={(event) => setDraft((current) => ({ ...current, accentColor: event.target.value }))} /></div>
                    <div className="space-y-2"><Label>Variante do selo</Label><Select value={draft.badgeVariant} onValueChange={(value) => setDraft((current) => ({ ...current, badgeVariant: value as PlanItem["badgeVariant"] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["default", "blue", "emerald", "amber", "rose", "slate"].map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="space-y-2"><Label>Usuários</Label><Input type="number" min="0" value={draft.maxUsers ?? ""} onChange={(event) => setDraft((current) => ({ ...current, maxUsers: event.target.value ? Number(event.target.value) : null }))} /></div>
                    <div className="space-y-2"><Label>Processos</Label><Input type="number" min="0" value={draft.maxProcesses ?? ""} onChange={(event) => setDraft((current) => ({ ...current, maxProcesses: event.target.value ? Number(event.target.value) : null }))} /></div>
                    <div className="space-y-2"><Label>Órgãos</Label><Input type="number" min="0" value={draft.maxDepartments ?? ""} onChange={(event) => setDraft((current) => ({ ...current, maxDepartments: event.target.value ? Number(event.target.value) : null }))} /></div>
                    <div className="space-y-2"><Label>GB</Label><Input type="number" min="0" value={draft.maxStorageGb ?? ""} onChange={(event) => setDraft((current) => ({ ...current, maxStorageGb: event.target.value ? Number(event.target.value) : null }))} /></div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2"><Label>Benefícios incluídos</Label><Textarea rows={7} value={draft.featuresIncludedText} onChange={(event) => setDraft((current) => ({ ...current, featuresIncludedText: event.target.value }))} /></div>
                    <div className="space-y-2"><Label>Itens não incluídos</Label><Textarea rows={7} value={draft.featuresExcludedText} onChange={(event) => setDraft((current) => ({ ...current, featuresExcludedText: event.target.value }))} /></div>
                  </div>
                  <div className="space-y-2"><Label>Módulos liberados</Label><Textarea rows={5} value={draft.modulesIncludedText} onChange={(event) => setDraft((current) => ({ ...current, modulesIncludedText: event.target.value }))} /></div>
                </div>

                <div className="grid gap-4 self-start">
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-950">Visibilidade e status</p>
                    <div className="mt-4 grid gap-3">
                      {[
                        ["isActive", "Plano ativo"],
                        ["isPublic", "Visível na página compartilhável"],
                        ["isVisibleInMaster", "Visível no painel master"],
                        ["isFeatured", "Destacar como popular/recomendado"],
                        ["isInternalOnly", "Uso interno apenas"],
                        ["isCustom", "Plano customizado"],
                      ].map(([key, label]) => (
                        <label key={key} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700">
                          {label}
                          <Switch checked={Boolean(draft[key as keyof PlanDraft])} onCheckedChange={(checked) => setDraft((current) => ({ ...current, [key]: checked }))} />
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                    <p className="text-sm font-semibold text-slate-950">Observações internas</p>
                    <Textarea className="mt-3" rows={6} value={draft.notes} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} />
                  </div>
                  <div className="rounded-[24px] border border-slate-200 bg-white p-4">
                    <p className="text-sm font-semibold text-slate-950">Resumo de controle</p>
                    <div className="mt-3 grid gap-2 text-sm text-slate-600">
                      <label className="flex items-center gap-2"><Checkbox checked={draft.isPublic} onCheckedChange={(checked) => setDraft((current) => ({ ...current, isPublic: Boolean(checked) }))} />Pode aparecer no link compartilhável</label>
                      <label className="flex items-center gap-2"><Checkbox checked={draft.isFeatured} onCheckedChange={(checked) => setDraft((current) => ({ ...current, isFeatured: Boolean(checked) }))} />Marcar como destaque comercial</label>
                    </div>
                  </div>
                  <Button type="submit" className="h-12 rounded-full bg-slate-950 hover:bg-slate-900">Salvar plano</Button>
                </div>
              </form>
            </div>
          </DialogContent>
        </Dialog>
      </PageShell>
    </PortalFrame>
  );
}
