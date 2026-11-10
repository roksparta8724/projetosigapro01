import { useEffect, useMemo, useState } from "react";
import { Calendar, CreditCard, Eye, FilePenLine, Loader2, Search } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { isValidPixPayload } from "@/lib/pix";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/platform/MetricCard";
import { InternalTabs } from "@/components/platform/InternalTabs";
import { MainContent, MainGrid, PageContainer, SideContent, StatsCards } from "@/components/platform/PageLayout";
import { PageIntro } from "@/components/platform/PageIntro";
import { PortalFrame } from "@/components/platform/PortalFrame";
import {
  type GuiaRecolhimentoOficialProps,
  openGuiaRecolhimentoOficialWindow,
} from "@/components/GuiaRecolhimentoOficial";
import { SectionPanel } from "@/components/platform/SectionPanel";
import { externalTabs, getExternalTabByPath } from "@/lib/externalTabs";
import {
  buildProcessPath,
  formatCurrency,
  formatOfficialProcessNumber,
  formatOfficialProcessTitle,
  getOfficialProcessSequence,
  getPaymentGuideDisplayReference,
  getExternallyVisibleProcessPaymentGuides,
  getGuideObservation,
  getGuideReference,
  getVisibleProcessesByScope,
  type PaymentGuideEntry,
  type ProcessRecord,
} from "@/lib/platform";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { prepareGuideInstitutionalLogo } from "@/lib/guideAssets";
import { ensureMercadoPagoGuideCharge, requestQaPixCharge, type QaPixCharge, type MercadoPagoGuideCharge, type BoletoPayerForm } from "@/lib/mercadoPagoGuide";
import { RealBoletoPayerDialog } from "@/components/platform/RealBoletoPayerDialog";
import { normalizeOfficialBanking } from "@/lib/bankCodes";
import { resolveGuideBankingData } from "@/lib/paymentCollection";
import { archiveAndOpenGuide, readGuideOriginal, openStoredGuide, isGuideSettled } from "@/lib/guideOriginal";
import {isFinancialTestGuide,isPendingFinancialGuide,isReportedCompensatedGuide,summarizeFinancialGuideEvidence} from "@/lib/qaPaymentEvidence";

const paymentStatusOptions = [
  { value: "todos", label: "Todos os status" },
  { value: "pendente", label: "Pendente" },
  { value: "compensada", label: "Compensada" },
  { value: "vencida", label: "Vencida" },
];

function getGuideStatus(guide: { status: string; dueDate: string }) {
  if (isReportedCompensatedGuide(guide)) return "compensada";
  const due = new Date(guide.dueDate);
  if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) return "vencida";
  return "pendente";
}

export function ExternalPaymentsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = usePlatformSession();
  const {
    processes: allProcesses,
    getInstitutionSettings,
    refreshRemoteStore,
  } = usePlatformData();
  const { municipality, scopeId, institutionSettingsCompat } = useMunicipality();
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const tenantSettings = institutionSettingsCompat ?? getInstitutionSettings(effectiveScopeId);

  const processes = getVisibleProcessesByScope(session, effectiveScopeId, allProcesses);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  // Each operation has its own identity. Shared per-guide loading state made
  // "Emitir boleto" and "Gerar PIX" animate at the same time.
  const [busyGuideAction, setBusyGuideAction] = useState<{
    key: string; action: "boleto" | "pix" | "guide";
  } | null>(null);
  const [statusGuideKey, setStatusGuideKey] = useState("");
  const [guideActionStatus, setGuideActionStatus] = useState("");
  const [qaCharges, setQaCharges] = useState<Record<string, MercadoPagoGuideCharge>>({});
  const [qaPixCharges, setQaPixCharges] = useState<Record<string,QaPixCharge>>({});
  const [realBoletoTarget,setRealBoletoTarget] = useState<{process:ProcessRecord;guide:PaymentGuideEntry}|null>(null);
  const [realBoletoError,setRealBoletoError] = useState("");
  const isolatedQaMode = import.meta.env.VITE_SIGAPRO_NEON_ISOLATED === "true";
  const activeTab = getExternalTabByPath(location.pathname);

  const issueSandboxBoleto = async (process: ProcessRecord, guide: PaymentGuideEntry) => {
    if (!isolatedQaMode || !effectiveScopeId || busyGuideAction || guide.status === "compensada") return;
    const actionKey=`${process.id}:${guide.code}`;
    setBusyGuideAction({key:actionKey,action:"boleto"});
    setStatusGuideKey(actionKey);
    setGuideActionStatus("");
    try {
      const charge = await ensureMercadoPagoGuideCharge({
        municipalityId: effectiveScopeId,
        guideCode: guide.code,
        amount: guide.amount,
        dueDate: guide.dueDate,
        description: "DAM de homologação SIGAPRO — NÃO PAGAR",
      }, { isolatedSandboxOnly: true });
      if (charge.environment !== "test" || !charge.orderId) {
        throw new Error("O provedor não confirmou uma order exclusiva do ambiente de testes.");
      }
      setQaCharges((prev) => ({ ...prev, [guide.code]: charge }));
      setGuideActionStatus("Boleto de homologação registrado no ambiente de testes SIGAPRO. Clique em Visualizar guia para conferir os dados. NÃO PAGAR.");
      await refreshRemoteStore();
    } catch (error) {
      setGuideActionStatus(error instanceof Error ? error.message : "Erro na emissão bancária de homologação.");
    } finally {
      setBusyGuideAction(null);
    }
  };

  const issueSandboxPix = async (process: ProcessRecord, guide: PaymentGuideEntry) => {
    if (!isolatedQaMode || !effectiveScopeId || busyGuideAction || guide.status === "compensada") return;
    const actionKey=`${process.id}:${guide.code}`;
    setBusyGuideAction({key:actionKey,action:"pix"});
    setStatusGuideKey(actionKey);
    setGuideActionStatus("");
    try {
      let result: QaPixCharge;
      try {
        result=await requestQaPixCharge({municipalityId:effectiveScopeId,guideCode:guide.code,action:"issue"});
      } catch (error) {
        // Mercado Pago Orders can process PIX asynchronously. If the same
        // order is pending, poll by ID without sending another POST.
        const message=error instanceof Error ? error.message : "";
        if (!/Emissão PIX pendente|order deve ser consultada|QR.*pendente/i.test(message)) throw error;
        result={ok:false,sandboxOnly:true};
        for (let attempt=0; attempt<3; attempt++) {
          await new Promise<void>((resolve)=>setTimeout(resolve,800));
          try {
            result=await requestQaPixCharge({
              municipalityId:effectiveScopeId,guideCode:guide.code,action:"get",
            });
            if(result.ok) break;
          } catch {
            // Keep initial provider status; repeated reads must not issue again.
          }
        }
        if(!result.ok) throw new Error(
          "A order PIX foi criada, mas o Mercado Pago ainda não disponibilizou o QR Code. "+
          "Use o mesmo botão para consultar novamente, sem gerar outra cobrança.",
        );
      }
      if (!result.ok || !isValidPixPayload(result.qrCode) || result.environment!=="test" || !result.orderId) {
        throw new Error("O Mercado Pago não retornou um QR PIX válido de homologação.");
      }
      setQaPixCharges(prev=>({...prev,[guide.code]:result}));
      await refreshRemoteStore();
      setGuideActionStatus("PIX de TESTE emitido para esta guia. Visualize a guia para conferir o QR de homologação. NÃO PAGAR.");
    } catch(error) {
      setGuideActionStatus(error instanceof Error ? error.message : "Falha na emissão do PIX de teste.");
    } finally {
      setBusyGuideAction(null);
    }
  };

  /** Real bank writes require the payer's explicit consent; PDF view is read-only. */
  const issueRealBoleto = async (payer:BoletoPayerForm) => {
    const selected=realBoletoTarget;
    if (!selected || isolatedQaMode || !effectiveScopeId || busyGuideAction) return;
    const {process,guide}=selected;
    const actionKey=`${process.id}:${guide.code}`;
    setBusyGuideAction({key:actionKey,action:"boleto"});
    setStatusGuideKey(actionKey);
    setRealBoletoError("");
    setGuideActionStatus("");
    try {
      const stored=await readGuideOriginal(effectiveScopeId,guide.code);
      if (isGuideSettled(stored))
        throw new Error("Guia já quitada. Não será criada outra cobrança.");
      if (stored.collection_mode_snapshot==="municipal_system" ||
          (stored.payment_provider && stored.payment_provider!=="mercado_pago"))
        throw new Error("Esta guia utiliza a arrecadação própria da Prefeitura; emissão pelo Mercado Pago bloqueada.");
      if (stored.original_pdf_key)
        throw new Error("Esta guia já possui um original arquivado. Utilize Visualizar guia.");
      const result=await ensureMercadoPagoGuideCharge({
        municipalityId:effectiveScopeId,guideCode:stored.guide_number,
        amount:Number(stored.amount),dueDate:stored.due_date,
        description:`${guide.label} · ${process.preProtocol||process.title}`,
        payer,
      });
      if (result.environment!=="production" || !result.orderId)
        throw new Error("O banco não confirmou uma ordem de produção associada à guia.");
      await refreshRemoteStore();
      setRealBoletoTarget(null);
      setGuideActionStatus("Boleto oficial registrado. Utilize Visualizar guia para abrir o PDF arquivado.");
    } catch(error) {
      setRealBoletoError(error instanceof Error?error.message:"Falha na emissão bancária.");
    } finally {setBusyGuideAction(null);}
  };

  const openExternalGuide = async (
    process: ProcessRecord,
    guide: PaymentGuideEntry,
  ) => {
    if (!effectiveScopeId || busyGuideAction) return;

    const actionKey=`${process.id}:${guide.code}`;
    setBusyGuideAction({key:actionKey,action:"guide"});
    setStatusGuideKey(actionKey);
    setGuideActionStatus("");

    // Reserve the output tab synchronously in both environments. An issued
    // QA PIX opens its immutable watermarked PDF; an unissued guide retains
    // the explicit NON-PAYABLE HTML preview using this same reserved tab.
    const officialWindow = window.open("", "_blank");
    if (officialWindow) officialWindow.opener = null;
    try {
      if (!officialWindow)
        throw new Error("O navegador bloqueou a guia. Permita a nova aba do SIGAPRO.");
      // Both production and sandbox PDF issuance use the same canonical
      // payment guide (never a client-side amount or an unsaved QR).
      const persisted = await readGuideOriginal(effectiveScopeId, guide.code);
      // A guide with paid=true MUST reopen its original. If missing, it
      // cannot print a new or merely illustrative payable invoice.
      if (persisted && isGuideSettled(persisted) && !persisted.original_pdf_key)
        throw new Error("Guia quitada sem arquivo original recuperável. Encaminhe ao Financeiro; é proibido regenerá-la.");
      if (persisted?.original_pdf_key) {
        // Viewing an issued guide must not call the bank again, not even to
        // refresh boleto metadata. Reopen only the immutable original.
        if (!await openStoredGuide(persisted, officialWindow!))
          throw new Error("O original autorizado não foi localizado no armazenamento.");
        return;
      }
      const banking = resolveGuideBankingData({
        settings: tenantSettings,
        guide,
        municipalityName: municipality?.name,
        municipalityCity: municipality?.city,
      });

      // QA has two states: an unissued NON-PAYABLE administrative preview or
      // a VERIFIED, provider-issued TEST boleto. Never infer issuance from the
      // saved bank/PIX configuration. Test orders are initiated via explicit CTA.
      const isolatedQa = isolatedQaMode;
      const tested = qaCharges[guide.code];
      const candidate = normalizeOfficialBanking(tested?.barcodeContent, tested?.digitableLine);
      // A previously issued QA PIX is read without creating a second order.
      // It may only become an immutable QA PDF if both the bank ledger and
      // the canonical Neon guide identify the same order, payment and QR.
      let sandboxPix: QaPixCharge | undefined = qaPixCharges[guide.code];
      if (isolatedQa && !sandboxPix?.ok) {
        try {
          const result = await requestQaPixCharge({
            municipalityId:effectiveScopeId,guideCode:guide.code,action:"get",
          });
          if (result.ok) sandboxPix=result;
        } catch { /* A non-payable preview must remain accessible. */ }
      }
      const qaPixBound = Boolean(isolatedQa &&
        persisted.payment_provider === "mercado_pago" &&
        persisted.provider_environment === "test" &&
        persisted.bank_reference && persisted.bank_payment_id &&
        persisted.pix_code && isValidPixPayload(persisted.pix_code) &&
        sandboxPix?.ok && sandboxPix.environment === "test" &&
        sandboxPix.qrCode === persisted.pix_code &&
        sandboxPix.orderId === persisted.bank_reference &&
        sandboxPix.paymentId === persisted.bank_payment_id);
      const savedSandbox = Boolean(
        isolatedQa && guide.providerEnvironment === "test" &&
        guide.paymentProvider === "mercado_pago" && guide.bankReference &&
        banking.barcode && banking.digitableLine,
      );
      const newlyIssued = Boolean(isolatedQa && tested?.ok &&
        tested.environment === "test" && tested.orderId &&
        candidate.barcode && candidate.digitableLine);
      const sandboxIssued = savedSandbox || newlyIssued;
      const charge = isolatedQa && newlyIssued ? tested : null;
      const storedBank = normalizeOfficialBanking(persisted.barcode,persisted.digitable_line);
      const barcode = isolatedQa
        ? (sandboxIssued ? (charge?.barcodeContent || banking.barcode) : "")
        : storedBank.barcode;
      const digitableLine = isolatedQa
        ? (sandboxIssued ? (charge?.digitableLine || banking.digitableLine) : "")
        : storedBank.digitableLine;
      const previewOnly = isolatedQa && !sandboxIssued && !qaPixBound;
      if (!isolatedQa && (!barcode || !digitableLine)) {
        throw new Error("Primeiro emita o boleto oficial com os dados reais do pagador. Visualizar guia nunca cria uma cobrança.");
      }
      const logoUrl = await prepareGuideInstitutionalLogo(
        tenantSettings?.logoUrl,
        tenantSettings?.brasaoUrl,
      );

      const issuedAt = persisted.created_at;
      if (!issuedAt || Number.isNaN(new Date(issuedAt).getTime()))
        throw new Error("A guia oficial não possui data de emissão válida no Neon.");
      const year = new Date(issuedAt).getFullYear();

      const guideDocument: GuiaRecolhimentoOficialProps = {
        prefeitura: {
          nome:
            municipality?.name ||
            tenantSettings?.beneficiarioArrecadacao ||
            "Prefeitura Municipal",
          secretaria:
            tenantSettings?.secretariaResponsavel || "Secretaria responsável",
          endereco: tenantSettings?.endereco || "Endereço não configurado",
          telefone: tenantSettings?.telefone || "",
          logoUrl,
          cadastroTitulo: "Cadastro Eventual",
        },
        contribuinte: {
          nome: process.ownerName,
          cpfCnpj: process.ownerDocument,
          endereco: process.address,
          numeroCadastro:
            process.property.registration ||
            process.preProtocol ||
            "Pré-protocolo",
        },
        guia: {
          numeroGuia: persisted.guide_number,
          nonPayablePreview: previewOnly,
          exercicio: year,
          dataDocumento: issuedAt,
          vencimento: persisted.due_date || guide.dueDate,
          observacao: getGuideObservation(guide.kind),
          proprietario: guide.ownerName || process.ownerName,
          profissionalResponsavel:
            guide.professionalName || process.technicalLead,
          // PIX-only: preserve NULL rather than an invented empty barcode.
          // The Neon freeze RPC compares exact nullable banking fields.
          codigoBarras: qaPixBound ? (persisted.barcode || undefined) : barcode,
          linhaDigitavel: qaPixBound ? (persisted.digitable_line || undefined) : digitableLine,
          // Do not silently manufacture a payable PIX from institutional
          // settings: this guide is archived as a registered boleto only.
          // PIX Orders need their own verified, persisted provider payload.
          pixPayload: qaPixBound ? persisted.pix_code || "" : "",
          qaSandboxPixPayload: qaPixBound ? persisted.pix_code || "" : "",
          bankName: isolatedQa
            ? (sandboxIssued ? (charge?.financialInstitution || "Mercado Pago — teste") : "Mercado Pago (conexão de teste)")
            : charge?.financialInstitution || banking.bankName || "Mercado Pago",
          bankAgreement: banking.bankAgreement,
          // Display only the municipality's saved administrative bank metadata.
          // These fields DO NOT prove a registered bank-issued boleto.
          bankMunicipalName: tenantSettings?.bankName?.trim() || undefined,
          bankCode: tenantSettings?.bankCode?.trim() || undefined,
          bankAgency: tenantSettings?.bankAgency?.trim() || undefined,
          bankAccount: tenantSettings?.bankAccount?.trim() || undefined,
          bankBeneficiary: tenantSettings?.beneficiarioArrecadacao?.trim() || undefined,
          bankInstructions: isolatedQa
            ? (sandboxIssued
              ? "BOLETO DE HOMOLOGAÇÃO — dados fornecidos pelo Mercado Pago em ambiente de TESTE. NÃO EFETUAR PAGAMENTO."
              : "HOMOLOGAÇÃO SIGAPRO — DOCUMENTO NÃO PAGÁVEL. Nenhuma cobrança foi registrada no banco.")
            : banking.bankInstructions,
          bankReference: previewOnly ? undefined : (qaPixBound ? persisted.bank_reference : (isolatedQa ? (charge?.orderId || guide.bankReference) : persisted.bank_reference)),
          bankPaymentId: previewOnly ? undefined : (qaPixBound ? persisted.bank_payment_id : (isolatedQa ? (charge?.paymentId || guide.bankPaymentId) : persisted.bank_payment_id)),
          bankStatus: previewOnly ? undefined : (qaPixBound ? persisted.bank_status : (isolatedQa ? (charge?.status || guide.bankStatus) : persisted.bank_status)),
          bankStatusDetail: previewOnly ? undefined : (qaPixBound ? persisted.bank_status_detail : (isolatedQa ? (charge?.statusDetail || guide.bankStatusDetail) : persisted.bank_status_detail)),
          bankAuthenticatedAt: previewOnly ? undefined : (isolatedQa ? undefined : persisted.bank_authenticated_at),
          bankEnvironment: isolatedQa ? "test" : persisted.provider_environment,
          paymentProvider: qaPixBound ? "mercado_pago" : (isolatedQa
            ? (guide.paymentProvider || tenantSettings?.paymentProvider || "mercado_pago")
            : persisted.payment_provider || "mercado_pago"),
          valorDocumento: Number(persisted.amount),
          descontos: 0,
          outrosAcrescimos: 0,
          valorCobrado: Number(persisted.amount),
          referencia: getGuideReference(guide.kind),
        },
        itens: [
          {
            ano: year,
            divida: guide.label,
            tabela: tenantSettings?.guiaPrefixo || "DAM",
            principal: Number(persisted.amount),
            multa: 0,
            juros: 0,
            correcao: 0,
            total: Number(persisted.amount),
          },
        ],
      };

      if (isolatedQa && qaPixBound) {
        // This is a provider-issued sandbox QR with a matching Neon record,
        // not a synthetic QR or a production receivable. Freeze the exact
        // watermarked QA PDF before a signed webhook can finalize the test.
        await archiveAndOpenGuide(effectiveScopeId,guideDocument,officialWindow);
        setGuideActionStatus("PDF original de PIX em homologação arquivado e reaberto. Pagamento ainda depende de notificação bancária assinada.");
      } else if (isolatedQa) {
        const opened = openGuiaRecolhimentoOficialWindow(guideDocument, {
          title: sandboxIssued
            ? `BOLETO DE TESTE — NÃO PAGAR · ${guide.code}`
            : `PRÉVIA NÃO PAGÁVEL · ${guide.code}`,
          autoPrint: false,
        },officialWindow);
        if (!opened)
          throw new Error("O navegador bloqueou a prévia de homologação.");
      } else {
        // The only real-world viewing route: canonical Neon guide →
        // immutable PDF bytes in R2/S3 → signed, municipality-authorized GET.
        // Never expose a live payable HTML facsimile as the official record.
        await archiveAndOpenGuide(effectiveScopeId, guideDocument, officialWindow!);
      }
    } catch (error) {
      if (officialWindow && !officialWindow.closed) officialWindow.close();
      setGuideActionStatus(
        error instanceof Error
          ? error.message
          : "Não foi possível abrir a guia agora.",
      );
    } finally {
      setBusyGuideAction(null);
    }
  };

  // Enquanto existe guia inicial pendente, a tela acompanha o banco oficial.
  // Assim a confirmação de pagamento transforma o pré-protocolo em processo
  // sem exigir F5 e sem risco de a interface ficar com estado antigo.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") {
        void refreshRemoteStore();
      }
    };

    // Payment status still refreshes when returning to this tab; this avoids
    // re-fetching every operational table from every external session each 8s.
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [refreshRemoteStore]);

  const guides = useMemo(() => {
    const entries = processes.flatMap((process) =>
      getExternallyVisibleProcessPaymentGuides(process, tenantSettings).map((guide) => ({
        process,
        guide,
        status: getGuideStatus(guide),
      })),
    );

    return entries.sort((a, b) => {
      const aSequence = getOfficialProcessSequence(a.process);
      const bSequence = getOfficialProcessSequence(b.process);

      if (Boolean(aSequence) !== Boolean(bSequence)) {
        return aSequence ? -1 : 1;
      }

      if (aSequence && bSequence) {
        if (aSequence.year !== bSequence.year) return bSequence.year - aSequence.year;
        if (aSequence.number !== bSequence.number) {
          return bSequence.number - aSequence.number;
        }
      }

      const aIssued = a.guide.issuedAt ? new Date(a.guide.issuedAt).getTime() : 0;
      const bIssued = b.guide.issuedAt ? new Date(b.guide.issuedAt).getTime() : 0;
      return bIssued - aIssued;
    });
  }, [processes, tenantSettings]);

  const filteredGuides = useMemo(() => {
    const term = search.trim().toLowerCase();
    return guides.filter((item) => {
      const matchesStatus = statusFilter === "todos" || item.status === statusFilter;
      const matchesSearch =
        !term ||
        item.process.protocol.toLowerCase().includes(term) ||
        String(item.process.preProtocol || "").toLowerCase().includes(term) ||
        item.process.title.toLowerCase().includes(term) ||
        item.guide.code.toLowerCase().includes(term) ||
        String(item.guide.officialProcessReference || "").toLowerCase().includes(term);
      return matchesStatus && matchesSearch;
    });
  }, [guides, search, statusFilter]);

  const financialSnapshot=summarizeFinancialGuideEvidence(guides.map(item=>item.guide));
  const pendingCount=guides.filter(item=>isPendingFinancialGuide(item.guide)).length;
  const overdueCount=guides.filter(item=>item.status==="vencida"&&!isFinancialTestGuide(item.guide)).length;
  const paidCount=financialSnapshot.compensatedCount;
  const totalValue=financialSnapshot.issuedAmount;

  return (
    <>
    <PortalFrame eyebrow="Acesso Externo" title="Pagamentos">
      <PageContainer>
        <PageIntro
          eyebrow="Pagamentos"
          title="Guias e pendências financeiras"
          description="Acompanhe as guias emitidas, abra a cobrança oficial e ajuste o rascunho antes do pagamento quando a abertura ainda não possuir número municipal."
          icon={CreditCard}
          actions={
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/externo/controle">Controle de processos</Link>
            </Button>
          }
        />

        {import.meta.env.VITE_SIGAPRO_NEON_ISOLATED === "true" ? (
          <div role="status" data-qa-payment-preview="true" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950">
            HOMOLOGAÇÃO SIGAPRO — Utilize "Emitir boleto de TESTE" e "Gerar PIX de TESTE" para obter exclusivamente dados de cobrança simulada do Mercado Pago; depois clique em "Visualizar guia".
            NÃO PAGAR. Nenhum PIX estático da Prefeitura é usado. Arquivamento oficial, cobranças reais e baixas automáticas permanecem desativados.
          </div>
        ) : null}
        <InternalTabs
          items={externalTabs.map(({ value, label, helper }) => ({ value, label, helper }))}
          value={activeTab.value}
          onChange={(value) => {
            const target = externalTabs.find((tab) => tab.value === value);
            if (target) navigate(target.route);
          }}
        />

        <StatsCards>
          <MetricCard title="Pendentes" value={String(pendingCount)} helper="Guias aguardando" icon={Calendar} tone="amber" />
          <MetricCard title="Vencidas" value={String(overdueCount)} helper="Requer atenção" icon={Calendar} tone="rose" />
          <MetricCard title="Compensadas no sistema" value={String(paidCount)} helper={`${financialSnapshot.bankVerifiedCount} com baixa bancária verificada; demais aguardam comprovante`} icon={CreditCard} tone="emerald" />
          <MetricCard title="Total emitido" value={formatCurrency(totalValue)} helper="Montante de guias não simuladas" icon={CreditCard} tone="blue" />
        </StatsCards>

        <MainGrid>
          <MainContent>
            <SectionPanel
              title="Guias vinculadas aos protocolos"
              description="Use a busca para localizar guias específicas por protocolo ou código."
              actions={
                <div className="mt-2 grid w-full gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="relative min-w-0">
                    <Search className="sig-search-icon pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Buscar protocolo, projeto ou guia"
                      className="h-11 rounded-2xl pl-9 text-[14px]"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-11 rounded-2xl sig-dark-panel text-[14px]">
                      <SelectValue placeholder="Todos os status" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentStatusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              }
              contentClassName="space-y-4"
            >

              <div className="hidden rounded-[12px] border border-[#E5E7EB] bg-[#F8FAFC] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 2xl:grid 2xl:grid-cols-[1.15fr_1fr_0.85fr_0.75fr_0.7fr_1.25fr] 2xl:gap-3">
                <span>Pré-protocolo / Processo</span>
                <span>Projeto</span>
                <span>Guia</span>
                <span>Vencimento</span>
                <span>Status</span>
                <span className="text-right">Ações</span>
              </div>

              {filteredGuides.map(({ process, guide, status }) => {
                const isHabiteSe = String(process.type || "")
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .toLocaleLowerCase("pt-BR")
                  .includes("habite");
                const processTarget =
                  process.isOfficial === false
                    ? `${isHabiteSe ? "/externo/habite-se" : "/externo/protocolar"}?preprotocolo=${encodeURIComponent(
                        process.preProtocol || process.protocol,
                      )}`
                    : buildProcessPath(process, "financeiro");

                return (
                  <div
                    key={`${process.id}-${guide.code}`}
                    role="link"
                    tabIndex={0}
                    data-clickable-payment-process="true"
                    aria-label={`Abrir ${process.title}`}
                    className="sig-dark-panel group cursor-pointer rounded-[12px] border border-[#E5E7EB] p-4 shadow-sm transition duration-200 hover:-translate-y-[1px] hover:border-sky-300 hover:shadow-[0_12px_28px_rgba(15,23,42,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
                    onClick={() => navigate(processTarget)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        navigate(processTarget);
                      }
                    }}
                  >
                    <div className="grid gap-4 2xl:grid-cols-[1.15fr_1fr_0.85fr_0.75fr_0.7fr_1.25fr] 2xl:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-slate-950">
                          {process.isOfficial === false
                            ? "Rascunho com guia emitida"
                            : formatOfficialProcessNumber(process.protocol)}
                        </p>
                        <p className="mt-1 truncate text-[13px] text-slate-500">
                          {process.isOfficial === false
                            ? `Referência temporária: ${process.preProtocol || process.protocol} · sem número oficial até o pagamento`
                            : formatOfficialProcessTitle({ title: process.title, type: process.type })}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-semibold text-slate-900">{formatOfficialProcessTitle({ title: process.title, type: process.type })}</p>
                        <p className="mt-1 truncate text-[13px] text-slate-500">{process.type}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-slate-900">
                          {getPaymentGuideDisplayReference(process, guide)}
                        </p>
                        {guide.officialProcessReference &&
                        guide.officialProcessReference !== guide.code ? (
                          <p className="mt-1 truncate text-[11px] font-medium text-slate-400" title={guide.code}>
                            Guia original paga no pré-protocolo: {guide.code}
                          </p>
                        ) : null}
                        <p className="mt-1 text-[13px] text-slate-500">{formatCurrency(guide.amount)}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium text-slate-900">{guide.dueDate}</p>
                        <p className="mt-1 text-[12px] uppercase tracking-[0.12em] text-slate-500">Vencimento</p>
                      </div>
                      <div className="min-w-0">
                        <Badge
                          variant="outline"
                          className={`rounded-full px-3 py-1 text-[12px] ${
                            isFinancialTestGuide(guide)
                               ? "border-sky-200 bg-sky-50 text-sky-800"
                               : status === "compensada"
                                 ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                              : status === "vencida"
                                ? "border-rose-200 bg-rose-50 text-rose-600"
                                : "border-amber-200 bg-amber-50 text-amber-600"
                          }`}
                        >
                          {isFinancialTestGuide(guide)
                             ? "Simulação QA — sem pagamento bancário"
                             : status === "compensada" ? "Compensada no sistema"
                               : status === "vencida" ? "Vencida" : "Pendente"}
                        </Badge>
                      </div>
                      <div
                        className="flex flex-wrap justify-start gap-2 2xl:justify-end"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {process.isOfficial === false ? (
                          <>
                            <Button
                              asChild
                              variant="outline"
                              data-preprotocol-edit-action="true"
                              className="rounded-full text-[12px] font-semibold"
                            >
                              <Link to={processTarget}>
                                <FilePenLine className="mr-1.5 h-3.5 w-3.5" />
                                Editar rascunho
                              </Link>
                            </Button>
                            {isolatedQaMode && guide.status !== "compensada" ? (
                              <Button
                                type="button"
                                variant="outline"
                                data-qa-issue-boleto="true"
                                className="rounded-full border-amber-300 bg-amber-50 px-4 text-[12px] font-semibold text-amber-950 hover:bg-amber-100"
                                disabled={Boolean(busyGuideAction)}
                                onClick={() => void issueSandboxBoleto(process, guide)}
                              >
                                {busyGuideAction?.key === `${process.id}:${guide.code}` && busyGuideAction.action === "boleto"
                                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                  : <CreditCard className="mr-1.5 h-3.5 w-3.5" />}
                                Emitir boleto de TESTE
                              </Button>
                            ) : null}
                            {isolatedQaMode && guide.status !== "compensada" ? (
                              <Button
                                type="button"
                                variant="outline"
                                data-qa-issue-pix="true"
                                className="rounded-full border-sky-300 bg-sky-50 px-4 text-[12px] font-semibold text-sky-950 hover:bg-sky-100"
                                disabled={Boolean(busyGuideAction)}
                                onClick={() => void issueSandboxPix(process,guide)}
                              >
                                {busyGuideAction?.key === `${process.id}:${guide.code}` && busyGuideAction.action === "pix"
                                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                  : <CreditCard className="mr-1.5 h-3.5 w-3.5" />}
                                Gerar PIX de TESTE
                              </Button>
                            ) : null}
                            {!isolatedQaMode && !isGuideSettled(guide) &&
                            (guide.paymentProvider || tenantSettings?.paymentProvider || "mercado_pago")==="mercado_pago" ? (
                              <Button
                                type="button"
                                variant="outline"
                                data-prod-issue-boleto="true"
                                className="rounded-full border-sky-600 px-4 text-[12px] font-semibold text-sky-800 hover:bg-sky-50 dark:border-sky-500 dark:text-sky-200"
                                disabled={Boolean(busyGuideAction)}
                                onClick={()=>{
                                  setRealBoletoError("");
                                  setRealBoletoTarget({process,guide});
                                }}
                              >
                                <CreditCard className="mr-1.5 size-3.5" />
                                Emitir boleto oficial
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              data-preprotocol-guide-action="true"
                              className="rounded-full bg-sky-700 px-4 text-[12px] font-bold !text-white shadow-[0_8px_20px_rgba(3,105,161,0.20)] hover:bg-sky-800 [&_*]:!text-white"
                              disabled={Boolean(busyGuideAction)}
                              onClick={() => void openExternalGuide(process, guide)}
                            >
                              {busyGuideAction?.key === `${process.id}:${guide.code}` && busyGuideAction.action === "guide" ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Eye className="mr-1.5 h-3.5 w-3.5" />
                              )}
                              Visualizar guia
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button asChild variant="outline" className="rounded-full text-[13px]">
                              <Link to={processTarget}>Ver processo</Link>
                            </Button>
                            {!isolatedQaMode && !isGuideSettled(guide) &&
                            (guide.paymentProvider || tenantSettings?.paymentProvider || "mercado_pago")==="mercado_pago" ? (
                              <Button
                                type="button" variant="outline"
                                data-prod-issue-boleto-official-process="true"
                                className="rounded-full border-sky-600 px-4 text-[12px] font-semibold text-sky-800 dark:border-sky-500 dark:text-sky-200"
                                disabled={Boolean(busyGuideAction)}
                                onClick={()=>{setRealBoletoError("");setRealBoletoTarget({process,guide});}}
                              >
                                <CreditCard className="mr-1.5 size-3.5"/>
                                Emitir boleto oficial
                              </Button>
                            ) : null}
                            <Button
                              type="button" variant="outline"
                              data-official-guide-view="true"
                              className="rounded-full px-4 text-[12px] font-semibold"
                              disabled={Boolean(busyGuideAction)}
                              onClick={()=>void openExternalGuide(process,guide)}
                            >
                              {busyGuideAction?.key===`${process.id}:${guide.code}` &&
                               busyGuideAction.action==="guide"
                                ? <Loader2 className="mr-1.5 size-3.5 animate-spin"/>
                                : <Eye className="mr-1.5 size-3.5"/>}
                              Visualizar guia
                            </Button>
                          </>
                        )}
                        {statusGuideKey === `${process.id}:${guide.code}` && guideActionStatus ? (
                          <div role="status" aria-live="polite"
                            data-qa-guide-feedback="true"
                            className="w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium leading-5 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100">
                            {guideActionStatus}
                          </div>
                        ) : null}
                        {isolatedQaMode && qaPixCharges[guide.code]?.ok &&
                          isValidPixPayload(qaPixCharges[guide.code]?.qrCode) ? (
                            <div data-qa-pix-preview="true"
                              className="w-full rounded-xl border border-sky-200 bg-white p-3 text-center text-slate-900 shadow-sm">
                              <p className="mb-2 text-xs font-bold">PIX DE HOMOLOGAÇÃO — NÃO PAGAR</p>
                              <QRCodeSVG value={qaPixCharges[guide.code].qrCode!} size={124} level="M" />
                              <p className="mt-2 break-all font-mono text-[9px]">
                                {qaPixCharges[guide.code].qrCode}
                              </p>
                              <p className="mt-2 text-xs font-semibold">QR do Mercado Pago de TESTE. Visualize a guia para abrir o documento.</p>
                            </div>
                          ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredGuides.length === 0 ? (
                <div className="sig-dark-panel rounded-[12px] border border-dashed border-slate-300 p-8 text-center">
                  <p className="text-[18px] font-semibold text-slate-900">Nenhuma guia encontrada</p>
                  <p className="mt-2 text-[15px] text-slate-600">Não há guias compatíveis com os filtros selecionados.</p>
                </div>
              ) : null}
            </SectionPanel>
          </MainContent>

          <SideContent>
            <SectionPanel title="Pendências financeiras" description="Guias que exigem atenção imediata." contentClassName="space-y-3">
              {overdueCount === 0 && pendingCount === 0 ? (
                <div className="sig-dark-panel rounded-[10px] border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                  Nenhuma pendência financeira crítica no momento.
                </div>
              ) : (
                guides
                  .filter((item) => item.status !== "compensada")
                  .slice(0, 3)
                  .map((item) => (
                    <div key={`side-${item.process.id}-${item.guide.code}`} className="sig-dark-panel rounded-[10px] border border-[#E5E7EB] p-4 text-sm">
                      <p className="text-sm font-semibold text-slate-900">
                        {item.process.isOfficial === false
                          ? item.process.preProtocol || item.process.protocol
                          : formatOfficialProcessNumber(item.process.protocol)}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">{formatCurrency(item.guide.amount)}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.14em] text-amber-600 dark:text-amber-400">
                        {item.status === "vencida" ? "Vencida" : "Pendente"}
                      </p>
                    </div>
                  ))
              )}
            </SectionPanel>

            <SectionPanel title="Ações rápidas" description="Atalhos para gestão financeira." contentClassName="space-y-3">
              <Button asChild variant="outline" className="w-full justify-start rounded-2xl">
                <Link to="/externo/controle">Controle de processos</Link>
              </Button>
              <Button asChild variant="outline" className="w-full justify-start rounded-2xl">
                <Link to="/externo/historico">Histórico</Link>
              </Button>
            </SectionPanel>
          </SideContent>
        </MainGrid>
      </PageContainer>
    </PortalFrame>
    <RealBoletoPayerDialog
      open={Boolean(realBoletoTarget)}
      onOpenChange={open=>{if(!open){setRealBoletoTarget(null);setRealBoletoError("");}}}
      guideCode={realBoletoTarget?.guide.code||""}
      payerName={realBoletoTarget?.process.ownerName||""}
      busy={Boolean(busyGuideAction&&busyGuideAction.action==="boleto")}
      error={realBoletoError}
      onConfirm={issueRealBoleto}
    />
    </>
  );
}
