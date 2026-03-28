import {
  ArrowRight,
  Banknote,
  Building2,
  FileSpreadsheet,
  Landmark,
  ReceiptText,
  Scale,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCard } from "@/components/platform/AlertCard";
import { FeeTableManager } from "@/components/platform/FeeTableManager";
import { InternalTabs } from "@/components/platform/InternalTabs";
import { PageHeader } from "@/components/platform/PageHeader";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionCard } from "@/components/platform/SectionCard";
import { TableCard } from "@/components/platform/TableCard";
import { WorkflowStageBoard } from "@/components/platform/WorkflowStageBoard";
import {
  PageMainContent,
  PageMainGrid,
  PageShell,
  PageSideContent,
  PageStatsRow,
} from "@/components/platform/PageShell";
import { StatCard } from "@/components/platform/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  defaultApprovalRateProfiles,
  defaultIssRateProfiles,
  formatCurrency,
  getProcessPaymentGuides,
  getVisibleProcessesByScope,
} from "@/lib/platform";
import {
  defaultMunicipalWorkflowStages,
  type MunicipalFeeRule,
  type MunicipalFeeTable,
} from "@/lib/govtech";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";

type FinanceSection =
  | "visao-geral"
  | "guias"
  | "pagamentos"
  | "conciliacao"
  | "tabelas"
  | "workflow"
  | "historico";

export function FinanceDeskPage() {
  const { session } = usePlatformSession();
  const { scopeId, institutionSettingsCompat, municipalityId } = useMunicipality();
  const { processes: allProcesses, getInstitutionSettings, saveInstitutionSettings } = usePlatformData();
  const processes = getVisibleProcessesByScope(session, scopeId, allProcesses);
  const tenantSettings = institutionSettingsCompat ?? getInstitutionSettings(scopeId ?? session.tenantId);
  const [section, setSection] = useState<FinanceSection>("visao-geral");
  const [feeStatus, setFeeStatus] = useState("");
  const currentUnit = session.department || session.title || "Financeiro";

  const guides = processes.flatMap((process) =>
    getProcessPaymentGuides(process, tenantSettings).map((guide) => ({ process, guide })),
  );
  const protocolGuides = guides.filter(({ guide }) => guide.kind === "protocolo");
  const issGuides = guides.filter(({ guide }) => guide.kind === "iss_obra");
  const approvalGuides = guides.filter(({ guide }) => guide.kind === "aprovacao_final");
  const settledGuides = guides.filter(({ guide }) => guide.status === "compensada");
  const pendingGuides = guides.filter(({ guide }) => guide.status === "pendente");
  const totalValue = guides.reduce((sum, { guide }) => sum + guide.amount, 0);
  const settledValue = settledGuides.reduce((sum, { guide }) => sum + guide.amount, 0);

  const inconsistencyCount = guides.filter(({ process, guide }) => {
    if (guide.status !== "pendente") return false;
    return process.status === "deferido" || process.status === "arquivado";
  }).length;

  const unmatchedPayments = pendingGuides.filter(({ process }) => process.status === "deferido");
  const manualConfirmationTasks = pendingGuides.filter(({ process }) => process.status === "pagamento_pendente");
  const criticalPending = pendingGuides.slice(0, 8);

  const recentFinancialEvents = processes
    .flatMap((process) =>
      process.auditTrail
        .filter((entry) => entry.category === "financeiro")
        .slice(0, 2)
        .map((entry) => ({
          id: `${process.id}-${entry.id}`,
          protocol: process.protocol,
          title: entry.title,
          detail: entry.detail,
          actor: entry.actor,
          at: entry.at,
        })),
    )
    .slice(0, 10);
  const dispatchRows = useMemo(
    () =>
      processes.flatMap((process) =>
        process.dispatches.map((dispatch) => ({
          id: `${process.id}-${dispatch.id}`,
          processId: process.id,
          protocol: process.protocol,
          title: process.title,
          from: dispatch.from,
          to: dispatch.to,
          subject: dispatch.subject,
          dueDate: dispatch.dueDate,
          dispatchStatus: dispatch.status,
          priority: dispatch.priority ?? "media",
          assignedTo: dispatch.assignedTo || "",
          currentFolder: process.processControl?.currentFolder || dispatch.to || process.sla.currentStage,
        })),
      ),
    [processes],
  );
  const receivedAtFinance = useMemo(
    () =>
      dispatchRows.filter(
        (item) =>
          item.to.toLowerCase().includes(currentUnit.toLowerCase()) ||
          item.currentFolder.toLowerCase().includes(currentUnit.toLowerCase()),
      ),
    [currentUnit, dispatchRows],
  );
  const generatedByFinance = useMemo(
    () => dispatchRows.filter((item) => item.from.toLowerCase().includes(currentUnit.toLowerCase())),
    [currentUnit, dispatchRows],
  );
  const restrictedTransitCount = useMemo(
    () => processes.filter((process) => (process.processControl?.externalTransitView ?? "completo") === "restrito").length,
    [processes],
  );
  const criticalDispatches = useMemo(
    () =>
      dispatchRows.filter(
        (item) => item.priority === "critica" || item.priority === "alta" || item.dispatchStatus === "aguardando",
      ).slice(0, 5),
    [dispatchRows],
  );

  const guidesByIssueDate = useMemo(
    () =>
      [...guides].sort((a, b) => {
        const aDate = a.guide.dueDate || "";
        const bDate = b.guide.dueDate || "";
        return aDate.localeCompare(bDate);
      }),
    [guides],
  );

  const feeTable: MunicipalFeeTable = {
    id: `fee-table-${scopeId ?? "platform"}`,
    tenantId: municipalityId ?? scopeId ?? session.tenantId ?? "platform",
    code: "financeiro-geral",
    label: "Tabela Financeira Municipal",
    description:
      "Consolida protocolo, ISSQN da obra e taxa final de aprovação da Prefeitura contratante.",
    currency: "BRL",
    active: true,
  };

  const feeRules: MunicipalFeeRule[] = [
    {
      id: "rule-protocolo",
      tableId: feeTable.id,
      code: "TAXA_PROTOCOLO",
      label: "Taxa inicial de protocolo",
      kind: "fixed",
      amount: tenantSettings?.taxaProtocolo ?? 35.24,
      processType: "licenciamento",
    },
    ...((tenantSettings?.issRateProfiles && tenantSettings.issRateProfiles.length > 0
      ? tenantSettings.issRateProfiles
      : defaultIssRateProfiles
    ).map((profile) => ({
      id: `rule-iss-${profile.id}`,
      tableId: feeTable.id,
      code: `ISS_${profile.id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`,
      label: `ISSQN ${profile.label}`,
      kind: "per_square_meter" as const,
      rate: profile.rate,
      processType: "licenciamento",
    }))),
    ...((tenantSettings?.approvalRateProfiles && tenantSettings.approvalRateProfiles.length > 0
      ? tenantSettings.approvalRateProfiles
      : defaultApprovalRateProfiles
    ).map((profile) => ({
      id: `rule-aprovacao-${profile.id}`,
      tableId: feeTable.id,
      code: `HAB_${profile.id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`,
      label: `Habite-se ${profile.label}`,
      kind: "per_square_meter" as const,
      rate: profile.rate,
      processType: "licenciamento",
      occupancyPermit: true,
      constructionStandard: profile.standard,
    }))),
  ];

  const sampleProcess = processes[0];
  const sampleContext = {
    processType: sampleProcess?.type ?? "licenciamento",
    builtArea: sampleProcess?.property.area ?? 180,
    occupancyPermitArea: sampleProcess?.property.area ?? 180,
    constructionStandard: sampleProcess?.property.constructionStandard ?? "medio",
    professionalCategory: "engenheiro",
    baseValue: sampleProcess
      ? getProcessPaymentGuides(sampleProcess, tenantSettings).reduce((sum, item) => sum + item.amount, 0)
      : 0,
  };

  const bankProfile = {
    bankName: "Banco conveniado municipal",
    settlementMode: tenantSettings?.chavePix ? "PIX e baixa manual" : "Baixa manual e retorno bancário",
    agreementCode: tenantSettings?.guiaPrefixo || "DAM",
    beneficiary:
      tenantSettings?.beneficiarioArrecadacao ||
      tenantSettings?.secretariaResponsavel ||
      "Prefeitura contratante",
  };

  const navItems = [
    { value: "visao-geral", label: "Visão geral", helper: "Resumo e prioridades" },
    { value: "guias", label: "Guias emitidas", helper: "Emissão e consulta" },
    { value: "pagamentos", label: "Pagamentos", helper: "Baixa e confirmação" },
    { value: "conciliacao", label: "Conciliação", helper: "Retorno, divergências e controle" },
    { value: "tabelas", label: "Tabelas e regras", helper: "Parâmetros e cálculo" },
    { value: "workflow", label: "Workflow financeiro", helper: "Etapas e dependências" },
    { value: "historico", label: "Histórico", helper: "Eventos e rastreabilidade" },
  ] as const;

  return (
    <PortalFrame eyebrow="FINANCEIRO MUNICIPAL" title="Controle financeiro, guias e arrecadação">
      <PageShell>
        <PageHeader
          eyebrow="Operação financeira"
          title="Guias, pagamentos e conciliação"
          description="Organize a arrecadação municipal com visão executiva e operação financeira clara."
          icon={Wallet}
        />

        <InternalTabs
          items={navItems as unknown as Array<{ value: string; label: string; helper?: string }>}
          value={section}
          onChange={(value) => setSection(value as FinanceSection)}
        />

        {section === "visao-geral" ? (
          <>
            <PageStatsRow>
              <StatCard label="Guias emitidas" value={String(guides.length)} description="Emissão total vinculada aos processos" icon={ReceiptText} tone="blue" />
              <StatCard label="Pagamentos pendentes" value={String(pendingGuides.length)} description="Guias ainda aguardando baixa" icon={FileSpreadsheet} tone="amber" />
              <StatCard label="Confirmados" value={String(settledGuides.length)} description="Baixas já compensadas no fluxo" icon={Building2} tone="emerald" />
              <StatCard label="Arrecadação" value={formatCurrency(settledValue)} description="Valor total confirmado no período" icon={Landmark} tone="default" />
            </PageStatsRow>

            <PageMainGrid>
              <PageMainContent>
              <TableCard
                title="Visão financeira da Prefeitura"
                description="Resumo executivo da emissão, dos pagamentos e da arrecadação."
                icon={ReceiptText}
                actions={
                  <div className="flex flex-wrap gap-2">
                    <Badge className="rounded-full bg-slate-950 text-white hover:bg-slate-950">Operação ativa</Badge>
                    <Badge variant="outline" className="rounded-full border-slate-300 text-slate-700">
                      {tenantSettings?.guiaPrefixo || "DAM"} / {tenantSettings?.protocoloPrefixo || "SIG"}
                    </Badge>
                  </div>
                }
              >
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="sig-dark-panel rounded-2xl border border-slate-200 bg-white p-5">
                    <p className="sig-label">Guias de protocolo</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{protocolGuides.length}</p>
                    <p className="mt-2 text-sm text-slate-500">Emissão inicial e arrecadação de entrada.</p>
                  </div>
                  <div className="sig-dark-panel rounded-2xl border border-slate-200 bg-white p-5">
                    <p className="sig-label">ISSQN da obra</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{issGuides.length}</p>
                    <p className="mt-2 text-sm text-slate-500">Cálculo complementar por metragem da obra.</p>
                  </div>
                  <div className="sig-dark-panel rounded-2xl border border-slate-200 bg-white p-5">
                    <p className="sig-label">Aprovação final</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{approvalGuides.length}</p>
                    <p className="mt-2 text-sm text-slate-500">Encerramento financeiro e habite-se.</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-5 xl:grid-cols-2">
                  <div className="sig-dark-panel rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-slate-950">Situação dos pagamentos</p>
                        <p className="mt-1 text-sm text-slate-500">Baixa, confirmação e pendências.</p>
                      </div>
                      <Button asChild className="rounded-full bg-slate-950 hover:bg-slate-900">
                        <Link to="/prefeitura/financeiro/protocolos">
                          Abrir fila
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="sig-dark-panel rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="sig-label">Pendentes</p>
                        <p className="mt-2 text-lg font-semibold text-slate-950">{pendingGuides.length}</p>
                        <p className="mt-1 text-sm text-slate-500">Guias aguardando baixa.</p>
                      </div>
                      <div className="sig-dark-panel rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="sig-label">Confirmados</p>
                        <p className="mt-2 text-lg font-semibold text-slate-950">{settledGuides.length}</p>
                        <p className="mt-1 text-sm text-slate-500">Baixas confirmadas.</p>
                      </div>
                    </div>
                  </div>

                  <div className="sig-dark-panel rounded-2xl border border-slate-200 bg-slate-50/60 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-semibold text-slate-950">Conciliação e controle</p>
                        <p className="mt-1 text-sm text-slate-500">Retorno, divergências e controle do setor.</p>
                      </div>
                      <Button asChild className="rounded-full bg-slate-950 hover:bg-slate-900">
                        <Link to="/prefeitura/financeiro/iptu">
                          Abrir módulo
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div className="sig-dark-panel rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="sig-label">Valor sob gestão</p>
                        <p className="mt-2 text-lg font-semibold text-slate-950">{formatCurrency(totalValue)}</p>
                        <p className="mt-1 text-sm text-slate-500">Volume sob gestão.</p>
                      </div>
                      <div className="sig-dark-panel rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="sig-label">Divergências</p>
                        <p className="mt-2 text-lg font-semibold text-slate-950">{inconsistencyCount}</p>
                        <p className="mt-1 text-sm text-slate-500">Ocorrências sob revisão.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </TableCard>
              </PageMainContent>

              <PageSideContent>
                <SectionCard title="Alertas financeiros" description="Divergências, baixas críticas e atenção imediata do setor.">
                  <div className="space-y-3">
                    <AlertCard
                      title="Divergências"
                      description={
                        inconsistencyCount > 0
                          ? `${inconsistencyCount} guia(s) pendente(s) em processos já encerrados ou deferidos.`
                          : "Nenhuma divergência financeira relevante encontrada."
                      }
                      tone={inconsistencyCount > 0 ? "danger" : "success"}
                    />
                    <AlertCard
                      title="Pendências críticas"
                      description={
                        criticalPending.length > 0
                          ? `${criticalPending.length} guia(s) exigem acompanhamento de baixa.`
                          : "Não há fila crítica de baixa financeira."
                      }
                      tone={criticalPending.length > 0 ? "warning" : "success"}
                    />
                    {criticalDispatches.length === 0 ? (
                      <div className="sig-dark-panel rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                        Nenhum despacho crítico para o financeiro.
                      </div>
                    ) : (
                      criticalDispatches.slice(0, 2).map((item) => (
                        <div key={item.id} className="sig-dark-panel rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="sig-fit-title text-sm font-semibold leading-6 text-slate-950">{item.protocol}</p>
                            <Badge variant="outline" className="rounded-full border-slate-200 text-slate-700">
                              {item.priority}
                            </Badge>
                          </div>
                          <p className="sig-fit-copy mt-1 text-sm leading-6 text-slate-500">{item.subject}</p>
                          <p className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-500">Pasta atual</p>
                          <p className="mt-1 text-sm text-slate-900">{item.currentFolder}</p>
                        </div>
                      ))
                    )}
                  </div>
                </SectionCard>

                <SectionCard title="Conciliação e convênio" description="Perfil bancário e resumo do fluxo operacional do setor.">
                  <div className="space-y-4">
                    <div className="sig-dark-panel rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Convênio</p>
                      <p className="mt-2 text-sm font-semibold text-slate-950">{bankProfile.bankName}</p>
                      <p className="mt-1 text-sm text-slate-600">{bankProfile.agreementCode}</p>
                      <p className="mt-1 text-sm text-slate-500">{bankProfile.settlementMode}</p>
                    </div>

                    <div className="grid gap-3">
                      <div className="sig-dark-panel rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="sig-label">Recebidos</p>
                        <p className="mt-2 text-lg font-semibold text-slate-950">{receivedAtFinance.length}</p>
                        <p className="mt-1 text-sm text-slate-500">Caixa atual do financeiro.</p>
                      </div>
                      <div className="sig-dark-panel rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="sig-label">Gerados</p>
                        <p className="mt-2 text-lg font-semibold text-slate-950">{generatedByFinance.length}</p>
                        <p className="mt-1 text-sm text-slate-500">Despachos e retornos emitidos.</p>
                      </div>
                      <div className="sig-dark-panel rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <p className="sig-label">Fluxo restrito</p>
                        <p className="mt-2 text-lg font-semibold text-slate-950">{restrictedTransitCount}</p>
                        <p className="mt-1 text-sm text-slate-500">Processos com tramitação interna protegida.</p>
                      </div>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="Eventos recentes" description="Últimos registros de arrecadação e conferência do setor.">
                  <div className="space-y-3">
                    {recentFinancialEvents.length === 0 ? (
                      <div className="sig-dark-panel rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                        Nenhum evento financeiro recente encontrado.
                      </div>
                    ) : (
                      recentFinancialEvents.slice(0, 3).map((event) => (
                        <div key={event.id} className="sig-dark-panel rounded-2xl border border-slate-200 bg-white p-4">
                          <p className="text-sm font-semibold text-slate-950">{event.protocol}</p>
                          <p className="mt-1 text-sm text-slate-800">{event.title}</p>
                          <p className="mt-1 text-sm text-slate-500">{event.detail}</p>
                          <p className="mt-2 text-xs text-slate-500">{event.actor} • {event.at}</p>
                        </div>
                      ))
                    )}
                  </div>
                </SectionCard>
              </PageSideContent>
            </PageMainGrid>
          </>
        ) : null}

        {section === "guias" ? (
          <TableCard title="Guias emitidas" description="Emissões do fluxo financeiro municipal, com leitura clara por protocolo, vencimento e valor." icon={ReceiptText}>
            <div className="space-y-3">
              {guidesByIssueDate.length === 0 ? (
                <div className="sig-dark-panel rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
                  Nenhuma guia emitida encontrada.
                </div>
              ) : (
                guidesByIssueDate.map(({ process, guide }) => (
                  <div key={`${process.id}-${guide.kind}`} className="sig-dark-panel rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="sig-fit-title text-sm font-semibold leading-6 text-slate-950" title={guide.code}>{guide.code}</p>
                          <Badge variant="outline" className="rounded-full">{guide.label}</Badge>
                          <Badge variant="outline" className={guide.status === "compensada" ? "border-green-200 bg-green-50 text-green-600 dark:text-green-400" : "border-amber-200 bg-amber-50 text-amber-600 dark:text-amber-400"}>
                            {guide.status === "compensada" ? "Confirmada" : "Pendente"}
                          </Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-slate-800" title={`${process.protocol} • ${process.ownerName}`}>{process.protocol} • {process.ownerName}</p>
                        <p className="sig-fit-copy mt-1 text-sm leading-6 text-slate-500" title={process.title}>{process.title}</p>
                      </div>
                      <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2 xl:min-w-[560px] xl:grid-cols-4">
                        <div className="sig-dark-panel rounded-xl bg-slate-50 px-3 py-2">Emissão: {guide.dueDate}</div>
                        <div className="sig-dark-panel rounded-xl bg-slate-50 px-3 py-2">Vencimento: {guide.dueDate}</div>
                        <div className="sig-dark-panel rounded-xl bg-slate-50 px-3 py-2">Valor: {formatCurrency(guide.amount)}</div>
                        <div className="sig-dark-panel rounded-xl bg-slate-50 px-3 py-2">
                          <Link to={`/processos/${process.id}`} className="font-medium text-slate-700">
                            Abrir processo
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </TableCard>
        ) : null}

        {section === "pagamentos" ? (
          <PageMainGrid>
            <PageMainContent>
              <TableCard title="Pagamentos" description="Situação de baixa, confirmação e acompanhamento das guias emitidas." icon={Banknote}>
                <div className="space-y-3">
                  {pendingGuides.length === 0 ? (
                    <div className="sig-dark-panel rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
                      Nenhuma guia pendente de pagamento no momento.
                    </div>
                  ) : (
                    pendingGuides.map(({ process, guide }) => (
                      <div key={`${process.id}-${guide.kind}`} className="sig-dark-panel rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="sig-fit-title text-sm font-semibold leading-6 text-slate-950" title={process.protocol}>{process.protocol}</p>
                              <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-600 dark:text-amber-400">
                                {guide.label}
                              </Badge>
                            </div>
                            <p className="sig-fit-copy mt-1 text-sm leading-6 text-slate-800" title={process.ownerName}>{process.ownerName}</p>
                            <p className="sig-fit-copy mt-1 text-sm leading-6 text-slate-500" title={guide.code}>{guide.code}</p>
                          </div>
                          <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2 xl:min-w-[560px] xl:grid-cols-4">
                            <div className="sig-dark-panel rounded-xl bg-slate-50 px-3 py-2">Valor: {formatCurrency(guide.amount)}</div>
                            <div className="sig-dark-panel rounded-xl bg-slate-50 px-3 py-2">Vencimento: {guide.dueDate}</div>
                            <div className="sig-dark-panel rounded-xl bg-slate-50 px-3 py-2">Status: Pendente</div>
                            <div className="sig-dark-panel rounded-xl bg-slate-50 px-3 py-2">
                              <Link to={`/processos/${process.id}`} className="font-medium text-slate-700">
                                Conferir
                              </Link>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </TableCard>
            </PageMainContent>

            <PageSideContent>
              <SectionCard title="Resumo de baixa" description="Leitura curta da confirmação de pagamentos.">
                <div className="space-y-3">
                  <AlertCard
                    title="Pendentes"
                    description={`${pendingGuides.length} guia(s) aguardam confirmação.`}
                    tone={pendingGuides.length > 0 ? "warning" : "success"}
                  />
                  <AlertCard
                    title="Confirmados"
                    description={`${settledGuides.length} guia(s) já foram compensadas.`}
                    tone={settledGuides.length > 0 ? "success" : "default"}
                  />
                  <AlertCard
                    title="Valor arrecadado"
                    description={formatCurrency(settledValue)}
                    tone="default"
                  />
                </div>
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        ) : null}

        {section === "conciliacao" ? (
          <PageMainGrid>
            <PageMainContent>
              <TableCard title="Conciliação bancária" description="Retorno bancário, divergências e tarefas manuais de confirmação do setor." icon={Scale}>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="sig-dark-panel rounded-2xl border border-slate-200 bg-white p-5">
                    <p className="sig-label">Perfil bancário</p>
                    <p className="mt-2 text-base font-semibold text-slate-950">{bankProfile.bankName}</p>
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      <p>Modo: {bankProfile.settlementMode}</p>
                      <p>Convênio / prefixo: {bankProfile.agreementCode}</p>
                      <p>Beneficiário: {bankProfile.beneficiary}</p>
                    </div>
                  </div>
                  <div className="sig-dark-panel rounded-2xl border border-slate-200 bg-white p-5">
                    <p className="sig-label">Controle da conciliação</p>
                    <div className="mt-3 grid gap-2 text-sm text-slate-600">
                      <div className="sig-dark-panel rounded-xl bg-slate-50 p-3">Baixas pendentes: {pendingGuides.length}</div>
                      <div className="sig-dark-panel rounded-xl bg-slate-50 p-3">Pagamentos sem vínculo claro: {unmatchedPayments.length}</div>
                      <div className="sig-dark-panel rounded-xl bg-slate-50 p-3">Confirmações manuais: {manualConfirmationTasks.length}</div>
                      <div className="sig-dark-panel rounded-xl bg-slate-50 p-3">Divergências: {inconsistencyCount}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  {criticalPending.length === 0 ? (
                    <div className="sig-dark-panel rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                      Nenhuma tarefa de conciliação pendente no momento.
                    </div>
                  ) : (
                    criticalPending.map(({ process, guide }) => (
                      <div key={`${process.id}-${guide.kind}`} className="sig-dark-panel rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-950">{process.protocol}</p>
                            <p className="mt-1 text-sm text-slate-800">{guide.label}</p>
                            <p className="mt-1 sig-fit-copy text-sm text-slate-500" title={guide.code}>{guide.code}</p>
                          </div>
                          <div className="grid gap-2 text-sm text-slate-600 md:grid-cols-3">
                            <div className="sig-dark-panel rounded-xl bg-slate-50 px-3 py-2">Valor: {formatCurrency(guide.amount)}</div>
                            <div className="sig-dark-panel rounded-xl bg-slate-50 px-3 py-2">Vencimento: {guide.dueDate}</div>
                            <div className="sig-dark-panel rounded-xl bg-slate-50 px-3 py-2">Situação: Pendente</div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </TableCard>
            </PageMainContent>

            <PageSideContent>
              <SectionCard title="Alertas da conciliação" description="Pontos que exigem acompanhamento próximo do setor.">
                <div className="space-y-3">
                  <AlertCard
                    title="Baixas em aberto"
                    description={`${pendingGuides.length} guia(s) ainda não compensada(s).`}
                    tone={pendingGuides.length > 0 ? "warning" : "success"}
                  />
                  <AlertCard
                    title="Divergências"
                    description={`${inconsistencyCount} ocorrência(s) com potencial divergência.`}
                    tone={inconsistencyCount > 0 ? "danger" : "success"}
                  />
                  <AlertCard
                    title="Tarefa manual"
                    description={`${manualConfirmationTasks.length} item(ns) dependem de conferência manual do setor.`}
                    tone={manualConfirmationTasks.length > 0 ? "warning" : "success"}
                  />
                </div>
              </SectionCard>
            </PageSideContent>
          </PageMainGrid>
        ) : null}

        {section === "tabelas" ? (
          <FeeTableManager
            table={feeTable}
            rules={feeRules}
            sampleContext={sampleContext}
            sampleUsage={sampleProcess?.property.usage ?? "Residencial"}
            sampleStandard={sampleProcess?.property.constructionStandard ?? "medio"}
            title="Tabelas e regras financeiras"
            subtitle="Taxas de protocolo, ISSQN por tipo de construção e habite-se por padrão de acabamento."
            values={{
              taxaProtocolo: tenantSettings?.taxaProtocolo ?? 35.24,
              taxaIssPorMetroQuadrado: tenantSettings?.taxaIssPorMetroQuadrado ?? 0,
              issRateProfiles: tenantSettings?.issRateProfiles ?? defaultIssRateProfiles,
              taxaAprovacaoFinal: tenantSettings?.taxaAprovacaoFinal ?? 0,
              approvalRateProfiles: tenantSettings?.approvalRateProfiles ?? defaultApprovalRateProfiles,
            }}
            statusMessage={feeStatus}
            onSave={(values) => {
              if (!tenantSettings) {
                setFeeStatus("Nenhuma Prefeitura ativa foi localizada para atualizar a tabela.");
                return;
              }

              saveInstitutionSettings({
                ...tenantSettings,
                taxaProtocolo: Number(values.taxaProtocolo || 0),
                taxaIssPorMetroQuadrado: Number(values.taxaIssPorMetroQuadrado || 0),
                issRateProfiles: values.issRateProfiles ?? defaultIssRateProfiles,
                taxaAprovacaoFinal: Number(values.taxaAprovacaoFinal || 0),
                approvalRateProfiles: values.approvalRateProfiles ?? defaultApprovalRateProfiles,
              });
              setFeeStatus("Tabela financeira atualizada com sucesso. As guias pendentes foram recalculadas automaticamente conforme o tipo e o padrão da construção.");
            }}
          />
        ) : null}

        {section === "workflow" ? (
          <WorkflowStageBoard
            currentStageCode="complementary_fee"
            stages={defaultMunicipalWorkflowStages}
            title="Workflow financeiro"
            description="A etapa financeira cobre guia inicial, compensação, ISSQN complementar e fechamento final."
          />
        ) : null}

        {section === "historico" ? (
          <TableCard title="Histórico financeiro" description="Últimos registros de emissão, conferência, retorno bancário e arrecadação." icon={FileSpreadsheet}>
            <div className="space-y-3">
              {recentFinancialEvents.length === 0 ? (
                <div className="sig-dark-panel rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                  Nenhum evento financeiro recente encontrado.
                </div>
              ) : (
                recentFinancialEvents.map((event) => (
                  <div key={event.id} className="sig-dark-panel rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-sm font-semibold text-slate-950">{event.protocol}</p>
                    <p className="mt-1 text-sm text-slate-800">{event.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{event.detail}</p>
                    <p className="mt-2 text-xs text-slate-500">{event.actor} • {event.at}</p>
                  </div>
                ))
              )}
            </div>
          </TableCard>
        ) : null}
      </PageShell>
    </PortalFrame>
  );
}
