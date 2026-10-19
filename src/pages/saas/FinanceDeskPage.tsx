import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  Building2,
  FileSpreadsheet,
  FolderOpen,
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
import { MarkerSelector } from "@/components/platform/MarkerSelector";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  buildProcessPath,
  defaultApprovalRateProfiles,
  defaultIssRateProfiles,
  formatCurrency,
  formatOfficialProcessNumber,
  formatOfficialProcessTitle,
  getOfficialProcessSequence,
  getPaymentGuideDisplayReference,
  getProcessPaymentGuides,
  getVisibleProcessesByScope,
  resolveSessionOperationalArea,
  type PaymentGuideKind,
  isFinalApprovalFeeConfigured,
  isOccupancyPermitProcessType,
  isIssFeeConfigured,
} from "@/lib/platform";
import { collectionModeLabel } from "@/lib/paymentCollection";
import {
  type MunicipalFeeRule,
  type MunicipalFeeTable,
} from "@/lib/govtech";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { useLivePlatformRefresh } from "@/hooks/useLivePlatformRefresh";
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
  const {
    processes: allProcesses,
    refreshRemoteStore,
    getInstitutionSettings,
    saveInstitutionSettings,
    issuePaymentGuide,
    markGuideAsPaid,
  } = usePlatformData();
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  useLivePlatformRefresh(refreshRemoteStore, { intervalMs: 8000 });
  const processes = getVisibleProcessesByScope(session, effectiveScopeId, allProcesses);
  const financeLedgerProcesses = useMemo(
    () =>
      allProcesses.filter(
        (process) =>
          Boolean(effectiveScopeId) &&
          (process.municipalityId ?? process.tenantId) === effectiveScopeId,
      ),
    [allProcesses, effectiveScopeId],
  );
  const tenantSettings = institutionSettingsCompat ?? getInstitutionSettings(effectiveScopeId ?? session.tenantId);
  const issFeeConfigured = isIssFeeConfigured(tenantSettings);
  const finalFeeConfigured = isFinalApprovalFeeConfigured(tenantSettings);
  const [section, setSection] = useState<FinanceSection>("visao-geral");
  const [feeStatus, setFeeStatus] = useState("");
  const [workflowStatus, setWorkflowStatus] = useState("");
  const [constructionGuideStatus, setConstructionGuideStatus] = useState("");
  const [constructionGuideBusyId, setConstructionGuideBusyId] = useState("");
  const [manualPaymentStatus, setManualPaymentStatus] = useState("");
  const [manualPaymentBusyKey, setManualPaymentBusyKey] = useState("");
  const currentUnit = session.department || session.title || "Financeiro";
  const canConfirmManualPayment =
    session.role !== "prefeitura_admin" &&
    resolveSessionOperationalArea(session) === "financeiro";
  const canConfigureWorkflow =
    session.role === "prefeitura_admin" ||
    session.role === "master_admin" ||
    session.role === "master_ops";
  const constructionGuideIssuerMode =
    tenantSettings?.constructionGuideIssuerMode ?? "analise";
  const financeCanIssueConstructionGuide =
    constructionGuideIssuerMode === "financeiro" || constructionGuideIssuerMode === "ambos";

  // O financeiro precisa manter o livro histórico de guias da Prefeitura mesmo
  // depois que o processo muda de pasta (ex.: volta para Análise Urbanística).
  // A fila operacional continua usando `processes`; somente o livro financeiro
  // usa todos os processos do mesmo município.
  const controlGuides = financeLedgerProcesses.flatMap((process) =>
    getProcessPaymentGuides(process, tenantSettings).map((guide) => ({
      process,
      guide,
    })),
  );
  const guides = controlGuides.filter(({ guide }) => guide.kind !== "protocolo");
  const issGuides = guides.filter(({ guide }) => guide.kind === "iss_obra");
  const approvalGuides = guides.filter(({ guide }) => guide.kind === "aprovacao_final");
  const settledGuides = guides.filter(({ guide }) => guide.status === "compensada");
  const pendingGuides = guides.filter(({ guide }) => guide.status === "pendente");
  const pendingConstructionGuideProcesses = financeCanIssueConstructionGuide
    ? processes.filter((process) => {
        if (isOccupancyPermitProcessType(process.type)) return false;
        const hasGuide = getProcessPaymentGuides(process, tenantSettings).some(
          (guide) => guide.kind === "iss_obra",
        );
        const hasFinanceRequest = process.dispatches.some(
          (dispatch) =>
            /(issqn|iss|projeto).*guia|guia.*(issqn|iss|projeto)/i.test(dispatch.subject) &&
            ["aguardando", "respondido"].includes(dispatch.status) &&
            /financ/i.test(dispatch.to),
        );
        return hasFinanceRequest && !hasGuide;
      })
    : [];
  const getPendingConstructionGuideRequest = (processId: string) =>
    processes
      .find((process) => process.id === processId)
      ?.dispatches.find(
        (dispatch) =>
          /(issqn|iss|projeto).*guia|guia.*(issqn|iss|projeto)/i.test(dispatch.subject) &&
          ["aguardando", "respondido"].includes(dispatch.status) &&
          /financ/i.test(dispatch.to),
      );
  const pendingHabiteSeGuideProcesses = processes.filter((process) => {
    if (!isOccupancyPermitProcessType(process.type)) return false;
    const hasGuide = getProcessPaymentGuides(process, tenantSettings).some(
      (guide) => guide.kind === "habite_se",
    );
    const hasFinanceRequest = process.dispatches.some(
      (dispatch) =>
        /guia.*habite|habite.*guia/i.test(dispatch.subject) &&
        ["aguardando", "respondido"].includes(dispatch.status) &&
        /financ/i.test(dispatch.to),
    );
    return hasFinanceRequest && !hasGuide;
  });

  const getPendingHabiteSeGuideRequest = (processId: string) =>
    processes
      .find((process) => process.id === processId)
      ?.dispatches.find(
        (dispatch) =>
          /guia.*habite|habite.*guia/i.test(dispatch.subject) &&
          ["aguardando", "respondido"].includes(dispatch.status) &&
          /financ/i.test(dispatch.to),
      );
  const handleManualPaymentConfirmation = async (
    processId: string,
    guideKind: PaymentGuideKind,
  ) => {
    if (!canConfirmManualPayment) {
      setManualPaymentStatus(
        "A confirmação manual de pagamento está disponível somente para o setor Financeiro.",
      );
      return;
    }
    if (guideKind === "protocolo") {
      setManualPaymentStatus(
        "A guia inicial continua sob responsabilidade do Setor de Protocolo.",
      );
      return;
    }

    const busyKey = processId + ":" + guideKind;
    setManualPaymentBusyKey(busyKey);
    setManualPaymentStatus("");

    try {
      await markGuideAsPaid(processId, session.name, guideKind);
      setManualPaymentStatus(
        "Pagamento confirmado manualmente pelo Financeiro. A guia foi marcada como compensada.",
      );
    } catch (error) {
      setManualPaymentStatus(
        error instanceof Error
          ? "Não foi possível confirmar o pagamento: " + error.message
          : "Não foi possível confirmar o pagamento.",
      );
    } finally {
      setManualPaymentBusyKey("");
    }
  };

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
      setWorkflowStatus("Configure e salve a tabela oficial da guia de aprovação/Alvará antes de ativar esta etapa.");
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

  const handleConstructionGuideIssuerMode = async (
    mode: "analise" | "financeiro" | "ambos",
  ) => {
    if (!tenantSettings) {
      setWorkflowStatus("Nenhuma Prefeitura ativa foi localizada para alterar o workflow.");
      return;
    }
    if (!canConfigureWorkflow) {
      setWorkflowStatus("Somente o administrador da Prefeitura pode definir quem emite a Guia de ISSQN / Projeto.");
      return;
    }

    setWorkflowStatus("");
    try {
      await saveInstitutionSettings({
        ...tenantSettings,
        constructionGuideIssuerMode: mode,
      });
      setWorkflowStatus("Workflow financeiro salvo no banco oficial.");
    } catch (error) {
      setWorkflowStatus(
        error instanceof Error
          ? `Não foi possível salvar a responsabilidade de emissão: ${error.message}`
          : "Não foi possível salvar a responsabilidade de emissão no banco oficial.",
      );
    }
  };

  const handleIssueConstructionGuide = async (processId: string) => {
    if (!financeCanIssueConstructionGuide) {
      setConstructionGuideStatus("O administrador da Prefeitura não autorizou a emissão desta guia pelo Financeiro.");
      return;
    }

    setConstructionGuideBusyId(processId);
    setConstructionGuideStatus("");
    try {
      await issuePaymentGuide(processId, session.name, "iss_obra");
      setConstructionGuideStatus("Guia de ISSQN / Projeto emitida pelo Financeiro e vinculada ao processo.");
    } catch (error) {
      setConstructionGuideStatus(
        error instanceof Error
          ? `Não foi possível emitir a guia: ${error.message}`
          : "Não foi possível emitir a guia no banco oficial.",
      );
    } finally {
      setConstructionGuideBusyId("");
    }
  };

  const totalValue = guides.reduce((sum, { guide }) => sum + guide.amount, 0);
  const settledValue = settledGuides.reduce((sum, { guide }) => sum + guide.amount, 0);
  const openProcessCount = processes.filter(
    (process) => !["rascunho", "deferido", "indeferido", "arquivado"].includes(process.status),
  ).length;
  const controlIssuedValue = controlGuides.reduce(
    (sum, { guide }) => sum + guide.amount,
    0,
  );
  const controlPendingValue = controlGuides
    .filter(({ guide }) => guide.status === "pendente")
    .reduce((sum, { guide }) => sum + guide.amount, 0);
  const controlSettledValue = controlGuides
    .filter(({ guide }) => guide.status === "compensada")
    .reduce((sum, { guide }) => sum + guide.amount, 0);

  const inconsistencyCount = guides.filter(({ process, guide }) => {
    if (guide.status !== "pendente") return false;
    return process.status === "deferido" || process.status === "arquivado";
  }).length;

  const unmatchedPayments = pendingGuides.filter(({ process }) => process.status === "deferido");
  const manualConfirmationTasks = pendingGuides.filter(({ process }) => process.status !== "pagamento_pendente");
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

  const issuedGuideRows = useMemo(() => {
    const guideOrder: Record<PaymentGuideKind, number> = {
      protocolo: 0,
      iss_obra: 1,
      habite_se: 2,
      aprovacao_final: 3,
    };

    return [...controlGuides].sort((a, b) => {
      const aSequence = getOfficialProcessSequence(a.process);
      const bSequence = getOfficialProcessSequence(b.process);

      // Processo oficial sempre fica no livro sequencial; pré-protocolo ainda
      // não pago fica separado no fim e nunca ocupa posição da sequência PM.
      if (Boolean(aSequence) !== Boolean(bSequence)) {
        return aSequence ? -1 : 1;
      }

      if (aSequence && bSequence) {
        if (aSequence.year !== bSequence.year) return bSequence.year - aSequence.year;
        if (aSequence.number !== bSequence.number) {
          return bSequence.number - aSequence.number;
        }

        const kindDelta = guideOrder[a.guide.kind] - guideOrder[b.guide.kind];
        if (kindDelta !== 0) return kindDelta;
      }

      const aIssued = a.guide.issuedAt ? new Date(a.guide.issuedAt).getTime() : 0;
      const bIssued = b.guide.issuedAt ? new Date(b.guide.issuedAt).getTime() : 0;
      if (aIssued !== bIssued) return bIssued - aIssued;

      return a.guide.code.localeCompare(b.guide.code, "pt-BR", { numeric: true });
    });
  }, [controlGuides]);

  const feeTable: MunicipalFeeTable = {
    id: `fee-table-${scopeId ?? "platform"}`,
    tenantId: municipalityId ?? effectiveScopeId ?? session.tenantId ?? "platform",
    code: "financeiro-geral",
    label: "Tabela Financeira Municipal",
    description:
      "Consolida protocolo, ISSQN / Projeto, aprovação/Alvará e a Guia própria do Habite-se quando o processo chega ao Financeiro após a vistoria.",
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
      code: `APR_${profile.id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`,
      label: `Aprovação / Alvará • ${profile.label}`,
      kind: "per_square_meter" as const,
      rate: Number(
        (
          profile.rate *
          ((tenantSettings?.approvalAliquotPercent ?? 5) / 100)
        ).toFixed(4),
      ),
      processType: "licenciamento",
      occupancyPermit: false,
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
    bankName:
      [tenantSettings?.bankCode, tenantSettings?.bankName]
        .filter(Boolean)
        .join(" · ") || "Banco arrecadador não configurado",
    settlementMode: collectionModeLabel(tenantSettings?.bankCollectionMode),
    agreementCode:
      tenantSettings?.bankAgreementCode ||
      (tenantSettings?.bankCollectionMode === "manual" ? "Não se aplica" : "Não configurado"),
    beneficiary:
      tenantSettings?.beneficiarioArrecadacao ||
      tenantSettings?.secretariaResponsavel ||
      "Prefeitura contratante",
    account:
      tenantSettings?.bankAgency || tenantSettings?.bankAccount
        ? `Ag. ${tenantSettings?.bankAgency || "—"}${tenantSettings?.bankAgencyDigit ? `-${tenantSettings.bankAgencyDigit}` : ""} · Conta ${tenantSettings?.bankAccount || "—"}${tenantSettings?.bankAccountDigit ? `-${tenantSettings.bankAccountDigit}` : ""}`
        : "Agência e conta não informadas",
  };

  const navItems = [
    { value: "visao-geral", label: "Resumo", helper: "Situação financeira e prioridades" },
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
          description="Organize a arrecadação municipal com visão executiva, protocolos em aberto e contabilidade individual por processo."
          icon={Wallet}
          actions={
            <Button
              asChild
              className="sig-force-dark-action rounded-full bg-[#075985] font-bold !text-white shadow-[0_10px_24px_rgba(7,89,133,0.20)] hover:bg-[#064c70] [&_*]:!text-white"
            >
              <Link to="/prefeitura/financeiro/protocolos">
                Controle por processo
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          }
        />

        <InternalTabs
          items={navItems as unknown as Array<{ value: string; label: string; helper?: string }>}
          value={section}
          onChange={(value) => setSection(value as FinanceSection)}
        />

        {section === "visao-geral" ? (
          <>
            <PageStatsRow>
              <StatCard
                label="Protocolos em aberto"
                value={String(openProcessCount)}
                description="Todos os processos ativos sob controle financeiro"
                icon={FolderOpen}
                tone="blue"
              />
              <StatCard
                label="Total lançado"
                value={formatCurrency(controlIssuedValue)}
                description="Taxa de protocolo, ISSQN, aprovação/Alvará e Habite-se"
                icon={ReceiptText}
                tone="default"
                valueClassName="text-xl md:text-2xl"
              />
              <StatCard
                label="Em aberto"
                value={formatCurrency(controlPendingValue)}
                description="Valores aguardando compensação"
                icon={FileSpreadsheet}
                tone="amber"
                valueClassName="text-xl md:text-2xl"
              />
              <StatCard
                label="Arrecadado"
                value={formatCurrency(controlSettledValue)}
                description="Total já compensado"
                icon={Landmark}
                tone="emerald"
                valueClassName="text-xl md:text-2xl"
              />
            </PageStatsRow>

            <PageMainGrid>
              <PageMainContent>
                <TableCard
                  title="Prioridades financeiras"
                  description="Pendências que exigem atuação. Emissão, baixa e conciliação completas permanecem nas abas operacionais."
                  icon={ReceiptText}
                  actions={
                    <Button type="button" variant="outline" className="rounded-full" onClick={() => setSection("pagamentos")}>
                      Ver pagamentos
                    </Button>
                  }
                >
                  <div className="space-y-3">
                    {criticalPending.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                        Nenhuma guia pendente no momento.
                      </div>
                    ) : (
                      criticalPending.slice(0, 4).map(({ process, guide }) => (
                        <div key={`${process.id}-${guide.kind}`} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="sig-fit-title text-sm font-semibold text-slate-950">{formatOfficialProcessNumber(process.protocol)}</p>
                              <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-700">
                                Pendente
                              </Badge>
                            </div>
                            <p className="mt-1 text-sm text-slate-600">
                              {guide.code} • {guide.label} • {formatCurrency(guide.amount)}
                            </p>
                          </div>
                          <Button asChild variant="outline" className="shrink-0 rounded-full">
                            <Link to={`${buildProcessPath(process, "financeiro")}&guia=${encodeURIComponent(guide.code)}#guia-selecionada`}>Abrir processo</Link>
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </TableCard>
              </PageMainContent>

              <PageSideContent>
                <SectionCard title="Atenção imediata" description="Somente alertas que pedem decisão.">
                  <div className="space-y-3">
                    <AlertCard
                      title="Divergências"
                      description={inconsistencyCount > 0 ? `${inconsistencyCount} ocorrência(s) precisam de conferência.` : "Nenhuma divergência relevante."}
                      tone={inconsistencyCount > 0 ? "danger" : "success"}
                    />
                    <AlertCard
                      title="Baixas pendentes"
                      description={pendingGuides.length > 0 ? `${pendingGuides.length} guia(s) aguardam compensação.` : "Nenhuma baixa pendente."}
                      tone={pendingGuides.length > 0 ? "warning" : "success"}
                    />
                  </div>
                </SectionCard>

                <SectionCard title="Ações rápidas" description="Acesso direto às rotinas financeiras.">
                  <div className="grid gap-2">
                    <Button type="button" className="sig-force-dark-action h-11 justify-start rounded-2xl bg-slate-950 !text-white hover:bg-slate-900" onClick={() => setSection("pagamentos")}>
                      <Banknote className="mr-2 h-4 w-4" />
                      Pagamentos e baixas
                    </Button>
                    <Button type="button" variant="outline" className="h-11 justify-start rounded-2xl" onClick={() => setSection("guias")}>
                      <ReceiptText className="mr-2 h-4 w-4" />
                      Guias emitidas
                    </Button>
                    <Button type="button" variant="outline" className="h-11 justify-start rounded-2xl" onClick={() => setSection("conciliacao")}>
                      <Scale className="mr-2 h-4 w-4" />
                      Conciliação
                    </Button>
                  </div>
                </SectionCard>
              </PageSideContent>
            </PageMainGrid>
          </>
        ) : null}

        {section === "guias" ? (
          <TableCard title="Guias emitidas" description="Todas as guias vinculadas aos processos municipais, organizadas da emissão mais recente para a mais antiga. A responsabilidade de baixa continua respeitando o setor de origem." icon={ReceiptText}>
            <div className="space-y-3">
              {tenantSettings?.finalApprovalFeeEnabled !== false && !finalFeeConfigured ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  A guia da obra depende da tabela municipal do workflow financeiro. Configure as regras oficiais para que a Análise Urbanística consiga gerar a cobrança automaticamente.
                </div>
              ) : null}

              {constructionGuideStatus ? (
                <div className={`rounded-2xl border px-4 py-3 text-sm ${
                  constructionGuideStatus.startsWith("Guia de ISSQN")
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:text-emerald-300"
                    : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-950/30 dark:text-rose-300"
                }`}>
                  {constructionGuideStatus}
                </div>
              ) : null}

              {pendingHabiteSeGuideProcesses.length > 0 ? (
                <div
                  data-finance-habite-se-pending-queue="true"
                  className="rounded-2xl border border-cyan-200 bg-cyan-50/70 p-4 dark:border-cyan-500/30 dark:bg-cyan-950/20"
                >
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">
                      Habite-se aguardando emissão pelo Financeiro
                    </p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      Vistorias concluídas e encaminhadas formalmente para geração da Guia de Habite-se antes da decisão / emissão.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {pendingHabiteSeGuideProcesses.map((process) => {
                      const request = getPendingHabiteSeGuideRequest(process.id);
                      return (
                        <div
                          key={`${process.id}:habite-se-guide-request`}
                          data-process-premium-card="true"
                          data-surface="adaptive-card"
                          className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/40"
                        >
                          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">
                                  {formatOfficialProcessNumber(process.protocol)}
                                </p>
                                <Badge variant="outline" className="rounded-full border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-500/40 dark:bg-cyan-950/40 dark:text-cyan-300">
                                  Habite-se
                                </Badge>
                              </div>
                              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                                {process.ownerName} • {process.technicalLead}
                              </p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                Vistoria concluída • área declarada {Number(process.property.area || 0).toFixed(2)} m²
                              </p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                Encaminhado por {request?.requestedBy || request?.assignedTo || "servidor responsável"}
                                {request?.createdAt ? ` • ${request.createdAt}` : ""}
                              </p>
                            </div>

                            <Button
                              asChild
                              data-finance-habite-se-action="true"
                              className="sig-force-dark-action shrink-0 rounded-full border border-cyan-600 bg-cyan-800 px-5 font-bold !text-white shadow-[0_8px_20px_rgba(8,145,178,0.18)] hover:bg-cyan-700 [&_*]:!text-white"
                            >
                              <Link
                                to={buildProcessPath(process, "financeiro")}
                                className="!text-white"
                              >
                                Abrir e emitir Guia de Habite-se
                              </Link>
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {financeCanIssueConstructionGuide && pendingConstructionGuideProcesses.length > 0 ? (
                <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-500/30 dark:bg-sky-950/20">
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">
                      ISSQN / Projeto aguardando emissão pelo Financeiro
                    </p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                      Processos com análise técnica concluída e dados do ISSQN / Projeto encaminhados formalmente ao Financeiro.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {pendingConstructionGuideProcesses.map((process) => {
                      const request = getPendingConstructionGuideRequest(process.id);
                      return (
                        <div
                          key={`${process.id}:construction-guide-request`}
                          data-process-premium-card="true"
                          data-surface="adaptive-card"
                          className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/40"
                        >
                          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">
                                  {formatOfficialProcessNumber(process.protocol)}
                                </p>
                                <Badge variant="outline" className="rounded-full border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-950/40 dark:text-sky-300">
                                  ISSQN / Projeto
                                </Badge>
                              </div>
                              <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">
                                {process.ownerName} • {process.technicalLead}
                              </p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {process.property.area.toFixed(2)} m² • {process.property.usage || "Uso não informado"} • {process.property.workType || "Natureza da obra não informada"}
                              </p>
                              <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                                Responsável pela análise: {process.analysis?.assignedTo || request?.requestedBy || "Não atribuído"}
                              </p>
                              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                Encaminhado por {request?.requestedBy || process.analysis?.assignedTo || "Analista responsável"}
                                {request?.createdAt ? ` • ${request.createdAt}` : ""}
                              </p>
                            </div>

                            <div className="flex shrink-0 flex-wrap gap-2">
                              <Button asChild variant="outline" className="rounded-full">
                                <Link to={buildProcessPath(process)}>Conferir processo</Link>
                              </Button>
                              <Button
                                type="button"
                                className="rounded-full bg-sky-700 px-5 text-white hover:bg-sky-800"
                                disabled={constructionGuideBusyId === process.id}
                                onClick={() => void handleIssueConstructionGuide(process.id)}
                              >
                                {constructionGuideBusyId === process.id ? "Emitindo..." : "Emitir ISSQN / Projeto"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {issuedGuideRows.length === 0 ? (
                <div className="sig-dark-panel rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-950/35 dark:text-slate-300">
                  Nenhuma guia emitida encontrada.
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-950/45">
                  <div className="border-b border-sky-100 bg-sky-50/70 px-4 py-3 dark:border-sky-500/20 dark:bg-sky-950/20">
                    <p className="text-xs font-bold text-sky-900 dark:text-sky-100">
                      Ordem oficial dos processos
                    </p>
                    <p className="mt-1 text-[11px] leading-5 text-sky-700 dark:text-sky-300">
                      A sequência municipal nasce somente após a compensação da guia inicial. Pré-protocolos ainda não pagos aparecem como PRE e não consomem número de processo.
                    </p>
                  </div>
                  <div className="hidden min-h-9 grid-cols-[54px_minmax(220px,1.2fr)_minmax(170px,1fr)_110px_110px_minmax(170px,1fr)_100px_34px] items-center gap-3 border-b border-slate-200 bg-slate-50/90 px-3 text-[9px] font-black uppercase tracking-[0.1em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400 lg:grid">
                    <span>Seq.</span>
                    <span>Guia</span>
                    <span>Processo</span>
                    <span>Emissão</span>
                    <span>Vencimento</span>
                    <span>Responsabilidade</span>
                    <span className="text-right">Valor</span>
                    <span aria-hidden="true" />
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {issuedGuideRows.map(({ process, guide }) => {
                      const isProtocolGuide = guide.kind === "protocolo";
                      const issuedLabel = guide.issuedAt
                        ? new Date(guide.issuedAt).toLocaleDateString("pt-BR")
                        : "Não informada";
                      const sequence = getOfficialProcessSequence(process);
                      const sequenceLabel = sequence
                        ? String(sequence.number).padStart(2, "0")
                        : "PRE";
                      const displayGuideCode = getPaymentGuideDisplayReference(
                        process,
                        guide,
                      );
                      const keepsOriginalPreprotocolCode =
                        isProtocolGuide &&
                        Boolean(guide.officialProcessReference) &&
                        guide.officialProcessReference !== guide.code;
                      const processDisplayLabel = sequence
                        ? formatOfficialProcessNumber(process.protocol)
                        : `Pré-protocolo ${process.preProtocol || process.protocol}`;

                      return (
                        <Link
                          key={`${process.id}-${guide.kind}-${guide.code}`}
                          to={`${buildProcessPath(process, "financeiro")}&guia=${encodeURIComponent(guide.code)}#guia-selecionada`}
                          className="group grid min-h-[62px] grid-cols-[42px_minmax(0,1fr)_30px] items-center gap-2 px-3 py-2.5 transition hover:bg-sky-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 dark:hover:bg-sky-950/20 lg:grid-cols-[54px_minmax(220px,1.2fr)_minmax(170px,1fr)_110px_110px_minmax(170px,1fr)_100px_34px] lg:gap-3"
                        >
                          <span
                            className={
                              sequence
                                ? "inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-slate-950 px-1 text-[9px] font-black tracking-[0.04em] text-white dark:bg-white dark:text-slate-950"
                                : "inline-flex h-7 min-w-9 items-center justify-center rounded-lg border border-amber-300 bg-amber-50 px-1.5 text-[8px] font-black tracking-[0.04em] text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200"
                            }
                            title={
                              sequence
                                ? `Sequência oficial do processo: ${formatOfficialProcessNumber(process.protocol)}`
                                : "Pré-protocolo: ainda não possui sequência oficial"
                            }
                          >
                            {sequenceLabel}
                          </span>

                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                className="truncate text-xs font-black text-slate-950 group-hover:text-sky-800 dark:text-white dark:group-hover:text-sky-300"
                                title={displayGuideCode}
                              >
                                {displayGuideCode}
                              </span>
                              <Badge
                                variant="outline"
                                className={
                                  guide.status === "compensada"
                                    ? "h-5 shrink-0 rounded-full border-emerald-200 bg-emerald-50 px-2 text-[9px] font-bold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-300"
                                    : "h-5 shrink-0 rounded-full border-amber-200 bg-amber-50 px-2 text-[9px] font-bold text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-300"
                                }
                              >
                                {guide.status === "compensada" ? "Compensada" : "Pendente"}
                              </Badge>
                            </div>
                            <p className="mt-0.5 truncate text-[10px] font-medium text-slate-500 dark:text-slate-400" title={guide.label}>
                              {guide.label}
                            </p>
                            {keepsOriginalPreprotocolCode ? (
                              <p
                                className="mt-0.5 truncate text-[9px] font-semibold text-slate-400 dark:text-slate-500"
                                title={guide.code}
                              >
                                Guia paga no pré-protocolo: {guide.code}
                              </p>
                            ) : null}

                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-slate-500 dark:text-slate-400 lg:hidden">
                              <span>{processDisplayLabel}</span>
                              <span>Emissão: {issuedLabel}</span>
                              <span>Venc.: {guide.dueDate || "Não informado"}</span>
                              <span>{formatCurrency(guide.amount)}</span>
                            </div>
                          </div>

                          <div className="hidden min-w-0 lg:block">
                            <p className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">
                              {processDisplayLabel}
                            </p>
                            <p className="mt-0.5 truncate text-[10px] text-slate-500 dark:text-slate-400" title={process.ownerName}>
                              {process.ownerName}
                            </p>
                          </div>

                          <span className="hidden text-[11px] font-semibold text-slate-600 dark:text-slate-300 lg:block">
                            {issuedLabel}
                          </span>

                          <span className="hidden text-[11px] font-semibold text-slate-600 dark:text-slate-300 lg:block">
                            {guide.dueDate || "Não informado"}
                          </span>

                          <span className="hidden truncate text-[10px] font-semibold text-slate-600 dark:text-slate-300 lg:block">
                            {isProtocolGuide ? "Baixa operacional: Protocolo" : "Controle: Financeiro"}
                          </span>

                          <span className="hidden text-right text-xs font-black text-slate-950 dark:text-white lg:block">
                            {formatCurrency(guide.amount)}
                          </span>

                          <ArrowRight className="h-4 w-4 justify-self-end text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-sky-700 dark:group-hover:text-sky-300" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </TableCard>
        ) : null}

        {section === "pagamentos" ? (
          <PageMainGrid>
            <PageMainContent>
              <TableCard
                title="Pagamentos"
                description="Situação de baixa, confirmação e acompanhamento das guias emitidas."
                icon={Banknote}
              >
                {manualPaymentStatus ? (
                  <div
                    className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-medium ${
                      manualPaymentStatus.startsWith("Pagamento confirmado")
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/35 dark:text-emerald-200"
                        : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/40 dark:bg-rose-950/35 dark:text-rose-200"
                    }`}
                  >
                    {manualPaymentStatus}
                  </div>
                ) : null}

                <div className="space-y-3">
                  {pendingGuides.length === 0 ? (
                    <div className="sig-dark-panel rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
                      Nenhuma guia pendente de pagamento no momento.
                    </div>
                  ) : (
                    pendingGuides.map(({ process, guide }) => (
                      <div key={`${process.id}-${guide.kind}`} className="sig-dark-panel rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="sig-fit-title text-sm font-semibold leading-6 text-slate-950" title={process.protocol}>{formatOfficialProcessNumber(process.protocol)}</p>
                              <Badge variant="outline" className="rounded-full border-amber-200 bg-amber-50 text-amber-600 dark:text-amber-400">
                                {guide.label}
                              </Badge>
                              <MarkerSelector
                                processId={process.id}
                                tags={process.tags}
                                actor={session.name}
                                subjectLabel="processo"
                                triggerClassName="h-8"
                              />
                            </div>
                            <p className="sig-fit-copy mt-1 text-sm leading-6 text-slate-800" title={process.ownerName}>{process.ownerName}</p>
                            <p className="sig-fit-copy mt-1 text-sm leading-6 text-slate-500" title={guide.code}>{guide.code}</p>
                          </div>
                          <div className="w-full 2xl:w-auto 2xl:min-w-[620px]">
                            <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2 2xl:grid-cols-4">
                              <div className="sig-dark-panel rounded-xl bg-slate-50 px-3 py-2">Valor: {formatCurrency(guide.amount)}</div>
                              <div className="sig-dark-panel rounded-xl bg-slate-50 px-3 py-2">Vencimento: {guide.dueDate}</div>
                              <div className="sig-dark-panel rounded-xl bg-slate-50 px-3 py-2">Status: Pendente</div>
                              <div className="sig-dark-panel rounded-xl bg-slate-50 px-3 py-2">
                                <Link to={buildProcessPath(process)} className="font-medium text-slate-700">
                                  Conferir
                                </Link>
                              </div>
                            </div>

                            {canConfirmManualPayment ? (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    type="button"
                                    className="mt-3 h-11 w-full rounded-xl bg-emerald-600 font-bold text-white shadow-[0_8px_20px_rgba(5,150,105,0.22)] hover:bg-emerald-700"
                                    disabled={manualPaymentBusyKey === process.id + ":" + guide.kind}
                                  >
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    {manualPaymentBusyKey === process.id + ":" + guide.kind
                                      ? "Confirmando pagamento..."
                                      : "Confirmar pagamento manualmente"}
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="rounded-[24px] border-slate-200">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Confirmar pagamento?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Esta ação marcará a guia {guide.code} como compensada no processo{" "}
                                      {formatOfficialProcessNumber(process.protocol)}. Use somente para teste
                                      ou quando o Financeiro tiver conferido o recolhimento.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel className="rounded-full">
                                      Cancelar
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      className="rounded-full bg-emerald-600 px-5 text-white hover:bg-emerald-700"
                                      onClick={() =>
                                        void handleManualPaymentConfirmation(process.id, guide.kind)
                                      }
                                    >
                                      Confirmar pagamento
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            ) : null}
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
                      <p>Convênio: {bankProfile.agreementCode}</p>
                      <p>Beneficiário: {bankProfile.beneficiary}</p>
                      <p>{bankProfile.account}</p>
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
            subtitle="Taxas de protocolo, ISSQN e aprovação/Alvará; a Guia de Habite-se entra no Financeiro pelo workflow próprio após a vistoria."
            values={{
              taxaProtocolo: tenantSettings?.taxaProtocolo ?? 35.24,
              taxaIssPorMetroQuadrado: tenantSettings?.taxaIssPorMetroQuadrado ?? 0,
              issRateProfiles: tenantSettings?.issRateProfiles ?? defaultIssRateProfiles,
              taxaAprovacaoFinal: tenantSettings?.taxaAprovacaoFinal ?? 0,
              approvalAliquotPercent: tenantSettings?.approvalAliquotPercent ?? 5,
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
                  approvalAliquotPercent: Number(values.approvalAliquotPercent ?? 5),
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
                    <p className="text-sm font-semibold text-slate-950">2. ISSQN / Projeto</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Após a aprovação técnica, a guia é calculada pela metragem e pelo uso da edificação. A emissão pode ficar com a Análise Urbanística, com o Financeiro ou com ambos, conforme decisão da Prefeitura.
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
                    <p className="text-sm font-semibold text-slate-950">3. Guia de aprovação / Alvará</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      Quando ativa, a aprovação técnica gera a guia do Alvará e o processo passa pelo Financeiro antes da emissão do documento. Habite-se não participa deste fluxo.
                    </p>
                  </div>
                </label>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-950/35">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
                  <div>
                    <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">
                      Quem pode emitir a Guia de ISSQN / Projeto
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
                      Cada Prefeitura pode definir sua própria responsabilidade operacional sem alterar a tabela de valores nem a rastreabilidade do processo.
                    </p>
                    <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {constructionGuideIssuerMode === "financeiro"
                        ? "A Análise Urbanística confere metragem, uso e natureza da obra; depois encaminha ao Financeiro, que emite a Guia de ISSQN / Projeto."
                        : constructionGuideIssuerMode === "ambos"
                          ? "A Análise Urbanística pode emitir a Guia de ISSQN / Projeto diretamente ou encaminhar ao Financeiro. A primeira emissão registrada impede duplicidade."
                          : "A Análise Urbanística emite a Guia de ISSQN / Projeto após concluir a análise. O Financeiro recebe automaticamente para controle, pagamento e baixa."}
                    </p>
                  </div>

                  {canConfigureWorkflow ? (
                    <Select
                      value={constructionGuideIssuerMode}
                      onValueChange={(value) =>
                        void handleConstructionGuideIssuerMode(
                          value as "analise" | "financeiro" | "ambos",
                        )
                      }
                    >
                      <SelectTrigger className="h-11 bg-white dark:bg-slate-950">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="analise">Análise Urbanística</SelectItem>
                        <SelectItem value="financeiro">Setor Financeiro</SelectItem>
                        <SelectItem value="ambos">Análise ou Financeiro</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                      {constructionGuideIssuerMode === "financeiro"
                        ? "Setor Financeiro"
                        : constructionGuideIssuerMode === "ambos"
                          ? "Análise ou Financeiro"
                          : "Análise Urbanística"}
                      <p className="mt-1 text-xs font-normal text-slate-500">
                        Definido pelo administrador da Prefeitura.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-sm text-sky-900">
                O fluxo operacional usa estas configurações como regra. Desativar uma etapa ou alterar o responsável pela emissão não modifica guias históricas já geradas.
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
