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
  reserveGuiaRecolhimentoOficialWindow,
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
import { backendClient } from "@/integrations/backend/databaseClient";
import { getRenderedMunicipalityLogoDataUrl, prepareGuideInstitutionalLogo } from "@/lib/guideAssets";
import { useInstitutionBranding } from "@/hooks/useInstitutionBranding";
import { getMunicipalityLogoOpenUrl } from "@/integrations/r2/client";
import { ensureMercadoPagoGuideCharge, requestQaPixCharge, reconcileQaPixAfterPdf, type QaPixCharge, type MercadoPagoGuideCharge } from "@/lib/mercadoPagoGuide";
import { normalizeOfficialBanking } from "@/lib/bankCodes";
import { buildGuidePixPayload, resolveGuideBankingData } from "@/lib/paymentCollection";
import { archiveAndOpenGuide, isGuideSettled, openLegacyGuideOriginal, openStoredGuide, readGuideOriginal, type GuideOriginal, canResumeQaFrozenGuide } from "@/lib/guideOriginal";
import { isGuideOverdueOnBrazilDate } from "@/lib/guideCivilDueDate";
import { renderGuideOriginalPdf } from "@/lib/guidePdf";
import { verifyPersistedQaBoleto } from "@/lib/qaGuideBankConfirmation";
import { municipalCollectionApiRequest } from "@/lib/municipalCollectionApi";
import { resolveMunicipalChargeRoute, municipalChargeRouteMessage, type BankConnection } from "@/lib/municipalChargeRouting";

const paymentStatusOptions = [
  { value: "todos", label: "Todos os status" },
  { value: "pendente", label: "Pendente" },
  { value: "compensada", label: "Compensada" },
  { value: "vencida", label: "Vencida" },
];

function getGuideStatus(guide: { status: string; dueDate: string }) {
  if (isGuideSettled(guide)) return "compensada";
  if (isGuideOverdueOnBrazilDate(guide.dueDate)) return "vencida";
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
  const { municipality, branding: municipalityBranding, scopeId, institutionSettingsCompat } = useMunicipality();
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const tenantSettings = institutionSettingsCompat ?? getInstitutionSettings(effectiveScopeId);
  const { headerBranding } = useInstitutionBranding(effectiveScopeId);

  const processes = getVisibleProcessesByScope(session, effectiveScopeId, allProcesses);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  // Each operation has its own identity. Shared per-guide loading state made
  // "Emitir boleto" and "Gerar PIX" animate at the same time.
  const [busyGuideAction, setBusyGuideAction] = useState<{
    key: string; action: "boleto" | "pix" | "guide" | "preview" | "reconcile";
  } | null>(null);
  const [statusGuideKey, setStatusGuideKey] = useState("");
  const [guideActionStatus, setGuideActionStatus] = useState("");
  const [qaCharges, setQaCharges] = useState<Record<string, MercadoPagoGuideCharge>>({});
  const [qaPixCharges, setQaPixCharges] = useState<Record<string,QaPixCharge>>({});
  const isolatedQaMode = import.meta.env.VITE_SIGAPRO_NEON_ISOLATED === "true";
  // A prévia remota do Vercel não possui a rota do emissor bancário isolado.
  // Exibir a emissão lá causava 404 e sugeria falsamente que houve cobrança.
  // O provedor de testes existe SOMENTE no Vite local isolado :8080/:8081.
  const localQaBankIssuer = isolatedQaMode &&
    typeof window !== "undefined" &&
    ["localhost", "127.0.0.1"].includes(window.location.hostname) &&
    ["8080", "8081"].includes(window.location.port);
  // Preview QA PIX is persisted in Neon through a protected serverless handler.
  const qaPixIssuer = localQaBankIssuer || (isolatedQaMode &&
    typeof window !== "undefined" &&
    window.location.hostname === "projetosigapro01-git-qa-sigapro-f7ead8-roksparta8724s-projects.vercel.app");
  const activeTab = getExternalTabByPath(location.pathname);

  const issueSandboxBoleto = async (process: ProcessRecord, guide: PaymentGuideEntry) => {
    if (!localQaBankIssuer || !effectiveScopeId || busyGuideAction || isGuideSettled(guide)) return;
    const actionKey=`${process.id}:${guide.code}`;
    setBusyGuideAction({key:actionKey,action:"boleto"});
    setStatusGuideKey(actionKey);
    setGuideActionStatus("");
    try {
      // The UI may be stale after F5 or a payment webhook. Read the
      // authenticated Neon guide BEFORE any issuer POST. An existing order
      // is not an invitation to issue a second, potentially chargeable one.
      const current = await readGuideOriginal(effectiveScopeId, guide.code);
      if (current.municipality_id !== effectiveScopeId ||
          current.process_id !== process.id ||
          current.guide_number !== guide.code) {
        throw new Error("A guia não pertence ao processo e à Prefeitura selecionados.");
      }
      if (isGuideSettled(current)) {
        throw new Error("Esta guia já foi paga. Abra o PDF original; uma nova cobrança não será criada.");
      }
      if (current.original_pdf_key) {
        setGuideActionStatus(
          "PDF original desta guia já está arquivado no Neon. Abra a mesma guia; nenhum boleto novo será emitido. NÃO PAGAR.",
        );
        return;
      }
      const existingOrder = Boolean(current.bank_reference);
      if (existingOrder) {
        // The bank may create an order before returning its barcode. Never
        // request a different order: the isolated server detects bank_reference
        // and does ONLY a GET for that exact order, with the same guide/amount.
        if (current.payment_provider !== "mercado_pago" ||
            current.provider_environment !== "test") {
          throw new Error("Há uma cobrança de outro provedor vinculada à guia. Consulte o Financeiro, sem emitir novamente.");
        }
        const savedCodes = normalizeOfficialBanking(current.barcode, current.digitable_line);
        if (savedCodes.barcode && savedCodes.digitableLine) {
          setGuideActionStatus(
            "Boleto de TESTE já confirmado no Neon. Abra a guia para consultar e arquivar seu PDF; nenhuma nova cobrança foi emitida. NÃO PAGAR.",
          );
          return;
        }
      }
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
      // Verify the same order, municipality, process and canonical amount
      // against Neon before announcing that a bank boleto was issued.
      const persisted = await readGuideOriginal(effectiveScopeId, guide.code);
      verifyPersistedQaBoleto({
        original: persisted,
        charge,
        municipalityId: effectiveScopeId,
        processId: process.id,
        guideCode: guide.code,
        amount: guide.amount,
      });
      setQaCharges((prev) => ({ ...prev, [guide.code]: charge }));
      // A post-issuance list refresh can fail independently of a payment
      // order that was already confirmed in Neon. Never portray that failure
      // as a failed issuance, which would encourage an unsafe second POST.
      let listRefreshFailed = false;
      try {
        await refreshRemoteStore();
      } catch {
        listRefreshFailed = true;
      }
      setGuideActionStatus(listRefreshFailed
        ? "Boleto de TESTE já confirmado e salvo no Neon. A lista não atualizou; atualize a página para visualizar o mesmo boleto, sem emitir novamente. NÃO PAGAR."
        : "Boleto de TESTE confirmado no Neon com referência bancária e valor corretos. Abra a guia para arquivar o PDF original. NÃO PAGAR.");
    } catch (error) {
      setGuideActionStatus(error instanceof Error ? error.message : "Erro na emissão bancária de homologação.");
    } finally {
      setBusyGuideAction(null);
    }
  };

  const issueSandboxPix = async (process: ProcessRecord, guide: PaymentGuideEntry) => {
    if (!qaPixIssuer || !effectiveScopeId || busyGuideAction || isGuideSettled(guide)) return;
    const actionKey=`${process.id}:${guide.code}`;
    setBusyGuideAction({key:actionKey,action:"pix"});
    setStatusGuideKey(actionKey);
    setGuideActionStatus("");
    try {
      // Do not create a PIX order for a paid or foreign process due to a
      // stale external guide list. Distinct boleto/PIX media remain allowed.
      const current = await readGuideOriginal(effectiveScopeId, guide.code);
      if (current.municipality_id !== effectiveScopeId ||
          current.process_id !== process.id ||
          current.guide_number !== guide.code) {
        throw new Error("A guia PIX não pertence ao processo e à Prefeitura selecionados.");
      }
      if (isGuideSettled(current)) {
        throw new Error("Guia já paga: o PIX não será emitido novamente.");
      }
      // Once frozen, clicking the original issue button may ONLY consult the
      // existing order. Never re-enter the issue/reservation flow.
      if (current.original_pdf_key || current.document_snapshot) {
        const previous=await requestQaPixCharge({
          municipalityId:effectiveScopeId,guideCode:guide.code,action:"get",
        });
        if (!previous.ok || !isValidPixPayload(previous.qrCode))
          throw new Error("O documento foi congelado, mas a ordem PIX de teste não pôde ser consultada.");
        setQaPixCharges(prev=>({...prev,[guide.code]:previous}));
        setGuideActionStatus(current.original_pdf_key
          ? "PIX de TESTE já arquivado. Clique em Visualizar guia para abrir o mesmo PDF original. Nenhuma nova cobrança foi criada."
          : "PIX de TESTE confirmado e snapshot preservado. O PDF original ainda não foi arquivado: clique em Visualizar guia para concluir o envio, sem emitir outra cobrança.");
        return;
      }
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
      setGuideActionStatus("PIX de TESTE emitido para esta guia. Visualize a guia para conferir o QR de homologação. NÃO PAGAR.");
    } catch(error) {
      setGuideActionStatus(error instanceof Error ? error.message : "Falha na emissão do PIX de teste.");
    } finally {
      setBusyGuideAction(null);
    }
  };

  // Works after F5 and on a new device: always checks the canonical Neon guide,
  // never depends on a cached QR or requests another provider order.
  const refreshSandboxPixStatus = async (process: ProcessRecord, guide: PaymentGuideEntry) => {
    if (!qaPixIssuer || !effectiveScopeId || busyGuideAction || !guide.code.startsWith("DAM-PRE-QA-")) return;
    const key = `${process.id}:${guide.code}`;
    setBusyGuideAction({key, action:"reconcile"});
    setStatusGuideKey(key);
    setGuideActionStatus("");
    try {
      const original=await readGuideOriginal(effectiveScopeId,guide.code);
      if(original.municipality_id!==effectiveScopeId ||
         original.process_id!==process.id || original.guide_number!==guide.code)
        throw new Error("Guia PIX fora da Prefeitura ou do processo autenticado.");
      if (isGuideSettled(original)) {
        setGuideActionStatus("Guia já compensada no Neon. Nenhuma nova cobrança foi emitida.");
        await refreshRemoteStore();
        return;
      }
      if (original.provider_environment!=="test" || original.payment_provider!=="mercado_pago" ||
          !original.bank_reference || !original.pix_code) {
        setGuideActionStatus("Esta guia ainda não possui uma ordem PIX de TESTE confirmada no Neon. Nenhuma cobrança foi criada.");
        return;
      }
      if (!original.original_pdf_key || !original.original_pdf_sha256 || !original.document_snapshot) {
        setGuideActionStatus("É necessário arquivar o PDF original da mesma guia antes de conferir a baixa bancária. Nenhuma cobrança foi criada.");
        return;
      }
      // A fresh authenticated bank GET checks the SAME order. It settles only
      // with an existing signed webhook, credited transaction and valid PDF.
      const reconciled=await reconcileQaPixAfterPdf({
        municipalityId:effectiveScopeId,guideCode:guide.code,
      });
      if (reconciled.settled) {
        const confirmed=await readGuideOriginal(effectiveScopeId,guide.code);
        if (!isGuideSettled(confirmed) || confirmed.original_pdf_key!==original.original_pdf_key ||
            confirmed.bank_reference!==original.bank_reference)
          throw new Error("O Neon ainda não confirmou a baixa na guia original; resultado não homologado.");
        setGuideActionStatus("Crédito bancário conciliado e baixa registrada no Neon na mesma guia, com PDF original preservado.");
        await refreshRemoteStore();
      } else {
        setGuideActionStatus(reconciled.status==="awaiting_bank_credit"
          ? "Mercado Pago ainda não comprovou crédito PIX. A guia continua pendente no Neon."
          : "Baixa não efetuada. Conciliação bancária em revisão: "+reconciled.status+".");
      }
    } catch(error) {
      setGuideActionStatus(error instanceof Error ? error.message : "Falha na conferência bancária de TESTE. Nenhuma baixa foi registrada.");
    } finally {
      setBusyGuideAction(null);
    }
  };

  /** Compare the corrected QA-only A4 layout against the frozen snapshot.
   * Never mutate the archived legal original or issue another bank order. */
  const previewQaA4Layout = async (process: ProcessRecord, guide: PaymentGuideEntry) => {
    if (!isolatedQaMode || !effectiveScopeId || busyGuideAction ||
        !guide.code.startsWith("DAM-PRE-QA-")) return;
    const target = reserveGuiaRecolhimentoOficialWindow(`Conferência A4 · ${guide.code}`);
    if (!target) {
      setGuideActionStatus("O navegador bloqueou a prévia A4. Habilite pop-ups e tente novamente.");
      return;
    }
    const key = `${process.id}:${guide.code}`;
    setBusyGuideAction({key,action:"preview"});
    setStatusGuideKey(key);
    setGuideActionStatus("");
    try {
      const original = await readGuideOriginal(effectiveScopeId,guide.code);
      if (original.municipality_id !== effectiveScopeId ||
          original.process_id !== process.id ||
          original.guide_number !== guide.code ||
          original.provider_environment !== "test" ||
          !original.document_snapshot) {
        throw new Error("Prévia A4 indisponível: a guia não possui snapshot de TESTE válido desta Prefeitura.");
      }
      const rendered = await renderGuideOriginalPdf(original.document_snapshot);
      const url = URL.createObjectURL(rendered);
      target.location.replace(url);
      window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60 * 1000);
      setGuideActionStatus("Prévia de layout A4 gerada apenas para conferência. O PDF original arquivado não foi alterado; nenhum PIX foi emitido.");
    } catch(error) {
      target.close();
      setGuideActionStatus(error instanceof Error ? error.message : "Não foi possível apresentar a prévia do layout A4.");
    } finally {
      setBusyGuideAction(null);
    }
  };

  const openExternalGuide = async (
    process: ProcessRecord,
    guide: PaymentGuideEntry,
  ) => {
    if (!effectiveScopeId || busyGuideAction) return;

    // Reserve the new tab synchronously inside the user's click. A later
    // window.open() after provider/branding awaits is blocked by browsers.
    const reservedGuideWindow = reserveGuiaRecolhimentoOficialWindow(`Guia ${guide.code}`);
    if (!reservedGuideWindow) {
      setGuideActionStatus("O navegador bloqueou a guia. Habilite pop-ups do SIGAPRO e tente novamente.");
      return;
    }
    const actionKey=`${process.id}:${guide.code}`;
    setBusyGuideAction({key:actionKey,action:"guide"});
    setStatusGuideKey(actionKey);
    setGuideActionStatus("");

    try {
      const isolatedQa = import.meta.env.VITE_SIGAPRO_NEON_ISOLATED === "true";
      // Stored PDF first, BEFORE requesting a new bank order or reading current
      // editable branding. Reopening is read-only even when already paid.
      let officialOriginal: GuideOriginal | null = null;
      if (!isolatedQa) {
        officialOriginal = await readGuideOriginal(effectiveScopeId, guide.code);
        if (
          officialOriginal.municipality_id !== effectiveScopeId ||
          officialOriginal.process_id !== process.id ||
          officialOriginal.guide_number !== guide.code
        ) throw new Error("Guia oficial não corresponde ao processo e à Prefeitura selecionados.");
        if (await openStoredGuide(officialOriginal, reservedGuideWindow)) return;
        // External users may read an exact historical PDF linked to this process.
        // This fallback never overrides an existing SHA-256 original in Neon.
        if (await openLegacyGuideOriginal(process.documents, officialOriginal.guide_number, reservedGuideWindow)) return;
        if (isGuideSettled(officialOriginal)) {
          throw new Error("Guia paga sem PDF original arquivado. Não será reemitida.");
        }
        if (officialOriginal.collection_mode_snapshot === "municipal_system") {
          throw new Error("Guia emitida pelo sistema próprio da Prefeitura: importe o documento original para visualização.");
        }
      } else {
        // QA uses ONLY its isolated Neon Function/S3 and canonical guide data.
        // A plain QA preview may still be shown when a guide has not been
        // issued, but no sandbox payment can be archived without a Neon row.
        // Never disguise a failed Neon read as an unissued/non-payable preview.
        // A missing or inaccessible canonical guide is a genuine blocking error.
        officialOriginal = await readGuideOriginal(effectiveScopeId, guide.code);
        if (
          officialOriginal.municipality_id !== effectiveScopeId ||
          officialOriginal.process_id !== process.id ||
          officialOriginal.guide_number !== guide.code
        ) throw new Error("Guia QA não corresponde ao processo e à Prefeitura selecionados.");
        if (await openStoredGuide(officialOriginal, reservedGuideWindow)) return;
        if (isGuideSettled(officialOriginal)) {
          throw new Error("Guia de teste compensada sem original; a guia não será reconstruída.");
        }
        if (officialOriginal.collection_mode_snapshot === "municipal_system") {
          throw new Error("Guia do sistema próprio da Prefeitura: não emitir cobrança de homologação.");
        }
        // The original may already be financially frozen while the PDF upload
        // or tab navigation failed. Resume from the SAME immutable snapshot:
        // never bind PIX again, never call a provider, never change the DAM.
        if (officialOriginal.document_snapshot) {
          if (!canResumeQaFrozenGuide(officialOriginal)) {
            throw new Error("Snapshot de teste sem vínculo financeiro íntegro; PDF original não será reconstruído.");
          }
          await archiveAndOpenGuide(effectiveScopeId, officialOriginal.document_snapshot, reservedGuideWindow);
          return;
        }
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
      const tested = qaCharges[guide.code];
      const savedSandbox = Boolean(
        isolatedQa && officialOriginal?.provider_environment === "test" &&
        officialOriginal?.bank_reference && officialOriginal?.payment_provider === "mercado_pago" &&
        normalizeOfficialBanking(officialOriginal?.barcode, officialOriginal?.digitable_line).barcode &&
        normalizeOfficialBanking(officialOriginal?.barcode, officialOriginal?.digitable_line).digitableLine,
      );
      // A stale tab or an out-of-order callback cannot replace the confirmed
      // order held by Neon, including after F5 or from a different browser.
      const sandboxIssued = Boolean(
        savedSandbox && officialOriginal &&
        !isGuideSettled(officialOriginal),
      );
      const newlyIssued = Boolean(
        sandboxIssued && tested?.ok &&
        tested.environment === "test" &&
        tested.orderId === officialOriginal?.bank_reference,
      );
      const canonicalPriorBanking = normalizeOfficialBanking(
        officialOriginal?.barcode, officialOriginal?.digitable_line,
      );
      // Never assume Mercado Pago is the provider of another municipality.
      // Read the active collection/provider configuration from the authorized
      // municipal API, and honor the guide's original frozen payment route.
      let selectedProvider: BankConnection | null = null;
      if (!isolatedQa && !(
        canonicalPriorBanking.barcode && canonicalPriorBanking.digitableLine
      )) {
        const [active,connection] = await Promise.all([
          municipalCollectionApiRequest<{mode?:string;status?:string}>(
            "collection-configuration", effectiveScopeId, "effective",
          ),
          municipalCollectionApiRequest<BankConnection>(
            "payment-connection", effectiveScopeId, "get",
          ),
        ]);
        selectedProvider = connection;
        const route = resolveMunicipalChargeRoute(officialOriginal!,connection,active);
        if (route !== "mercado_pago") throw new Error(municipalChargeRouteMessage(route));
      }
      const charge = isolatedQa ? (newlyIssued ? tested : null) :
        (canonicalPriorBanking.barcode && canonicalPriorBanking.digitableLine)
          ? null
          : await ensureMercadoPagoGuideCharge({
              municipalityId: effectiveScopeId,
              guideCode: guide.code,
              amount: guide.amount,
              dueDate: guide.dueDate,
              description: `${guide.label} · ${process.preProtocol || process.title}`,
            });
      // A provider reply alone is not proof that the bill persisted in Neon.
      // Re-read the same canonical guide after a new bank order and use only
      // its saved barcode, dates, amount and reference to build the original.
      let confirmedOriginal = !isolatedQa && charge
        ? await readGuideOriginal(effectiveScopeId, guide.code)
        : officialOriginal;
      const confirmedBanking = normalizeOfficialBanking(
        confirmedOriginal?.barcode, confirmedOriginal?.digitable_line,
      );
      const barcode = isolatedQa
        ? (sandboxIssued ? confirmedBanking.barcode : "")
        : confirmedBanking.barcode;
      const digitableLine = isolatedQa
        ? (sandboxIssued ? confirmedBanking.digitableLine : "")
        : confirmedBanking.digitableLine;
      if (!isolatedQa && (!barcode || !digitableLine)) {
        throw new Error("A cobrança ainda não retornou código de barras e linha digitável válidos.");
      }

      // Read the independent PIX sandbox order without creating a charge on document open.
      let sandboxPix: QaPixCharge | undefined = qaPixCharges[guide.code];
      if (isolatedQa && !sandboxPix?.ok) {
        try {
          const result=await requestQaPixCharge({municipalityId:effectiveScopeId,guideCode:guide.code,action:"get"});
          if (result.ok) sandboxPix=result;
        } catch { /* The boleto PDF must stay available when PIX is unavailable. */ }
      }
      // A provider-signed, tenant-scoped sandbox PIX order exists independently
      // from the boleto. Show its REAL TEST QR in the read-only QA document
      // without claiming that a boleto was issued or changing the DAM settlement.
      const sandboxPixIssued = Boolean(
        isolatedQa && sandboxPix?.ok && sandboxPix.environment==="test" &&
        sandboxPix.orderId && isValidPixPayload(sandboxPix.qrCode)
      );
      const previewOnly = isolatedQa && !sandboxIssued && !sandboxPixIssued;
      // The signed serverless response is already durable in the QA payment ledger,
      // but an external document may be archived ONLY after the database itself
      // binds that exact order and PIX payload to this guide. This RPC exists
      // exclusively on the isolated Neon QA branch; it never settles a guide.
      if (sandboxPixIssued && !sandboxIssued) {
        const { data: bound, error: bindingError } = await backendClient.rpc(
          "qa_mp_pix_bind_to_guide_v1", {
            _municipality_id: effectiveScopeId,
            _guide_code: guide.code,
            _order_id: sandboxPix!.orderId,
          },
        );
        if (bindingError || !bound?.id) {
          throw new Error(bindingError?.message || "Neon QA não confirmou o vínculo do PIX de teste à guia.");
        }
        confirmedOriginal = await readGuideOriginal(effectiveScopeId, guide.code);
        if (
          confirmedOriginal.municipality_id !== effectiveScopeId ||
          confirmedOriginal.process_id !== process.id ||
          confirmedOriginal.guide_number !== guide.code ||
          confirmedOriginal.provider_environment !== "test" ||
          confirmedOriginal.payment_provider !== "mercado_pago" ||
          confirmedOriginal.bank_reference !== sandboxPix!.orderId ||
          confirmedOriginal.pix_code !== sandboxPix!.qrCode ||
          isGuideSettled(confirmedOriginal)
        ) throw new Error("PIX de teste divergente da guia canônica no Neon. Arquivamento interrompido.");
      }
      // Use the same municipality-specific official logo sources as the
      // internal guide. Legacy tenantSettings.logoUrl alone is often empty.
      const stableMunicipalLogoUrl = getMunicipalityLogoOpenUrl(
        municipalityBranding?.headerLogoObjectKey ||
        municipalityBranding?.logoObjectKey ||
        "",
      );
      const logoUrl = await prepareGuideInstitutionalLogo(
        stableMunicipalLogoUrl,
        headerBranding.logoUrl,
        headerBranding.fallbackLogoUrl,
        tenantSettings?.headerLogoUrl,
        tenantSettings?.brasaoUrl,
        tenantSettings?.logoUrl,
        getRenderedMunicipalityLogoDataUrl(),
      );

      const issuedAt = confirmedOriginal?.created_at || guide.issuedAt || new Date().toISOString();
      const originalAmount = confirmedOriginal ? Number(confirmedOriginal.amount) : guide.amount;
      const originalDueDate = confirmedOriginal?.due_date || guide.dueDate;
      // Any municipal PIX complement must use the already saved original
      // amount and code, never an out-of-date list entry after a refresh.
      const originalPixPayload = !isolatedQa
        ? buildGuidePixPayload({
            settings: tenantSettings,
            guide: {
              code: confirmedOriginal?.guide_number || guide.code,
              amount: originalAmount,
              pixPayload: confirmedOriginal?.pix_code || "",
            },
            municipalityName: municipality?.name,
            municipalityCity: municipality?.city,
          })
        : sandboxPixIssued ? String(confirmedOriginal?.pix_code || "") : "";
      const year = new Date(issuedAt).getFullYear() || new Date().getFullYear();

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
          numeroGuia: guide.code,
          nonPayablePreview: previewOnly,
          exercicio: year,
          dataDocumento: issuedAt,
          vencimento: originalDueDate,
          observacao: getGuideObservation(guide.kind),
          proprietario: guide.ownerName || process.ownerName,
          profissionalResponsavel:
            guide.professionalName || process.technicalLead,
          // Absence of a boleto must be a JSON null/missing field, never an
          // empty string: freeze_payment_guide_document_v1 compares it with
          // the unmodified canonical Neon NULL on PIX-only test guides.
          codigoBarras: isolatedQa && sandboxPixIssued && !sandboxIssued ? undefined : barcode,
          linhaDigitavel: isolatedQa && sandboxPixIssued && !sandboxIssued ? undefined : digitableLine,
          pixPayload: originalPixPayload,
          qaSandboxPixPayload: sandboxPixIssued ? originalPixPayload : "",
          bankName: isolatedQa
            ? (sandboxIssued ? (charge?.financialInstitution || "Mercado Pago — boleto de TESTE")
              : sandboxPixIssued ? "Mercado Pago — PIX de TESTE" : "Mercado Pago (conexão de teste)")
            : charge?.financialInstitution || banking.bankName || "Banco arrecadador não informado",
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
              : sandboxPixIssued
                ? "PIX GERADO PELO MERCADO PAGO EM AMBIENTE DE TESTE — NÃO PAGAR. Boleto não emitido. Esta via não comprova arrecadação ou compensação municipal."
                : "HOMOLOGAÇÃO SIGAPRO — DOCUMENTO NÃO PAGÁVEL. Nenhuma cobrança foi registrada no banco.")
            : banking.bankInstructions,
          bankReference: previewOnly ? undefined : (sandboxPixIssued && !sandboxIssued ? sandboxPix?.orderId : (confirmedOriginal?.bank_reference || charge?.orderId || guide.bankReference)),
          bankPaymentId: previewOnly ? undefined : (sandboxPixIssued && !sandboxIssued ? sandboxPix?.paymentId : (confirmedOriginal?.bank_payment_id || charge?.paymentId || guide.bankPaymentId)),
          bankStatus: previewOnly ? undefined : (sandboxPixIssued && !sandboxIssued ? (sandboxPix?.statusStale ? "status_aguardando_consulta" : sandboxPix?.status) : (confirmedOriginal?.bank_status || charge?.status || guide.bankStatus)),
          bankStatusDetail: previewOnly ? undefined : (sandboxPixIssued && !sandboxIssued ? "pix_sandbox" : (confirmedOriginal?.bank_status_detail || charge?.statusDetail || guide.bankStatusDetail)),
          bankAuthenticatedAt: previewOnly ? undefined : (confirmedOriginal?.bank_authenticated_at || charge?.authenticatedAt || guide.bankAuthenticatedAt),
          bankEnvironment: isolatedQa ? "test" : (confirmedOriginal?.provider_environment || charge?.environment || guide.providerEnvironment),
          paymentProvider:
            confirmedOriginal?.payment_provider ||
            selectedProvider?.provider ||
            (isolatedQa ? "mercado_pago" : (charge?.ok ? "mercado_pago" : tenantSettings?.paymentProvider || "manual")),
          valorDocumento: originalAmount,
          descontos: 0,
          outrosAcrescimos: 0,
          valorCobrado: originalAmount,
          referencia: getGuideReference(guide.kind),
        },
        itens: [
          {
            ano: year,
            divida: guide.label,
            tabela: tenantSettings?.guiaPrefixo || "DAM",
            principal: originalAmount,
            multa: 0,
            juros: 0,
            correcao: 0,
            total: originalAmount,
          },
        ],
      };

      // Official external guides must follow the same immutable Neon + R2
      // document archival path as internal guides. The old HTML-only path
      // rebuilt the paper every time the professional clicked "visualizar".
      // An already archived (including paid) original is reopened byte-for-byte.
      // A bank order CONFIRMED in the isolated Neon QA database is archived
      // to isolated Neon S3 (never to the production R2). Reopening is the
      // original SHA PDF, just like the municipal production workflow.
      // Unissued QA previews remain non-payable and are NEVER persisted.
      if (!isolatedQa || sandboxIssued || sandboxPixIssued) {
        if (isolatedQa && (
          !confirmedOriginal?.id ||
          confirmedOriginal.provider_environment !== "test" ||
          !confirmedOriginal.bank_reference ||
          (sandboxIssued
            ? (!barcode || !digitableLine)
            : (!isValidPixPayload(confirmedOriginal.pix_code) ||
               confirmedOriginal.pix_code !== originalPixPayload)) ||
          guideDocument.guia.nonPayablePreview
        )) throw new Error("Cobrança de teste sem vínculo financeiro canônico; PDF não arquivado.");
        await archiveAndOpenGuide(effectiveScopeId, guideDocument, reservedGuideWindow);
        return;
      }

      const opened = openGuiaRecolhimentoOficialWindow(guideDocument, {
        title: isolatedQa ? (sandboxIssued ? `BOLETO DE TESTE — NÃO PAGAR · ${guide.code}` : sandboxPixIssued ? `PIX DE TESTE — NÃO PAGAR · ${guide.code}` : `PRÉVIA NÃO PAGÁVEL · ${guide.code}`) : `Guia ${guide.code}`,
        autoPrint: false,
      }, reservedGuideWindow);

      if (!opened) {
        throw new Error(
          "O navegador bloqueou a abertura da guia. Permita a nova guia do SIGAPRO e tente novamente.",
        );
      }
    } catch (error) {
      // Do not strand a blank/preview tab when provider or logo preparation fails.
      if (!reservedGuideWindow.closed) reservedGuideWindow.close();
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
    let disposed = false;
    let inFlight = false;
    let reportedSyncFailure = false;
    const refresh = () => {
      if (disposed || inFlight || document.visibilityState !== "visible") return;
      // Only one read at a time: slow responses must not overlap a new
      // focus/visibility poll or make an already issued guide appear missing.
      inFlight = true;
      void Promise.resolve()
        .then(() => refreshRemoteStore())
        .then(() => { reportedSyncFailure = false; })
        .catch((error: unknown) => {
          if (!disposed && !reportedSyncFailure) {
            console.warn("[SIGAPRO][Financeiro externo] Atualização temporariamente indisponível:", error);
            reportedSyncFailure = true;
          }
        })
        .finally(() => { inFlight = false; });
    };

    const timer = window.setInterval(refresh, 8000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      disposed = true;
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

  const pendingCount = guides.filter((item) => item.status === "pendente").length;
  const overdueCount = guides.filter((item) => item.status === "vencida").length;
  const paidCount = guides.filter((item) => item.status === "compensada").length;
  const totalValue = guides.reduce((sum, item) => sum + item.guide.amount, 0);

  return (
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
            {localQaBankIssuer
              ? 'HOMOLOGAÇÃO SIGAPRO — Emita exclusivamente boleto/PIX do Mercado Pago em TESTE e visualize a guia. NÃO PAGAR.'
              : 'HOMOLOGAÇÃO SIGAPRO — Esta prévia remota permite somente a visualização NÃO PAGÁVEL. A emissão bancária de teste requer o servidor local isolado e não está disponível neste endereço.'}
            {" "}Nenhum PIX estático da Prefeitura é usado. R2 oficial, cobranças reais e baixas automáticas permanecem desativados.
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
          <MetricCard title="Compensadas" value={String(paidCount)} helper="Pagamentos confirmados" icon={CreditCard} tone="emerald" />
          <MetricCard title="Total emitido" value={formatCurrency(totalValue)} helper="Guias vinculadas" icon={CreditCard} tone="blue" />
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
                    ? (status === "compensada"
                        ? "/externo/controle"
                        : `${isHabiteSe ? "/externo/habite-se" : "/externo/protocolar"}?preprotocolo=${encodeURIComponent(
                            process.preProtocol || process.protocol,
                          )}`)
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
                    <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-[minmax(0,1.18fr)_minmax(0,1.1fr)_minmax(0,1.05fr)_minmax(0,0.9fr)_minmax(0,0.75fr)] 2xl:items-start">
                      <div className="min-w-0">
                        <p className="break-words text-[15px] font-semibold text-slate-950">
                          {process.isOfficial === false
                            ? (status === "compensada" ? "Pagamento confirmado · em oficialização" : "Rascunho com guia emitida")
                            : formatOfficialProcessNumber(process.protocol)}
                        </p>
                        <p className="mt-1 break-words text-[13px] text-slate-500">
                          {process.isOfficial === false
                            ? (status === "compensada" ? `Pagamento confirmado · acompanhe a oficialização do pré-protocolo ${process.preProtocol || process.protocol}` : `Referência temporária: ${process.preProtocol || process.protocol} · sem número oficial até o pagamento`)
                            : formatOfficialProcessTitle({ title: process.title, type: process.type })}
                        </p>
                      </div>
                      <div className="min-w-0">
                        <p className="break-words text-[14px] font-semibold text-slate-900">{formatOfficialProcessTitle({ title: process.title, type: process.type })}</p>
                        <p className="mt-1 break-words text-[13px] text-slate-500">{process.type}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-slate-900">
                          {getPaymentGuideDisplayReference(process, guide)}
                        </p>
                        {guide.officialProcessReference &&
                        guide.officialProcessReference !== guide.code ? (
                          <p className="mt-1 break-words text-[11px] font-medium text-slate-400" title={guide.code}>
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
                            status === "compensada"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                              : status === "vencida"
                                ? "border-rose-200 bg-rose-50 text-rose-600"
                                : "border-amber-200 bg-amber-50 text-amber-600"
                          }`}
                        >
                          {status === "compensada" ? "Compensada" : status === "vencida" ? "Vencida" : "Pendente"}
                        </Badge>
                      </div>
                      <div
                        className="col-span-full flex flex-wrap items-center justify-start gap-2 border-t border-slate-200/80 pt-3 2xl:justify-end"
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        {process.isOfficial === false ? (
                          <>
                            {status === "compensada" ? (
                              <Button asChild variant="outline" className="rounded-full text-[12px] font-semibold">
                                <Link to="/externo/controle">Acompanhar oficialização</Link>
                              </Button>
                            ) : (
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
                            )}
                            {localQaBankIssuer && !isGuideSettled(guide) ? (
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
                            {qaPixIssuer && !isGuideSettled(guide) ? (
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
                            {qaPixIssuer && guide.code.startsWith("DAM-PRE-QA-") && !isGuideSettled(guide) ? (
                              <Button
                                type="button"
                                variant="outline"
                                data-qa-reconcile-existing-pix="true"
                                className="rounded-full border-emerald-300 bg-emerald-50 px-4 text-[12px] font-semibold text-emerald-950 hover:bg-emerald-100"
                                disabled={Boolean(busyGuideAction)}
                                onClick={() => void refreshSandboxPixStatus(process,guide)}
                              >
                                {busyGuideAction?.key === `${process.id}:${guide.code}` &&
                                 busyGuideAction.action === "reconcile"
                                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                  : <CreditCard className="mr-1.5 h-3.5 w-3.5" />}
                                Conferir baixa bancária (QA)
                              </Button>
                            ) : null}
                            {isolatedQaMode && guide.code.startsWith("DAM-PRE-QA-") ? (
                              <Button
                                type="button"
                                variant="outline"
                                data-qa-a4-layout-preview="true"
                                className="rounded-full border-slate-300 bg-white px-4 text-[12px] font-semibold text-slate-800 hover:bg-slate-100"
                                disabled={Boolean(busyGuideAction)}
                                onClick={() => void previewQaA4Layout(process,guide)}
                              >
                                {busyGuideAction?.key === `${process.id}:${guide.code}` &&
                                 busyGuideAction.action === "preview"
                                  ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                  : <Eye className="mr-1.5 h-3.5 w-3.5" />}
                                Conferir layout A4 (QA)
                              </Button>
                            ) : null}
                          </>
                        ) : (
                          <Button asChild variant="outline" className="rounded-full text-[13px]">
                            <Link to={processTarget}>Ver processo</Link>
                          </Button>
                        )}
                        {statusGuideKey === `${process.id}:${guide.code}` && guideActionStatus ? (
                          <div role="status" aria-live="polite"
                            data-qa-guide-feedback="true"
                            className="w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium leading-5 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100">
                            {guideActionStatus}
                          </div>
                        ) : null}
                      </div>
                      {isolatedQaMode && qaPixCharges[guide.code]?.ok &&
                       isValidPixPayload(qaPixCharges[guide.code]?.qrCode) ? (
                        <section data-qa-pix-preview="true"
                          onClick={(event)=>event.stopPropagation()}
                          onKeyDown={(event)=>event.stopPropagation()}
                          className="2xl:col-span-6 w-full rounded-xl border border-sky-200 bg-white p-4 text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white">
                          <div className="flex flex-col gap-5 sm:flex-row">
                            <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-3 text-center">
                              <p className="mb-2 text-xs font-extrabold text-amber-800">PIX DE HOMOLOGAÇÃO — NÃO PAGAR</p>
                              <QRCodeSVG value={qaPixCharges[guide.code].qrCode!} size={172} level="M" />
                            </div>
                            <div className="min-w-0 flex-1 space-y-2">
                              <p className="text-sm font-bold">Ordem Mercado Pago · ambiente de TESTE</p>
                              <p className="text-sm">Status no provedor: <strong>{
                                qaPixCharges[guide.code].statusStale?"consulta temporariamente indisponível":
                                qaPixCharges[guide.code].status==="processed"?"processado no sandbox":
                                qaPixCharges[guide.code].status==="action_required"?"aguardando transferência simulada":
                                qaPixCharges[guide.code].status||"pendente"
                              }</strong></p>
                              <p className="text-xs text-slate-600 dark:text-slate-300">Status de teste não confirma arrecadação nem baixa municipal.</p>
                              <p className="rounded-lg bg-slate-50 p-3 font-mono text-[11px] leading-relaxed break-all text-slate-800 dark:bg-slate-900 dark:text-slate-100">
                                {qaPixCharges[guide.code].qrCode}
                              </p>
                              <Button type="button" variant="outline" size="sm" data-qa-pix-refresh="true"
                                disabled={Boolean(busyGuideAction)}
                                onClick={()=>void refreshSandboxPixStatus(process,guide)}>
                                Consultar status do PIX de TESTE (sem nova cobrança)
                              </Button>
                            </div>
                          </div>
                        </section>
                      ) : null}
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
  );
}
