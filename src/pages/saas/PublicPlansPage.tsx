import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Building2, CheckCircle2, CreditCard, Layers3, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePlatformData } from "@/hooks/usePlatformData";
import { hasSupabaseEnv } from "@/integrations/supabase/client";
import { loadPublicPlansCatalog } from "@/integrations/supabase/platform";
import { planCatalog, type PlanItem } from "@/lib/platform";
import { cn } from "@/lib/utils";

const toList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];

const normalizePlan = (plan: Partial<PlanItem>, index = 0): PlanItem => ({
  id: String(plan.id || `public-plan-${index}`),
  accountLevel: String(plan.accountLevel || plan.name || "Plano"),
  name: String(plan.name || plan.accountLevel || "Plano"),
  subtitle: String(plan.subtitle || "Plano institucional configurável"),
  description: String(plan.description || "Estrutura comercial ajustável para a operação municipal."),
  price: Number.isFinite(Number(plan.price)) ? Number(plan.price) : 0,
  billingCycle: plan.billingCycle === "anual" || plan.billingCycle === "personalizado" ? plan.billingCycle : "mensal",
  badge: String(plan.badge || ""),
  badgeVariant: plan.badgeVariant || "default",
  featuresIncluded: toList(plan.featuresIncluded),
  featuresExcluded: toList(plan.featuresExcluded),
  modulesIncluded: toList(plan.modulesIncluded),
  maxUsers: plan.maxUsers ?? null,
  maxProcesses: plan.maxProcesses ?? null,
  maxDepartments: plan.maxDepartments ?? null,
  maxStorageGb: plan.maxStorageGb ?? null,
  isFeatured: Boolean(plan.isFeatured),
  isActive: plan.isActive ?? true,
  isPublic: Boolean(plan.isPublic),
  isInternalOnly: Boolean(plan.isInternalOnly),
  isCustom: Boolean(plan.isCustom),
  isVisibleInMaster: plan.isVisibleInMaster ?? true,
  displayOrder: Number.isFinite(Number(plan.displayOrder)) ? Number(plan.displayOrder) : index + 1,
  accentColor: String(plan.accentColor || "#1d4ed8"),
  notes: String(plan.notes || ""),
  createdAt: plan.createdAt || new Date().toISOString(),
  updatedAt: plan.updatedAt || new Date().toISOString(),
});

const formatCurrency = (value: number) =>
  value <= 0 ? "Sob consulta" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const billingLabel: Record<PlanItem["billingCycle"], string> = {
  mensal: "por mês",
  anual: "por ano",
  personalizado: "contrato personalizado",
};

function PublicPlanCard({ rawPlan }: { rawPlan: PlanItem }) {
  const plan = normalizePlan(rawPlan);
  const included = plan.featuresIncluded.length > 0 ? plan.featuresIncluded : ["Benefícios comerciais configuráveis pelo master."];

  return (
    <article
      className={cn(
        "flex h-full min-w-0 flex-col overflow-hidden rounded-[32px] border bg-white p-6 shadow-[0_22px_60px_rgba(15,23,42,0.09)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_28px_74px_rgba(15,23,42,0.13)]",
        plan.isFeatured ? "border-sky-200 ring-4 ring-sky-100/70" : "border-slate-200",
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{plan.accountLevel}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-slate-950">{plan.name}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{plan.subtitle}</p>
        </div>
        {plan.badge ? (
          <Badge className="rounded-full bg-slate-950 px-3 py-1 text-white hover:bg-slate-950">
            {plan.badge}
          </Badge>
        ) : null}
      </div>

      <div className="mt-6 rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#eef6ff_100%)] p-5">
        <p className="text-[2rem] font-semibold tracking-[-0.06em] text-slate-950">{formatCurrency(plan.price)}</p>
        <p className="mt-1 text-sm font-medium text-slate-500">{billingLabel[plan.billingCycle]}</p>
      </div>

      <p className="mt-5 text-sm leading-6 text-slate-600">{plan.description}</p>

      <div className="mt-6 grid gap-3">
        {included.slice(0, 7).map((feature) => (
          <div key={feature} className="flex min-w-0 items-start gap-3 text-sm leading-6 text-slate-700">
            <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600" />
            <span>{feature}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-2 rounded-[22px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 sm:grid-cols-2">
        <span>Usuários: {plan.maxUsers ?? "Ilimitado"}</span>
        <span>Processos: {plan.maxProcesses ?? "Ilimitado"}</span>
        <span>Órgãos: {plan.maxDepartments ?? "Ilimitado"}</span>
        <span>Arquivos: {plan.maxStorageGb ? `${plan.maxStorageGb} GB` : "Sob contrato"}</span>
      </div>

      <div className="mt-auto pt-6">
        <Button asChild className="h-12 w-full rounded-full bg-slate-950 text-white hover:bg-slate-900">
          <Link to="/acesso">
            Solicitar acesso
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </article>
  );
}

export function PublicPlansPage() {
  const { plans: internalPlans } = usePlatformData();
  const [remotePlans, setRemotePlans] = useState<PlanItem[]>([]);

  useEffect(() => {
    if (!hasSupabaseEnv) return;
    let active = true;
    void loadPublicPlansCatalog()
      .then((items) => {
        if (active) setRemotePlans(Array.isArray(items) ? items : []);
      })
      .catch(() => {
        if (active) setRemotePlans([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const plans = useMemo(() => {
    const source = remotePlans.length > 0 ? remotePlans : internalPlans.length > 0 ? internalPlans : planCatalog;
    return source
      .map((plan, index) => normalizePlan(plan, index))
      .filter((plan) => plan.isActive && plan.isPublic && !plan.isInternalOnly)
      .sort((left, right) => left.displayOrder - right.displayOrder || left.name.localeCompare(right.name, "pt-BR"));
  }, [internalPlans, remotePlans]);

  return (
    <main className="min-h-screen overflow-hidden bg-[#eef4fb] text-slate-950">
      <section className="relative isolate px-5 py-6 sm:px-8 lg:px-10">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_18%,rgba(37,99,235,0.16),transparent_32%),radial-gradient(circle_at_82%_8%,rgba(20,184,166,0.14),transparent_30%),linear-gradient(180deg,#f8fbff_0%,#e9f1fa_100%)]" />
        <div className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-4 rounded-full border border-white/70 bg-white/78 px-5 py-3 shadow-[0_18px_54px_rgba(15,23,42,0.10)] backdrop-blur-xl">
          <Link to="/" className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
              <Building2 className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold tracking-[0.24em] text-slate-950">SIGAPRO</span>
              <span className="block text-xs font-medium text-slate-500">Planos institucionais</span>
            </span>
          </Link>
          <Button asChild className="rounded-full bg-slate-950 hover:bg-slate-900">
            <Link to="/acesso">Acessar sistema</Link>
          </Button>
        </div>

        <div className="mx-auto grid w-full max-w-[1480px] gap-8 py-14 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,0.72fr)] lg:items-center">
          <div className="min-w-0">
            <Badge className="rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sky-700 hover:bg-sky-50">
              Comercial SIGAPRO
            </Badge>
            <h1 className="mt-6 max-w-[13ch] text-[clamp(3rem,6vw,6.7rem)] font-semibold leading-[0.88] tracking-[-0.085em] text-slate-950">
              Planos para gestão pública digital.
            </h1>
            <p className="mt-6 max-w-[72ch] text-lg leading-8 text-slate-600">
              Estruture protocolo, análise, financeiro, documentos e governança em uma plataforma institucional com níveis ajustáveis à realidade de cada prefeitura.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild className="h-12 rounded-full bg-slate-950 px-7 hover:bg-slate-900">
                <Link to="/acesso">
                  Acessar sistema
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-12 rounded-full border-slate-300 bg-white px-7">
                <a href="mailto:comercial@sigapro.com.br">Falar com atendimento</a>
              </Button>
            </div>
          </div>

          <div className="rounded-[34px] border border-white/80 bg-white/78 p-4 shadow-[0_28px_90px_rgba(15,23,42,0.13)] backdrop-blur-xl">
            <div className="rounded-[28px] border border-slate-200 bg-slate-950 p-6 text-white">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-sky-200">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200">Proposta modular</p>
                  <p className="mt-1 text-lg font-semibold">Níveis editáveis pelo master</p>
                </div>
              </div>
              <div className="mt-6 grid gap-3">
                {[
                  ["Planos ativos", String(plans.length), CreditCard],
                  ["Módulos configuráveis", "6+", Layers3],
                  ["Governança multi-tenant", "Isolada", ShieldCheck],
                ].map(([label, value, Icon]) => (
                  <div key={label as string} className="flex items-center justify-between gap-4 rounded-[22px] border border-white/10 bg-white/[0.06] p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-400/12 text-sky-200">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="text-sm font-medium text-slate-200">{label}</span>
                    </div>
                    <span className="text-lg font-semibold">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 pb-16 sm:px-8 lg:px-10">
        <div className="mx-auto grid w-full max-w-[1480px] gap-5 lg:grid-cols-3">
          {plans.length === 0 ? (
            <div className="rounded-[30px] border border-dashed border-slate-300 bg-white p-8 text-center text-sm leading-7 text-slate-600 lg:col-span-3">
              Nenhum plano público ativo no momento.
            </div>
          ) : plans.map((plan) => (
            <PublicPlanCard key={plan.id} rawPlan={plan} />
          ))}
        </div>
      </section>
    </main>
  );
}
