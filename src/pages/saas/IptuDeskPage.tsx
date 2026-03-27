import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  Landmark,
  ReceiptText,
  Scale,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCard } from "@/components/platform/AlertCard";
import { PageHero } from "@/components/platform/PageHero";
import {
  PageMainContent,
  PageMainGrid,
  PageShell,
  PageSideContent,
  PageStatsRow,
} from "@/components/platform/PageShell";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionCard } from "@/components/platform/SectionCard";
import { StatCard } from "@/components/platform/StatCard";
import { TableCard } from "@/components/platform/TableCard";
import {
  formatCurrency,
  getProcessPaymentGuides,
  getVisibleProcessesByScope,
} from "@/lib/platform";
import { usePlatformData } from "@/hooks/usePlatformData";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";

export function IptuDeskPage() {
  const { session } = usePlatformSession();
  const { scopeId, institutionSettingsCompat } = useMunicipality();
  const { processes: allProcesses, getInstitutionSettings } = usePlatformData();
  const processes = getVisibleProcessesByScope(session, scopeId, allProcesses);
  const tenantSettings =
    institutionSettingsCompat ?? getInstitutionSettings(scopeId ?? session.tenantId);

  const issGuides = processes
    .map((process) => ({
      process,
      guide: getProcessPaymentGuides(process, tenantSettings).find(
        (item) => item.kind === "iss_obra",
      ),
    }))
    .filter(
      (
        item,
      ): item is {
        process: (typeof processes)[number];
        guide: NonNullable<ReturnType<typeof getProcessPaymentGuides>[number]>;
      } => Boolean(item.guide),
    );

  const pendingGuides = issGuides.filter(({ guide }) => guide.status === "pendente");
  const validatedGuides = issGuides.filter(({ guide }) => guide.status === "compensada");
  const criticalCases = issGuides.filter(
    ({ process, guide }) =>
      guide.status === "pendente" && (process.sla.breached || process.sla.hoursRemaining <= 8),
  );
  const missingFiscalData = issGuides.filter(
    ({ process }) => !process.property.iptu || !process.property.registration,
  );
  const blockedCases = issGuides.filter(
    ({ process }) => process.status === "pendencia_documental" || process.sla.breached,
  );
  const totalValue = issGuides.reduce((sum, { guide }) => sum + guide.amount, 0);
  const validatedValue = validatedGuides.reduce((sum, { guide }) => sum + guide.amount, 0);

  const recentActivity = issGuides
    .flatMap(({ process, guide }) =>
      process.auditTrail.slice(0, 1).map((entry) => ({
        id: `${process.id}-${entry.id}`,
        protocol: process.protocol,
        title: entry.title,
        detail: guide.label,
        at: entry.at,
      })),
    )
    .slice(0, 5);

  const priorityQueue = [...issGuides].sort((a, b) => {
    const aCritical =
      a.guide.status === "pendente" && (a.process.sla.breached || a.process.sla.hoursRemaining <= 8);
    const bCritical =
      b.guide.status === "pendente" && (b.process.sla.breached || b.process.sla.hoursRemaining <= 8);

    if (aCritical !== bCritical) return aCritical ? -1 : 1;
    if (a.guide.status !== b.guide.status) return a.guide.status === "pendente" ? -1 : 1;
    return a.process.sla.hoursRemaining - b.process.sla.hoursRemaining;
  });

  return (
    <PortalFrame
      eyebrow="SETOR FISCAL"
      title="ISSQN, verificação fiscal e conformidade da arrecadação"
    >
      <PageShell>
        <PageHero
          eyebrow="Verificação fiscal"
          title="📊 Conferência de ISSQN, pendências e conformidade"
          description="Uma mesa fiscal única para validar guias, priorizar riscos e manter a arrecadação sob controle."
          icon={Landmark}
          actions={
            <div className="flex flex-wrap gap-3">
              <Link to="/prefeitura/financeiro">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full border-slate-200 bg-white"
                >
                  Visão geral
                </Button>
              </Link>
              <Link to="/prefeitura/financeiro/protocolos">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full border-slate-200 bg-white"
                >
                  Protocolos e recolhimento
                </Button>
              </Link>
              <Link to="/prefeitura/financeiro/iptu">
                <Button type="button" className="rounded-full bg-slate-950 hover:bg-slate-900">
                  Fiscal e ISSQN
                </Button>
              </Link>
            </div>
          }
        />

        <PageStatsRow className="xl:grid-cols-4">
          <StatCard
            label="📊 ISSQN em análise"
            value={String(issGuides.length)}
            description="Guias vinculadas à verificação fiscal"
            icon={ReceiptText}
            tone="blue"
          />
          <StatCard
            label="⚠ Pendências fiscais"
            value={String(pendingGuides.length)}
            description="Guias sem compensação confirmada"
            icon={FileSpreadsheet}
            tone="amber"
          />
          <StatCard
            label="✅ Validados"
            value={String(validatedGuides.length)}
            description="Casos já conciliados pelo setor"
            icon={CheckCircle2}
            tone="emerald"
          />
          <StatCard
            label="⏱ Casos críticos"
            value={String(criticalCases.length)}
            description="Pendências com pressão de prazo"
            icon={Clock3}
            tone="rose"
          />
        </PageStatsRow>

        <PageMainGrid>
          <PageMainContent>
            <TableCard
              title="📌 Fila de verificação fiscal"
              description="Casos ordenados por risco, pendência e prazo."
              icon={Scale}
              actions={
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant="outline"
                    className="rounded-full border-slate-200 bg-slate-50 text-slate-700"
                  >
                    {formatCurrency(totalValue)} em base fiscal
                  </Badge>
                  <Badge
                    variant="outline"
                    className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700"
                  >
                    {formatCurrency(validatedValue)} validados
                  </Badge>
                </div>
              }
            >
              <div className="space-y-4">
                {priorityQueue.map(({ process, guide }) => {
                  const isCritical =
                    guide.status === "pendente" &&
                    (process.sla.breached || process.sla.hoursRemaining <= 8);
                  const hasMissingFiscalData =
                    !process.property.iptu || !process.property.registration;

                  return (
                    <div
                      key={`${process.id}:${guide.code}`}
                      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-semibold text-slate-950">
                              {process.protocol}
                            </p>
                            <Badge
                              variant="outline"
                              className={
                                guide.status === "compensada"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-amber-200 bg-amber-50 text-amber-600 dark:text-amber-400"
                              }
                            >
                              {guide.status === "compensada" ? "✅ Validado" : "⚠ Pendente"}
                            </Badge>
                            {isCritical ? (
                              <Badge
                                variant="outline"
                                className="border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400"
                              >
                                ⏱ Crítico
                              </Badge>
                            ) : null}
                            {hasMissingFiscalData ? (
                              <Badge
                                variant="outline"
                                className="border-amber-200 bg-amber-50 text-amber-600 dark:text-amber-400"
                              >
                                Dados fiscais incompletos
                              </Badge>
                            ) : null}
                          </div>

                          <p
                            className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-slate-900"
                            title={process.title}
                          >
                            {process.title}
                          </p>
                          <p
                            className="mt-1 sig-fit-copy text-sm text-slate-500"
                            title={process.address}
                          >
                            {process.address}
                          </p>
                        </div>

                        <Button asChild variant="outline" className="rounded-full">
                          <Link to={`/processos/${process.id}`}>Abrir processo</Link>
                        </Button>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                            Guia
                          </p>
                          <p
                            className="mt-2 sig-fit-title text-sm font-semibold text-slate-950"
                            title={guide.code}
                          >
                            {guide.code}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                            Valor ISSQN
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-950">
                            {formatCurrency(guide.amount)}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                            Cadastro fiscal
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-950">
                            IPTU {process.property.iptu || "não informado"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Matrícula {process.property.registration || "não informada"}
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                            Verificação
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-950">
                            {process.property.area.toFixed(2)} m²
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            SLA {process.sla.hoursRemaining}h
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </TableCard>
          </PageMainContent>

          <PageSideContent>
            <SectionCard
              title="⚠ Alertas e conformidade"
              description="Riscos imediatos da fila fiscal."
            >
              <div className="space-y-3">
                <AlertCard
                  title="⛔ Casos bloqueados"
                  description={
                    blockedCases.length > 0
                      ? `${blockedCases.length} processo(s) com bloqueio documental ou prazo vencido.`
                      : "Nenhum bloqueio fiscal relevante agora."
                  }
                  tone={blockedCases.length > 0 ? "danger" : "success"}
                  icon={AlertTriangle}
                />
                <AlertCard
                  title="📄 Dados fiscais ausentes"
                  description={
                    missingFiscalData.length > 0
                      ? `${missingFiscalData.length} cadastro(s) sem IPTU ou matrícula completa.`
                      : "Base fiscal completa na fila atual."
                  }
                  tone={missingFiscalData.length > 0 ? "warning" : "success"}
                  icon={FileSpreadsheet}
                />
                <AlertCard
                  title="📌 Atenção de compliance"
                  description={
                    criticalCases.length > 0
                      ? `${criticalCases.length} caso(s) podem comprometer prazo e arrecadação.`
                      : "Sem pressão crítica de compliance no momento."
                  }
                  tone={criticalCases.length > 0 ? "warning" : "success"}
                  icon={Scale}
                />
              </div>
            </SectionCard>

            <SectionCard
              title="✅ Validações recentes"
              description="Últimos casos conciliados."
            >
              <div className="space-y-3">
                {validatedGuides.slice(0, 4).map(({ process, guide }) => (
                  <div
                    key={`${process.id}:${guide.code}:validated`}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-950">
                          {process.protocol}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{guide.code}</p>
                      </div>
                      <span className="text-sm font-semibold text-emerald-700">
                        {formatCurrency(guide.amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="🕘 Histórico recente"
              description="Movimentos recentes do setor."
            >
              <div className="space-y-3">
                {recentActivity.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <p className="text-sm font-semibold text-slate-950">{entry.protocol}</p>
                    <p className="mt-1 text-sm text-slate-700">{entry.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{entry.detail}</p>
                    <p className="mt-2 text-xs text-slate-400">{entry.at}</p>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="🏛 Atalhos fiscais"
              description="Ações rápidas do setor."
            >
              <div className="space-y-3">
                <Button asChild variant="outline" className="h-11 w-full justify-start rounded-2xl">
                  <Link to="/prefeitura/financeiro">
                    <Landmark className="mr-2 h-4 w-4" />
                    Voltar ao financeiro
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-11 w-full justify-start rounded-2xl">
                  <Link to="/prefeitura/financeiro/protocolos">
                    <ReceiptText className="mr-2 h-4 w-4" />
                    Guias e recolhimento
                  </Link>
                </Button>
              </div>
            </SectionCard>
          </PageSideContent>
        </PageMainGrid>
      </PageShell>
    </PortalFrame>
  );
}
