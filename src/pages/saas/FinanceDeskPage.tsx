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
import { Checkbox } from "@/components/ui/checkbox";
import {
  defaultApprovalRateProfiles,
  defaultIssRateProfiles,
  formatCurrency,
  formatOfficialProcessNumber,
  formatOfficialProcessTitle,
  getProcessPaymentGuides,
  getVisibleProcessesByScope,
  isFinalApprovalFeeConfigured,
  isIssFeeConfigured,
} from "@/lib/platform";
import {
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
  const { municipality, scopeId, institutionSettingsCompat, municipalityId } = useMunicipality();
  const { processes: allProcesses, getInstitutionSettings, saveInstitutionSettings, issuePaymentGuide } = usePlatformData();
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const processes = getVisibleProcessesByScope(session, effectiveScopeId, allProcesses);
  const tenantSettings = institutionSettingsCompat ?? getInstitutionSettings(effectiveScopeId ?? session.tenantId);
  const issFeeConfigured = isIssFeeConfigured(tenantSettings);
  const finalFeeConfigured = isFinalApprovalFeeConfigured(tenantSettings);
  const [section, setSection] = useState<FinanceSection>("visao-geral");
  const [feeStatus, setFeeStatus] = useState("");
  const [finalGuideStatus, setFinalGuideStatus] = useState("");
  const [finalGuideBusyId, setFinalGuideBusyId] = useState("");
  const [workflowStatus, setWorkflowStatus] = useState("");
  const currentUnit = session.department || session.title || "Financeiro";

  const guides = processes.flatMap((process) =>
    getProcessPaymentGuides(process, tenantSettings).map((guide) => ({ process, guide })),
  );
  const protocolGuides = guides.filter(({ guide }) => guide.kind === "protocolo");
  const issGuides = guides.filter(({ guide }) => guide.kind === "iss_obra");
  const approvalGuides = guides.filter(({ guide }) => guide.kind === "aprovacao_final");
  const settledGuides = guides.filter(({ guide }) => guide.status === "compensada");
  const pendingGuides = guides.filter(({ guide }) => guide.status === "pendente");
  const finalGuideCandidates = processes.filter((process) => {
    if (tenantSettings?.finalApprovalFeeEnabled === false || !finalFeeConfigured) return false;
    const processGuides = getProcessPaymentGuides(process, tenantSettings);
    const hasFinalGuide = processGuides.some((guide) => guide.kind === "aprovacao_final");
    const protocolPaid = processGuides.some(
      (guide) => guide.kind === "protocolo" && guide.status === "compensada",
    );
    const previouslyIssuedGuidesPaid = processGuides
      .filter((guide) => guide.kind !== "aprovacao_final")
      .every((guide) => guide.status === "compensada");
    const hasOpenRequirements = process.requirements.some(
      (requirement) => requirement.status === "aberta" || requirement.status === "respondida",
    );

    const currentFolder = process.processControl?.currentFolder?.toLowerCase() ?? "";
    const latestDispatchTarget = process.dispatches[0]?.to?.toLowerCase() ?? "";
    const routedToFinance =
      currentFolder.includes("finance") ||
      latestDispatchTarget.includes("finance");

    return (
      process.status === "analise_tecnica" &&
      routedToFinance &&
      !process.processControl?.onHold &&
      !hasOpenRequirements &&
      !hasFinalGuide &&
      protocolPaid &&
      previouslyIssuedGuidesPaid
    );
  });

  const handleWorkflowSetting = async (
    key: "issStageEnabled" | "finalApprovalFeeEnabled",
    enabled: boolean,
  ) => {
    if (!tenantSettings) {
      setWorkflowStatus("Nenhuma Prefeitura ativa foi localizada para alterar o workflow.");
      return;
    }
    if (enabled && key === "issStageEnabled" && !issFeeConfigured) {
      setWorkflowStatus("Configure e salve a tabela oficial de ISSQN antes de ativar esta etapa.");
      return;
    }
    if (enabled && key === "finalApprovalFeeEnabled" && !finalFeeConfigured) {
      setWorkflowStatus("Configure e salve a tabela oficial da taxa final antes de ativar esta etapa.");
      return;
    }

    setWorkflowStatus("");
    try {
      await saveInstitutionSettings({
        ...tenantSettings,
        [key]: enabled,
      });
      setWorkflowStatus("Workflow financeiro salvo no banco oficial.");
    } catch (error) {
      setWorkflowStatus(
        error instanceof Error
          ? `Não foi possível salvar o workflow financeiro: ${error.message}`
          : "Não foi possível salvar o workflow financeiro no banco oficial.",
      );
    }
  };

  const handleIssueFinalGuide = async (processId: string) => {
    if (!finalFeeConfigured) {
      setFinalGuideStatus("A tabela da taxa final ainda não foi configurada pela Prefeitura.");
      return;
    }
    setFinalGuideBusyId(processId);
    setFinalGuideStatus("");

    try {
      await issuePaymentGuide(processId, session.name, "aprovacao_final");
      setFinalGuideStatus("Guia final de aprovação emitida no banco oficial com sucesso.");
    } catch (error) {
      setFinalGuideStatus(
        error instanceof Error
          ? `Não foi possível emitir a guia final: ${error.message}`
          : "Não foi possível emitir a guia final no banco oficial.",
      );
    } finally {
      setFinalGuideBusyId("");
    }
  };

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
    tenantId: municipalityId ?? effectiveScopeId ?? session.tenantId ?? "platform",
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
                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
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
                      <Button asChild className="h-11 rounded-full bg-slate-950 hover:bg-slate-900">
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
                      <Button asChild className="h-11 rounded-full bg-slate-950 hover:bg-slate-900">
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
                            <p className="sig-fit-title text-sm font-semibold leading-6 text-slate-950">{formatOfficialProcessNumber(item.protocol)}</p>
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
                          <p className="text-sm font-semibold text-slate-950">{formatOfficialProcessNumber(event.protocol)}</p>
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
          <TableCard title="Guias emitidas" description="Emissões reais do fluxo financeiro municipal, vinculadas ao banco oficial." icon={ReceiptText}>
            <div className="space-y-3">
              {tenantSettings?.finalApprovalFeeEnabled !== false && !finalFeeConfigured ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  A taxa final está ativa, mas a tabela municipal ainda não foi configurada. Nenhuma nova guia final pode ser emitida até a Prefeitura salvar as regras oficiais.
                </div>
              ) : null}

              {finalGuideStatus ? (
                <div className={`rounded-2xl border px-4 py-3 text-sm ${
                  finalGuideStatus.startsWith("Guia final")
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}>
                  {finalGuideStatus}
                </div>
              ) : null}

              {finalGuideCandidates.length > 0 ? (
                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4">
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-slate-950">Prontos para taxa final / Habite-se</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Processos em análise técnica, sem pendências abertas e com cobranças anteriores compensadas.
                    </p>
                  </div>
                  <div className="space-y-3">
                    {finalGuideCandidates.map((process) => (
                      <div
                        key={`${process.id}:final-guide-candidate`}
                        className="flex flex-col gap-3 rounded-2xl border border-indigo-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-950">{formatOfficialProcessNumber(process.protocol)}</p>
                          <p className="mt-1 line-clamp-1 text-sm text-slate-600">{formatOfficialProcessTitle({ title: process.title, type: process.type })}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Área: {process.property.area.toFixed(2)} m² • Padrão: {process.property.constructionStandard || "não informado"}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button asChild variant="outline" className="rounded-full">
                            <Link to={`/processos/${process.id}`}>Conferir processo</Link>
                          </Button>
                          <Button
                            type="button"
                            className="rounded-full"
                            disabled={finalGuideBusyId === process.id}
                            onClick={() => void handleIssueFinalGuide(process.id)}
                          >
                            {finalGuideBusyId === process.id ? "Emitindo..." : "Emitir taxa final"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
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
                        <p className="sig-fit-copy mt-1 text-sm leading-6 text-slate-500" title={process.title}>{formatOfficialProcessTitle({ title: process.title, type: process.type })}</p>
                      </div>
                      <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2 xl:min-w-[560px] xl:grid-cols-4">
                        <div className="sig-dark-panel rounded-xl bg-slate-50 px-3 py-2">
                          Emissão: {guide.issuedAt ? new Date(guide.issuedAt).toLocaleDateString("pt-BR") : "não informada"}
                        </div>
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
                              <p className="sig-fit-title text-sm font-semibold leading-6 text-slate-950" title={process.protocol}>{formatOfficialProcessNumber(process.protocol)}</p>
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
                            <p className="text-sm font-semibold text-slate-950">{formatOfficialProcessNumber(process.protocol)}</p>
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
            onSave={async (values) => {
              if (!tenantSettings) {
                setFeeStatus("Nenhuma Prefeitura ativa foi localizada para atualizar a tabela.");
                return;
              }

              setFeeStatus("");
              try {
                await saveInstitutionSettings({
                  ...tenantSettings,
                  taxaProtocolo: Number(values.taxaProtocolo || 0),
                  taxaIssPorMetroQuadrado: Number(values.taxaIssPorMetroQuadrado || 0),
                  issRateProfiles: values.issRateProfiles ?? defaultIssRateProfiles,
                  taxaAprovacaoFinal: Number(values.taxaAprovacaoFinal || 0),
                  approvalRateProfiles: values.approvalRateProfiles ?? defaultApprovalRateProfiles,
                });
                setFeeStatus("Tabela financeira salva no banco oficial. Os novos valores serão usados nas próximas emissões; guias já emitidas preservam o valor original.");
              } catch (error) {
                setFeeStatus(
                  error instanceof Error
                    ? `Não foi possível salvar a tabela financeira: ${error.message}`
                    : "Não foi possível salvar a tabela financeira no banco oficial.",
                );
              }
            }}
          />
        ) : null}

        {section === "workflow" ? (
          <SectionCard
            title="Workflow financeiro da Prefeitura"
            description="Defina quais etapas financeiras realmente fazem parte do processo municipal. Essas escolhas controlam o fluxo operacional."
            icon={Landmark}
          >
            <div className="space-y-4">
              {workflowStatus ? (
                <div className={`rounded-2xl border px-4 py-3 text-sm ${
                  workflowStatus.startsWith("Workflow financeiro salvo")
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}>
                  {workflowStatus}
                </div>
              ) : null}

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="text-sm font-semibold text-slate-950">1. Guia de protocolo</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Etapa inicial obrigatória para abertura do processo.
                  </p>
                  <Badge className="mt-4 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                    Sempre ativa
                  </Badge>
                </div>

                <label className="flex cursor-pointer gap-4 rounded-2xl border border-slate-200 bg-white p-5">
                  <Checkbox
                    checked={tenantSettings?.issStageEnabled !== false}
                    onCheckedChange={(checked) =>
                      void handleWorkflowSetting("issStageEnabled", Boolean(checked))
                    }
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-950">2. ISSQN da obra</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Quando ativa, a Análise Técnica encaminha o processo ao IPTU/Fiscal e o setor emite a guia de ISSQN.
                    </p>
                  </div>
                </label>

                <label className="flex cursor-pointer gap-4 rounded-2xl border border-slate-200 bg-white p-5">
                  <Checkbox
                    checked={tenantSettings?.finalApprovalFeeEnabled !== false}
                    onCheckedChange={(checked) =>
                      void handleWorkflowSetting("finalApprovalFeeEnabled", Boolean(checked))
                    }
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-950">3. Taxa final / Habite-se</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Quando ativa, o processo passa pelo Financeiro antes do deferimento final.
                    </p>
                  </div>
                </label>
              </div>

              <div className="rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-sm text-sky-900">
                O fluxo operacional usa estas configurações como regra. Desativar uma etapa impede novas emissões daquela cobrança, sem alterar guias históricas já emitidas.
              </div>
            </div>
          </SectionCard>
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
                    <p className="text-sm font-semibold text-slate-950">{formatOfficialProcessNumber(event.protocol)}</p>
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
