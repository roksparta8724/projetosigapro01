import {
  Building2,
  CalendarClock,
  CircleDollarSign,
  ChevronDown,
  Copy,
  Eye,
  FileText,
  FolderOpen,
  Landmark,
  Printer,
  Receipt,
  ReceiptText,
  Search,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  openGuiaRecolhimentoOficialWindow,
  reserveGuiaRecolhimentoWindow,
  showGuiaRecolhimentoError,
} from "@/components/GuiaRecolhimentoOficial";
import { PageHero } from "@/components/platform/PageHero";
import { MarkerSelector } from "@/components/platform/MarkerSelector";
import {
  PageMainContent,
  PageMainGrid,
  PageShell,
  PageStatsRow,
} from "@/components/platform/PageShell";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { SectionCard } from "@/components/platform/SectionCard";
import { StatCard } from "@/components/platform/StatCard";
import {
  formatCurrency,
  formatOfficialProcessNumber,
  formatOfficialProcessTitle,
  getGuideObservation,
  getGuideReference,
  getProcessPaymentGuides,
  matchesOperationalScope,
  statusLabel,
  statusTone,
  type PaymentGuideEntry,
  type PaymentGuideKind,
  type ProcessRecord,
} from "@/lib/platform";
import { prepareGuideInstitutionalLogo } from "@/lib/guideAssets";
import { ensureMercadoPagoGuideCharge } from "@/lib/mercadoPagoGuide";
import { resolveGuideBankingData } from "@/lib/paymentCollection";
import { useMunicipality } from "@/hooks/useMunicipality";
import { useInstitutionBranding } from "@/hooks/useInstitutionBranding";
import { getMunicipalityLogoOpenUrl } from "@/integrations/r2/client";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";

type FinanceView = "abertos" | "todos";

type ProcessLedger = {
  process: ProcessRecord;
  guides: PaymentGuideEntry[];
  totalIssued: number;
  totalPaid: number;
  totalPending: number;
  paidCount: number;
  pendingCount: number;
  isOpen: boolean;
};

const CLOSED_PROCESS_STATUSES = new Set([
  "rascunho",
  "deferido",
  "indeferido",
  "arquivado",
]);

function isOpenMunicipalProcess(process: ProcessRecord) {
  return !CLOSED_PROCESS_STATUSES.has(process.status);
}

function formatDate(value?: string) {
  if (!value) return "Não informado";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("pt-BR");
}

function guideResponsibility(kind: PaymentGuideKind) {
  if (kind === "protocolo") return "Baixa operacional: Protocolo";
  if (kind === "iss_obra") return "Controle e baixa: Financeiro";
  return "Controle e baixa: Financeiro";
}

function guideKindLabel(kind: PaymentGuideKind) {
  if (kind === "protocolo") return "Taxa de protocolo";
  if (kind === "iss_obra") return "ISSQN / Projeto";
  return "Aprovação / Alvará";
}

export function FinanceProtocolsPage() {
  const { session } = usePlatformSession();
  const [searchParams] = useSearchParams();
  const {
    municipality,
    branding: municipalityBranding,
    scopeId,
    institutionSettingsCompat,
    name: municipalityName,
  } = useMunicipality();
  const { processes: allProcesses, markGuideAsPaid, getInstitutionSettings } =
    usePlatformData();

  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const tenantSettings =
    institutionSettingsCompat ?? getInstitutionSettings(effectiveScopeId);
  const { headerBranding: guideHeaderBranding } = useInstitutionBranding(effectiveScopeId);
  const stableGuideLogoUrl = getMunicipalityLogoOpenUrl(
    municipalityBranding?.headerLogoObjectKey ||
      municipalityBranding?.logoObjectKey ||
      "",
  );
  const guideLogoUrl =
    stableGuideLogoUrl ||
    guideHeaderBranding.logoUrl ||
    ("fallbackLogoUrl" in guideHeaderBranding ? guideHeaderBranding.fallbackLogoUrl : "") ||
    tenantSettings?.logoUrl ||
    tenantSettings?.brasaoUrl ||
    "";

  // O Financeiro enxerga todos os protocolos ativos do município.
  // A responsabilidade operacional de cada guia continua respeitada:
  // a taxa inicial pertence ao Protocolo; ISSQN e aprovação/Alvará pertencem ao Financeiro.
  const scopedProcesses = useMemo(
    () =>
      allProcesses.filter((process) =>
        matchesOperationalScope(effectiveScopeId, process),
      ),
    [allProcesses, effectiveScopeId],
  );

  const ledgers = useMemo<ProcessLedger[]>(
    () =>
      scopedProcesses
        .map((process) => {
          const guides = getProcessPaymentGuides(process, tenantSettings);
          const totalIssued = guides.reduce((sum, guide) => sum + guide.amount, 0);
          const paidGuides = guides.filter((guide) => guide.status === "compensada");
          const pendingGuides = guides.filter((guide) => guide.status === "pendente");

          return {
            process,
            guides,
            totalIssued,
            totalPaid: paidGuides.reduce((sum, guide) => sum + guide.amount, 0),
            totalPending: pendingGuides.reduce((sum, guide) => sum + guide.amount, 0),
            paidCount: paidGuides.length,
            pendingCount: pendingGuides.length,
            isOpen: isOpenMunicipalProcess(process),
          };
        })
        .sort((a, b) => {
          if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
          if (a.totalPending !== b.totalPending) return b.totalPending - a.totalPending;
          return a.process.protocol.localeCompare(b.process.protocol, "pt-BR");
        }),
    [scopedProcesses, tenantSettings],
  );

  const allGuideEntries = useMemo(
    () =>
      ledgers.flatMap((ledger) =>
        ledger.guides.map((guide) => ({
          process: ledger.process,
          guide,
        })),
      ),
    [ledgers],
  );

  const returnedProcessLabel = searchParams.get("processo") || "";
  const returnedToAnalysis = searchParams.get("retorno") === "analise";
  const [copiedPayload, setCopiedPayload] = useState("");
  const [financialStatus, setFinancialStatus] = useState(
    returnedToAnalysis
      ? `Pagamento confirmado. ${returnedProcessLabel || "O processo"} retornou automaticamente à Análise Urbanística e permanece no controle financeiro.`
      : "",
  );
  const [financialBusyKey, setFinancialBusyKey] = useState("");
  const [guideBillingBusyKey, setGuideBillingBusyKey] = useState("");
  const [view, setView] = useState<FinanceView>("abertos");
  const [search, setSearch] = useState("");
  const [expandedProcessId, setExpandedProcessId] = useState<string | null>(null);

  const openLedgers = ledgers.filter((ledger) => ledger.isOpen);
  const totalIssued = ledgers.reduce((sum, ledger) => sum + ledger.totalIssued, 0);
  const totalPending = ledgers.reduce((sum, ledger) => sum + ledger.totalPending, 0);
  const totalPaid = ledgers.reduce((sum, ledger) => sum + ledger.totalPaid, 0);

  const visibleLedgers = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");

    return ledgers.filter((ledger) => {
      if (view === "abertos" && !ledger.isOpen) return false;
      if (!normalizedSearch) return true;

      const process = ledger.process;
      return [
        process.protocol,
        formatOfficialProcessNumber(process.protocol),
        process.title,
        process.ownerName,
        process.technicalLead,
        process.address,
        process.property.registration,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase("pt-BR").includes(normalizedSearch),
        );
    });
  }, [ledgers, search, view]);

  const copyPixPayload = async (payload: string) => {
    try {
      await navigator.clipboard.writeText(payload);
      setCopiedPayload(payload);
    } catch {
      setCopiedPayload("");
    }
  };

  const handleConfirmPayment = async (
    processId: string,
    guideKind: PaymentGuideKind,
  ) => {
    if (guideKind === "protocolo") {
      setFinancialStatus(
        "A taxa inicial permanece sob responsabilidade operacional do Setor de Protocolo. O Financeiro mantém a visualização para controle e conciliação.",
      );
      return;
    }

    const busyKey = `${processId}:${guideKind}`;
    setFinancialBusyKey(busyKey);
    setFinancialStatus("");

    try {
      await markGuideAsPaid(processId, session.name, guideKind);
      setFinancialStatus(
        guideKind === "iss_obra"
          ? "Pagamento confirmado. O processo retornou automaticamente à Análise Urbanística e permanece no livro financeiro."
          : "Pagamento confirmado no banco oficial com sucesso.",
      );
    } catch (error) {
      setFinancialStatus(
        error instanceof Error
          ? `Não foi possível confirmar o pagamento: ${error.message}`
          : "Não foi possível confirmar o pagamento no banco oficial.",
      );
    } finally {
      setFinancialBusyKey("");
    }
  };

  const openGuide = async (
    processId: string,
    guideKind: PaymentGuideKind,
    autoPrint = true,
  ) => {
    const match = allGuideEntries.find(
      ({ process, guide }) =>
        process.id === processId && guide.kind === guideKind,
    );
    if (!match) return;

    const guideWindow = reserveGuiaRecolhimentoWindow(`Guia ${match.guide.code}`);
    if (!guideWindow) {
      setFinancialStatus("O navegador bloqueou a nova aba da guia. Permita pop-ups para o localhost e tente novamente.");
      return;
    }

    const banking = resolveGuideBankingData({
      settings: tenantSettings,
      guide: match.guide,
      municipalityName,
      municipalityCity: tenantSettings?.pixMerchantCity,
    });

    const billingKey = `${processId}:${guideKind}:mercadopago`;
    let providerCharge: Awaited<ReturnType<typeof ensureMercadoPagoGuideCharge>> | null = null;

    if (
      match.guide.status !== "compensada" &&
      (!banking.barcode || !banking.digitableLine)
    ) {
      setGuideBillingBusyKey(billingKey);
      setFinancialStatus("Gerando cobrança Mercado Pago para esta guia...");
      try {
        providerCharge = await ensureMercadoPagoGuideCharge({
          guideCode: match.guide.code,
          amount: match.guide.amount,
          dueDate: match.guide.dueDate,
          description: `${guideKindLabel(match.guide.kind)} · ${match.process.protocol}`,
        });
        setFinancialStatus(
          "Cobrança Mercado Pago vinculada à própria guia do SIGAPRO. Linha digitável e código de barras foram incorporados à DAM.",
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? `Não foi possível obter a cobrança Mercado Pago desta guia: ${error.message}`
            : "Não foi possível obter a cobrança Mercado Pago desta guia.";
        setFinancialStatus(message);
        showGuiaRecolhimentoError(guideWindow, message);
        return;
      } finally {
        setGuideBillingBusyKey("");
      }
    }

    const digitableLine =
      providerCharge?.digitableLine || banking.digitableLine;
    const barcode =
      providerCharge?.barcodeContent || banking.barcode;
    if (
      match.guide.status !== "compensada" &&
      (!barcode || !digitableLine)
    ) {
      const message =
        "A cobrança bancária não retornou linha digitável e código de barras completos. A DAM foi bloqueada para não emitir uma guia inválida.";
      setFinancialStatus(message);
      showGuiaRecolhimentoError(guideWindow, message);
      return;
    }

    const providerInstitution = providerCharge?.financialInstitution?.trim() || "";
    const providerName =
      providerInstitution && providerInstitution.toLowerCase() !== "boleto"
        ? providerInstitution
        : banking.bankName || "Mercado Pago";
    const embeddedGuideLogoUrl = await prepareGuideInstitutionalLogo(
      stableGuideLogoUrl,
      guideLogoUrl,
      tenantSettings?.logoUrl,
      tenantSettings?.brasaoUrl,
    );

    openGuiaRecolhimentoOficialWindow(
      {
        prefeitura: {
          nome:
            municipalityName ||
            tenantSettings?.beneficiarioArrecadacao ||
            "Prefeitura Municipal",
          secretaria:
            tenantSettings?.secretariaResponsavel || "Secretaria responsável",
          endereco: tenantSettings?.endereco || "Endereço não configurado",
          cidade: "",
          uf: "",
          telefone: tenantSettings?.telefone || "",
          logoUrl: embeddedGuideLogoUrl,
          cadastroTitulo: "Cadastro Eventual",
        },
        contribuinte: {
          nome: match.process.ownerName,
          cpfCnpj: match.process.ownerDocument,
          endereco: match.process.address,
          numeroCadastro:
            match.process.property.registration || match.process.protocol,
        },
        guia: {
          numeroGuia: match.guide.code,
          exercicio: new Date(
            match.guide.issuedAt || Date.now(),
          )
            .getFullYear()
            .toString(),
          dataDocumento: match.guide.issuedAt || new Date().toISOString(),
          vencimento: match.guide.dueDate,
          funcionarioResponsavel: session.name,
          referencia: getGuideReference(match.guide.kind),
          observacao: getGuideObservation(match.guide.kind),
          valorDocumento: match.guide.amount,
          descontos: 0,
          outrosAcrescimos: 0,
          valorCobrado: match.guide.amount,
          linhaDigitavel: digitableLine,
          codigoBarras: barcode,
          qrCodePixUrl: "",
          pixPayload: banking.pixPayload,
          bankName: providerName,
          bankAgreement: banking.bankAgreement,
          bankInstructions: banking.bankInstructions,
          bankReference: providerCharge?.orderId || match?.guide?.bankReference,
          bankPaymentId: providerCharge?.paymentId,
          autenticacaoMecanica: "",
        },
        itens: [
          {
            ano: new Date(
              match.guide.issuedAt || Date.now(),
            )
              .getFullYear()
              .toString(),
            divida: match.guide.label,
            tabela: tenantSettings?.guiaPrefixo || "DAM",
            sb: "",
            pc: "",
            principal: match.guide.amount,
            multa: 0,
            juros: 0,
            correcao: 0,
            total: match.guide.amount,
          },
        ],
      },
      {
        title: `Guia ${match.guide.code}`,
        autoPrint,
      },
      guideWindow,
    );
  };

  return (
    <PortalFrame
      eyebrow="FINANCEIRO MUNICIPAL"
      title="Controle financeiro por processo"
    >
      <PageShell>
        <PageHero
          eyebrow="Livro financeiro municipal"
          title="Protocolos, lançamentos e conciliação por processo"
          description="O Financeiro mantém todos os protocolos ativos no radar e acompanha a contabilidade individual de cada processo. A taxa inicial continua sob responsabilidade do Protocolo, mas permanece visível para controle financeiro."
          icon={Landmark}
          actions={
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/prefeitura/financeiro">Voltar ao Financeiro</Link>
            </Button>
          }
        />

        {financialStatus ? (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm font-medium shadow-sm ${
              financialStatus.startsWith("Pagamento confirmado")
                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/25 dark:text-emerald-200"
                : "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-950/25 dark:text-sky-200"
            }`}
          >
            {financialStatus}
          </div>
        ) : null}

        <PageStatsRow className="xl:grid-cols-4 xl:gap-5 [&>*]:min-w-0">
          <StatCard
            label="Protocolos em aberto"
            value={String(openLedgers.length)}
            description="Todos os processos ativos no radar financeiro"
            icon={FolderOpen}
            tone="blue"
          />
          <StatCard
            label="Total lançado"
            value={formatCurrency(totalIssued)}
            description="Soma das guias emitidas em todos os processos"
            icon={ReceiptText}
            tone="default"
            valueClassName="text-xl md:text-2xl"
          />
          <StatCard
            label="Em aberto"
            value={formatCurrency(totalPending)}
            description="Saldo aguardando compensação"
            icon={WalletCards}
            tone="amber"
            valueClassName="text-xl md:text-2xl"
          />
          <StatCard
            label="Arrecadado"
            value={formatCurrency(totalPaid)}
            description="Valores já compensados"
            icon={Landmark}
            tone="emerald"
            valueClassName="text-xl md:text-2xl"
          />
        </PageStatsRow>

        <PageMainGrid className="grid-cols-1 xl:grid-cols-1">
          <PageMainContent>
            <SectionCard
              title="Controle financeiro por protocolo"
              description="Cada processo possui sua própria conta: valores lançados, pagos, pendentes e guias vinculadas. Protocolos ativos aparecem mesmo antes de existir uma cobrança financeira."
            >
              <div className="mb-5 rounded-[22px] border border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_100%)] p-4 shadow-sm dark:border-slate-700 dark:bg-none dark:bg-slate-950/45">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Pesquisar protocolo, proprietário, responsável técnico ou imóvel"
                      className="h-11 rounded-xl border-slate-200 bg-white pl-10 text-slate-950 shadow-none placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={view === "abertos" ? "default" : "outline"}
                      className={
                        view === "abertos"
                          ? "rounded-full bg-[#075985] !text-white hover:bg-[#064c70] hover:!text-white [&_*]:!text-white [&_svg]:!text-white"
                          : "rounded-full"
                      }
                      onClick={() => setView("abertos")}
                    >
                      <FolderOpen className="mr-2 h-4 w-4" />
                      Em aberto ({openLedgers.length})
                    </Button>
                    <Button
                      type="button"
                      variant={view === "todos" ? "default" : "outline"}
                      className={
                        view === "todos"
                          ? "rounded-full bg-[#075985] !text-white hover:bg-[#064c70] hover:!text-white [&_*]:!text-white [&_svg]:!text-white"
                          : "rounded-full"
                      }
                      onClick={() => setView("todos")}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Todos ({ledgers.length})
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                {visibleLedgers.length === 0 ? (
                  <div className="rounded-[22px] border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-950/40">
                    <FolderOpen className="mx-auto h-8 w-8 text-slate-400" />
                    <p className="mt-3 text-sm font-bold text-slate-900 dark:text-white">
                      Nenhum protocolo encontrado
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Ajuste a pesquisa ou altere o filtro para visualizar o histórico.
                    </p>
                  </div>
                ) : (
                  visibleLedgers.map((ledger) => {
                    const { process, guides } = ledger;
                    const currentFolder =
                      process.processControl?.currentFolder ||
                      process.sla.currentStage ||
                      "Fluxo municipal";
                    const isExpanded = expandedProcessId === process.id;

                    return (
                      <article
                        key={process.id}
                        data-process-premium-card="true"
                        data-finance-process-ledger="true"
                        data-expanded={isExpanded ? "true" : "false"}
                        className={`overflow-hidden rounded-[24px] border bg-white transition-[border-color,box-shadow] duration-200 dark:bg-slate-950 ${
                          isExpanded
                            ? "border-sky-300 shadow-[0_16px_42px_rgba(7,89,133,0.10)] dark:border-sky-500/45"
                            : "border-slate-200 shadow-[0_10px_30px_rgba(15,23,42,0.055)] hover:border-sky-200 hover:shadow-[0_13px_34px_rgba(15,23,42,0.075)] dark:border-slate-700 dark:hover:border-sky-700"
                        }`}
                        onClick={(event) => {
                          const target = event.target as HTMLElement;
                          if (target.closest("a,button,input,select,textarea,[role='button']")) return;
                          setExpandedProcessId((current) =>
                            current === process.id ? null : process.id,
                          );
                        }}
                      >
                        <div className="border-b border-slate-200 bg-[linear-gradient(135deg,#ffffff_0%,#f7fbff_100%)] px-5 py-5 dark:border-slate-700 dark:bg-none dark:bg-slate-950">
                          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${statusTone(process.status)}`}
                                >
                                  {statusLabel(process.status)}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className={
                                    ledger.isOpen
                                      ? "rounded-full border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-sky-700 dark:border-sky-500/30 dark:bg-sky-950/30 dark:text-sky-200"
                                      : "rounded-full border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                  }
                                >
                                  {ledger.isOpen ? "Protocolo aberto" : "Histórico"}
                                </Badge>
                                <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                                  Pasta: {currentFolder}
                                </span>
                              </div>

                              <h3
                                className="mt-3 text-lg font-black tracking-[-0.02em] text-slate-950 dark:text-white"
                                title={formatOfficialProcessNumber(process.protocol)}
                              >
                                {formatOfficialProcessNumber(process.protocol)}
                              </h3>
                              <p
                                className="mt-1 max-w-4xl text-sm font-medium leading-6 text-slate-600 dark:text-slate-300"
                                title={formatOfficialProcessTitle({
                                  title: process.title,
                                  type: process.type,
                                })}
                              >
                                {formatOfficialProcessTitle({
                                  title: process.title,
                                  type: process.type,
                                })}
                              </p>

                              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
                                <span className="inline-flex items-center gap-1.5">
                                  <UserRound className="h-3.5 w-3.5" />
                                  Proprietário: <strong className="font-semibold text-slate-700 dark:text-slate-200">{process.ownerName || "Não informado"}</strong>
                                </span>
                                <span className="inline-flex items-center gap-1.5">
                                  <Building2 className="h-3.5 w-3.5" />
                                  Responsável: <strong className="font-semibold text-slate-700 dark:text-slate-200">{process.technicalLead || "Não informado"}</strong>
                                </span>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <MarkerSelector
                                processId={process.id}
                                tags={process.tags}
                                actor={session.name}
                                subjectLabel="processo"
                                triggerClassName="h-9"
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className={`h-9 rounded-full border-slate-300 bg-white px-3 text-[11px] font-bold text-slate-700 shadow-sm hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 ${
                                  isExpanded
                                    ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/50 dark:bg-sky-950/30 dark:text-sky-200"
                                    : ""
                                }`}
                                onClick={() =>
                                  setExpandedProcessId((current) =>
                                    current === process.id ? null : process.id,
                                  )
                                }
                                aria-expanded={isExpanded}
                                aria-controls={`finance-process-details-${process.id}`}
                              >
                                <span>{isExpanded ? "Recolher" : "Ver detalhes"}</span>
                                <ChevronDown
                                  className={`ml-1.5 h-4 w-4 transition-transform duration-200 ${
                                    isExpanded ? "rotate-180" : ""
                                  }`}
                                />
                              </Button>

                              <Button
                                asChild
                                variant="outline"
                                className="h-9 rounded-full border-slate-300 bg-white font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                              >
                                <Link to={`/processos/${process.id}?aba=financeiro`}>
                                  Abrir processo
                                </Link>
                              </Button>
                            </div>
                          </div>
                        </div>

                        {isExpanded ? (
                          <div
                            id={`finance-process-details-${process.id}`}
                            className="border-t border-slate-200 p-5 dark:border-slate-700"
                          >
                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                                Total lançado
                              </p>
                              <p className="mt-2 text-xl font-black text-slate-950 dark:text-white">
                                {formatCurrency(ledger.totalIssued)}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-500/30 dark:bg-emerald-950/20">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-600 dark:text-emerald-300">
                                Pago
                              </p>
                              <p className="mt-2 text-xl font-black text-emerald-800 dark:text-emerald-100">
                                {formatCurrency(ledger.totalPaid)}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-500/30 dark:bg-amber-950/20">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-amber-600 dark:text-amber-300">
                                Em aberto
                              </p>
                              <p className="mt-2 text-xl font-black text-amber-800 dark:text-amber-100">
                                {formatCurrency(ledger.totalPending)}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-500/30 dark:bg-sky-950/20">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-sky-600 dark:text-sky-300">
                                Guias
                              </p>
                              <p className="mt-2 text-xl font-black text-sky-900 dark:text-sky-100">
                                {guides.length}
                              </p>
                              <p className="mt-1 text-[11px] text-sky-700 dark:text-sky-300">
                                {ledger.paidCount} paga(s) · {ledger.pendingCount} pendente(s)
                              </p>
                            </div>
                          </div>

                          <div className="mt-5">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                                  Contabilidade do processo
                                </p>
                                <p className="mt-1 text-sm font-bold text-slate-950 dark:text-white">
                                  Lançamentos vinculados ao protocolo
                                </p>
                              </div>
                              {ledger.totalPending > 0 ? (
                                <Badge
                                  variant="outline"
                                  className="rounded-full border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-300"
                                >
                                  Saldo {formatCurrency(ledger.totalPending)}
                                </Badge>
                              ) : guides.length > 0 ? (
                                <Badge
                                  variant="outline"
                                  className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/20 dark:text-emerald-300"
                                >
                                  Sem saldo pendente
                                </Badge>
                              ) : null}
                            </div>

                            {guides.length === 0 ? (
                              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-900/40">
                                <div className="flex items-start gap-3">
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    <CircleDollarSign className="h-4 w-4" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                                      Nenhum lançamento financeiro emitido
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                      O protocolo continua visível ao Financeiro. Quando uma guia for emitida, ela entrará automaticamente nesta contabilidade.
                                    </p>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {guides.map((guide) => {
                                  const pixPayload = resolveGuideBankingData({
                                    settings: tenantSettings,
                                    guide,
                                    municipalityName,
                                    municipalityCity: tenantSettings?.pixMerchantCity,
                                  }).pixPayload;
                                  const isProtocolGuide = guide.kind === "protocolo";
                                  const busyKey = `${process.id}:${guide.kind}`;

                                  return (
                                    <div
                                      key={`${process.id}:${guide.kind}:${guide.code}`}
                                      className="rounded-[18px] border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/60"
                                    >
                                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_150px_150px_auto] xl:items-center">
                                        <div className="min-w-0">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <p className="text-sm font-black text-slate-950 dark:text-white">
                                              {guideKindLabel(guide.kind)}
                                            </p>
                                            <Badge
                                              variant="outline"
                                              className={
                                                guide.status === "compensada"
                                                  ? "rounded-full border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-950/20 dark:text-emerald-300"
                                                  : "rounded-full border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-950/20 dark:text-amber-300"
                                              }
                                            >
                                              {guide.status === "compensada" ? "Paga" : "Pendente"}
                                            </Badge>
                                            {isProtocolGuide ? (
                                              <Badge
                                                variant="outline"
                                                className="rounded-full border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                              >
                                                Protocolo
                                              </Badge>
                                            ) : null}
                                          </div>
                                          <p className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                                            {guide.code}
                                          </p>
                                          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                                            {guideResponsibility(guide.kind)}
                                          </p>
                                        </div>

                                        <div>
                                          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                                            Vencimento
                                          </p>
                                          <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
                                            <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
                                            {formatDate(guide.dueDate)}
                                          </p>
                                        </div>

                                        <div>
                                          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                                            Valor
                                          </p>
                                          <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">
                                            {formatCurrency(guide.amount)}
                                          </p>
                                        </div>

                                        <div className="flex flex-wrap gap-2 xl:justify-end">
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="rounded-full"
                                            onClick={() =>
                                              void openGuide(process.id, guide.kind, false)
                                            }
                                            disabled={guideBillingBusyKey === busyKey + ":mercadopago"}
                                          >
                                            <Eye className="mr-1.5 h-3.5 w-3.5" />
                                            {guideBillingBusyKey === busyKey + ":mercadopago" ? "Gerando..." : "Preview"}
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="rounded-full"
                                            onClick={() =>
                                              void openGuide(process.id, guide.kind, true)
                                            }
                                            disabled={guideBillingBusyKey === busyKey + ":mercadopago"}
                                          >
                                            <Printer className="mr-1.5 h-3.5 w-3.5" />
                                            {guideBillingBusyKey === busyKey + ":mercadopago" ? "Gerando..." : "DAM"}
                                          </Button>
                                          {guide.status === "pendente" &&
                                          !isProtocolGuide ? (
                                            <Button
                                              type="button"
                                              size="sm"
                                              className="rounded-full bg-emerald-600 font-bold text-white hover:bg-emerald-700"
                                              disabled={financialBusyKey === busyKey}
                                              onClick={() =>
                                                void handleConfirmPayment(
                                                  process.id,
                                                  guide.kind,
                                                )
                                              }
                                            >
                                              {financialBusyKey === busyKey
                                                ? "Confirmando..."
                                                : "Confirmar pagamento"}
                                            </Button>
                                          ) : null}
                                        </div>
                                      </div>

                                      <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
                                        <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/60">
                                          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">
                                            PIX copia e cola
                                          </p>
                                          <p
                                            className="mt-1 overflow-x-auto whitespace-nowrap font-mono text-[10px] leading-5 text-slate-600 dark:text-slate-300"
                                            title={pixPayload || "PIX não configurado"}
                                          >
                                            {pixPayload || "PIX não configurado para esta Prefeitura"}
                                          </p>
                                        </div>
                                        <Button
                                          type="button"
                                          variant="outline"
                                          size="sm"
                                          className="h-full min-h-10 rounded-xl"
                                          onClick={() => copyPixPayload(pixPayload)}
                                          disabled={!pixPayload}
                                        >
                                          <Copy className="h-4 w-4" />
                                          <span className="sr-only">Copiar PIX</span>
                                        </Button>
                                      </div>

                                      {pixPayload && copiedPayload === pixPayload ? (
                                        <p className="mt-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                                          Código copiado.
                                        </p>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })
                )}
              </div>
            </SectionCard>
          </PageMainContent>
        </PageMainGrid>
      </PageShell>
    </PortalFrame>
  );
}
