import { FormEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRightLeft, Building2, CheckCircle2, Clock3, Download, Eye, FileBadge2, FileCheck2, FileKey2, FileStack, Landmark, LogOut, Maximize2, MessageSquareMore, PencilLine, Printer, ReceiptText, Route, ShieldAlert, Signature, UserRound, Wallet, Workflow, ZoomIn, ZoomOut } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  type GuiaRecolhimentoOficialProps,
  openGuiaRecolhimentoOficialWindow,
  reserveGuiaRecolhimentoOficialWindow,
} from "@/components/GuiaRecolhimentoOficial";
import { FileDropZone, type UploadedFileItem } from "@/components/platform/FileDropZone";
import { PageHero } from "@/components/platform/PageHero";
import { PageShell, PageStatsRow } from "@/components/platform/PageShell";
import { PixQrCode } from "@/components/platform/PixQrCode";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { StatCard } from "@/components/platform/StatCard";
import { UserAvatar } from "@/components/platform/UserAvatar";
import { ProcessIdentityPanel } from "@/components/platform/ProcessIdentityPanel";
import { AnalysisReadinessPanel } from "@/components/platform/AnalysisReadinessPanel";
import { AnalysisSupervisorControl } from "@/components/platform/AnalysisSupervisorControl";
import { ConstructionPermitPanel } from "@/components/platform/ConstructionPermitPanel";
import { OccupancyPermitProcessPanel } from "@/components/platform/OccupancyPermitProcessPanel";
import { MarkerSelector } from "@/components/platform/MarkerSelector";
import { MunicipalOrganogramBar } from "@/components/platform/MunicipalOrganogramBar";
import { UrbanAnalysisChecklistPanel } from "@/components/platform/UrbanAnalysisChecklistPanel";
import { usePlatformData } from "@/hooks/usePlatformData";
import { useLivePlatformRefresh } from "@/hooks/useLivePlatformRefresh";
import {
  getRenderedMunicipalityLogoDataUrl,
  prepareGuideInstitutionalLogo,
} from "@/lib/guideAssets";
import { cacheDocumentWorkspaceAccessUrl } from "@/lib/documentWorkspaceAccess";
import {
  ensureMercadoPagoGuideCharge,
  type MercadoPagoGuideCharge,
} from "@/lib/mercadoPagoGuide";
import { buildGuidePixPayload, resolveGuideBankingData } from "@/lib/paymentCollection";
import { useMunicipality } from "@/hooks/useMunicipality";
import { useInstitutionBranding } from "@/hooks/useInstitutionBranding";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { usePlanEntitlements } from "@/hooks/usePlanEntitlements";
import { useDocumentMarkerAssignments } from "@/hooks/useDocumentMarkerAssignments";
import { useConstructionPermit } from "@/hooks/useConstructionPermit";
import { backendClient } from "@/integrations/backend/databaseClient";
import { useMunicipalOrganogram } from "@/hooks/useMunicipalOrganogram";
import {
  getMunicipalityLogoOpenUrl,
  getSignedUrlForObjectStrict,
  listRecoverableProcessFiles,
  type RecoverableProcessFile,
} from "@/integrations/r2/client";
import { uploadFileToStorage } from "@/integrations/r2/storage";
import {
  buildProcessPath,
  buildProcessRouteKey,
  calculateApprovalGuideBreakdown,
  calculateHabiteSeGuideBreakdown,
  calculateIssGuideAmount,
  canAccessMunicipalArea,
  canAnalyzeProcessDocument,
  canEditAssignedAnalysisArtifact,
  canTrackProcess,
  isProcessOwnedBySessionDepartment,
  formatCurrency,
  formatOfficialProcessLabel,
  formatOfficialProcessNumber,
  formatOfficialProcessTitle,
  formatProfessionalProcessType,
  getGuideObservation,
  getGuideReference,
  getPaymentGuideDisplayReference,
  getProcessPaymentGuides,
  resolveProcessRoute,
  getExternallyVisibleProcessPaymentGuides,
  isProcessPaymentGuideSharedExternally,
  isOccupancyPermitProcessType,
  isInternalRole,
  processBelongsToExternalProfessional,
  matchesOperationalScope,
  statusLabel,
  statusTone,
  type PaymentGuideKind,
  type ProcessRecord,
  type ProcessTransitVisibility,
  URBAN_ANALYSIS_DEPARTMENT,
  workTypeCatalog,
} from "@/lib/platform";

function officialMunicipalityLabel(value: string | null | undefined) {
  const label = String(value || "").trim().replace(/^Prefeitura(?:\s+Municipal)?\s+(?:de|do|da)?\s*/i, "");
  return label ? "Prefeitura de " + label : "Prefeitura municipal";
}

function currentLocalDateValue(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "tamanho não informado";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


function normalizeMunicipalFeeLabel(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function constructionStandardDisplayLabel(value: string | null | undefined) {
  const normalized = normalizeMunicipalFeeLabel(value);
  if (normalized === "luxo") return "Luxo";
  if (normalized === "primeira") return "Primeira";
  if (normalized === "medio") return "Médio";
  if (normalized === "economico") return "Econômico";
  return String(value || "Não informado");
}

function inferMimeType(fileName: string) {
  const normalized = fileName.toLowerCase();
  if (normalized.endsWith(".pdf")) return "application/pdf";
  if (normalized.endsWith(".png")) return "image/png";
  if (normalized.endsWith(".webp")) return "image/webp";
  if (normalized.endsWith(".gif")) return "image/gif";
  if (normalized.endsWith(".jpeg") || normalized.endsWith(".jpg")) return "image/jpeg";
  return "application/octet-stream";
}

function buildDocumentPreview(documentLabel: string, fileName: string | undefined, tenantName: string | undefined) {
  const html = `
    <html>
      <head>
        <title>${fileName || documentLabel}</title>
        <style>
          body { margin: 0; padding: 24px; font-family: Arial, sans-serif; background: #f5f7fb; color: #10243c; }
          .sheet { max-width: 760px; margin: 0 auto; background: white; border: 1px solid #d8e4f1; border-radius: 18px; padding: 24px; }
          .brand { font-size: 11px; text-transform: uppercase; letter-spacing: .24em; color: #5b7490; }
          .title { margin-top: 12px; font-size: 28px; font-weight: 700; color: #123860; }
          .meta { margin-top: 18px; border: 1px solid #d8e4f1; border-radius: 14px; padding: 18px; background: #fbfdff; }
        </style>
      </head>
      <body>
        <div class="sheet">
          <div class="brand">SIGAPRO - PREVIEW DOCUMENTAL</div>
          <div class="title">${documentLabel}</div>
          <div class="meta">
            <p><strong>Arquivo:</strong> ${fileName || "Não informado"}</p>
            <p><strong>Prefeitura:</strong> ${tenantName || "Nao vinculada"}</p>
            <p><strong>Visualização:</strong> Documento demonstrativo para conferência no software.</p>
          </div>
        </div>
      </body>
    </html>
  `;

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

type DirectProcessState = {
  id: string;
  status: ProcessRecord["status"];
  currentDepartment: string;
  currentQueue: string;
  slaStage: string;
  checkpoint: string;
  archivedAt: string | null;
  updatedAt: string | null;
};

type CachedProcessTabAccess = {
  sessionId: string;
  processId: string;
  analysis: boolean;
  finance: boolean;
};

function processTabAccessCacheKey(sessionId: string, processId: string) {
  return `sigapro.process-tab-access.v1:${sessionId}:${processId}`;
}

function readCachedProcessTabAccess(sessionId: string, processId: string): CachedProcessTabAccess | null {
  if (typeof window === "undefined" || !sessionId || sessionId === "unknown" || !processId) return null;
  try {
    const raw = window.sessionStorage.getItem(processTabAccessCacheKey(sessionId, processId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedProcessTabAccess>;
    if (parsed.sessionId !== sessionId || parsed.processId !== processId) return null;
    return {
      sessionId,
      processId,
      analysis: parsed.analysis === true,
      finance: parsed.finance === true,
    };
  } catch {
    return null;
  }
}

function writeCachedProcessTabAccess(value: CachedProcessTabAccess) {
  if (typeof window === "undefined" || !value.sessionId || value.sessionId === "unknown" || !value.processId) return;
  try {
    window.sessionStorage.setItem(
      processTabAccessCacheKey(value.sessionId, value.processId),
      JSON.stringify(value),
    );
  } catch {
    // Cache apenas visual; nunca interfere no banco oficial.
  }
}

const PROCESS_VISUAL_CACHE_PREFIX = "sigapro.process-view.v1:";

type CachedProcessVisual = {
  sessionId: string;
  routeKey: string;
  cachedAt: number;
  process: ProcessRecord;
};

function processVisualCacheKey(sessionId: string, routeKey: string) {
  return `${PROCESS_VISUAL_CACHE_PREFIX}${sessionId}:${routeKey}`;
}

function readCachedProcessVisual(sessionId: string, routeKey?: string): ProcessRecord | undefined {
  if (
    typeof window === "undefined" ||
    !sessionId ||
    sessionId === "unknown" ||
    !routeKey
  ) {
    return undefined;
  }

  try {
    const raw = window.sessionStorage.getItem(processVisualCacheKey(sessionId, routeKey));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<CachedProcessVisual>;
    if (
      parsed.sessionId !== sessionId ||
      parsed.routeKey !== routeKey ||
      typeof parsed.cachedAt !== "number" ||
      Date.now() - parsed.cachedAt > 1000 * 60 * 5 ||
      !parsed.process?.id
    ) {
      window.sessionStorage.removeItem(processVisualCacheKey(sessionId, routeKey));
      return undefined;
    }
    return parsed.process as ProcessRecord;
  } catch {
    return undefined;
  }
}

function writeCachedProcessVisual(sessionId: string, routeKey: string, process: ProcessRecord) {
  if (
    typeof window === "undefined" ||
    !sessionId ||
    sessionId === "unknown" ||
    !routeKey ||
    !process?.id
  ) {
    return;
  }

  try {
    const payload: CachedProcessVisual = {
      sessionId,
      routeKey,
      cachedAt: Date.now(),
      process,
    };
    window.sessionStorage.setItem(
      processVisualCacheKey(sessionId, routeKey),
      JSON.stringify(payload),
    );
  } catch {
    // Cache estritamente visual e limitado à aba atual.
  }
}

export function ProcessDetailPage() {
  const { processId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const requestedGuideCode = new URLSearchParams(location.search).get("guia")?.trim() || "";
  const { session } = usePlatformSession();
  const planEntitlements = usePlanEntitlements();
  const documentMarkers = useDocumentMarkerAssignments();
  const {
    municipality,
    branding: municipalityBranding,
    scopeId,
    institutionSettingsCompat,
    name: municipalityName,
  } = useMunicipality();
  const {
    processes,
    refreshRemoteStore,
    institutions,
    sessionUsers,
    loading: platformDataLoading,
    dataReadyForCurrentUser,
    sendProcessMessage,
    getInstitutionSettings,
    getUserProfile,
    addDocumentAnnotation,
    createRequirement,
    respondRequirement,
    completeRequirement,
    dispatchProcess,
    setProcessTransitVisibility,
    markGuideAsPaid,
    appendProcessDocuments,
    requestConstructionPaymentGuide,
    updateIssProjectGuideData,
    reviseIssProjectGuide,
    shareIssProjectGuide,
    issuePaymentGuide,
    issueHabiteSePaymentGuide,
    shareHabiteSePaymentGuide,
    beginAnalysisSupervisorIntervention,
    endAnalysisSupervisorIntervention,
    reassignProcessAnalysis,
    updateProcessStatus,
    reopenProcess,
  } = usePlatformData();
  const refreshCurrentProcessStore = useCallback(
    () => refreshRemoteStore(processId ?? null),
    [processId, refreshRemoteStore],
  );
  useLivePlatformRefresh(refreshCurrentProcessStore, { intervalMs: 1800 });

  const liveProcess = resolveProcessRoute(processes, processId);
  const [cachedProcessVisual, setCachedProcessVisual] = useState<ProcessRecord | undefined>(() =>
    readCachedProcessVisual(session.id, processId),
  );
  const [directProcessState, setDirectProcessState] = useState<DirectProcessState | null>(null);
  const baseProcess = liveProcess ?? cachedProcessVisual;
  const process = useMemo(() => {
    if (!baseProcess || !directProcessState || directProcessState.id !== baseProcess.id) {
      return baseProcess;
    }

    return {
      ...baseProcess,
      status: directProcessState.status,
      sla: {
        ...baseProcess.sla,
        currentStage: directProcessState.slaStage || baseProcess.sla.currentStage,
      },
      processControl: {
        ...baseProcess.processControl,
        currentFolder:
          directProcessState.currentDepartment ||
          directProcessState.currentQueue ||
          baseProcess.processControl?.currentFolder ||
          "",
        checkpoint:
          directProcessState.checkpoint ||
          baseProcess.processControl?.checkpoint,
      },
    };
  }, [baseProcess, directProcessState]);

  useEffect(() => {
    if (!processId || !session.id || session.id === "unknown") return;

    if (liveProcess) {
      const liveScopeId =
        liveProcess.municipalityId ??
        liveProcess.tenantId ??
        session.municipalityId ??
        session.tenantId ??
        null;

      if (canTrackProcess(session, liveProcess, liveScopeId)) {
        writeCachedProcessVisual(session.id, processId, liveProcess);
        setCachedProcessVisual(liveProcess);
      } else {
        try {
          window.sessionStorage.removeItem(processVisualCacheKey(session.id, processId));
        } catch {
          // noop
        }
        setCachedProcessVisual(undefined);
      }
      return;
    }

    const cached = readCachedProcessVisual(session.id, processId);
    if (cached?.id !== cachedProcessVisual?.id) {
      setCachedProcessVisual(cached);
    }
  }, [cachedProcessVisual?.id, liveProcess, processId, session.id]);

  useEffect(() => {
    if (!processId || !session.id || session.id === "unknown" || typeof window === "undefined") {
      return;
    }

    let disposed = false;
    let inFlight = false;

    const syncExactProcess = async () => {
      if (
        disposed ||
        inFlight ||
        (typeof document !== "undefined" && document.visibilityState !== "visible")
      ) {
        return;
      }

      inFlight = true;
      try {
        let routeKey = processId.trim();
        try {
          routeKey = decodeURIComponent(routeKey);
        } catch {
          // Mantém a rota original quando não estiver codificada.
        }

        const resolvedProcessId =
          baseProcess?.id ||
          (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(routeKey)
            ? routeKey
            : "");

        let query = backendClient
          .from("processes")
          .select(
            "id,status,current_department,current_queue,sla_stage,process_checkpoint,archived_at,updated_at",
          );

        query = resolvedProcessId
          ? query.eq("id", resolvedProcessId)
          : query.eq("protocol_number", routeKey);

        const { data, error } = await query.limit(1);

        if (error || disposed) return;
        const row = Array.isArray(data) ? data[0] : data;
        if (!row?.id) return;

        const nextState: DirectProcessState = {
          id: String(row.id),
          status: row.status as ProcessRecord["status"],
          currentDepartment: String(row.current_department || ""),
          currentQueue: String(row.current_queue || ""),
          slaStage: String(row.sla_stage || ""),
          checkpoint: String(row.process_checkpoint || ""),
          archivedAt: row.archived_at ? String(row.archived_at) : null,
          updatedAt: row.updated_at ? String(row.updated_at) : null,
        };

        setDirectProcessState((current) => {
          if (
            current &&
            current.id === nextState.id &&
            current.status === nextState.status &&
            current.currentDepartment === nextState.currentDepartment &&
            current.currentQueue === nextState.currentQueue &&
            current.slaStage === nextState.slaStage &&
            current.checkpoint === nextState.checkpoint &&
            current.archivedAt === nextState.archivedAt &&
            current.updatedAt === nextState.updatedAt
          ) {
            return current;
          }
          return nextState;
        });

        setCachedProcessVisual((current) => {
          const source = liveProcess ?? current;
          if (!source || source.id !== nextState.id) return current;

          const patched: ProcessRecord = {
            ...source,
            status: nextState.status,
            sla: {
              ...source.sla,
              currentStage: nextState.slaStage || source.sla.currentStage,
            },
            processControl: {
              ...source.processControl,
              currentFolder:
                nextState.currentDepartment ||
                nextState.currentQueue ||
                source.processControl?.currentFolder ||
                "",
              checkpoint:
                nextState.checkpoint ||
                source.processControl?.checkpoint,
            },
          };

          writeCachedProcessVisual(session.id, processId, patched);
          return patched;
        });
      } finally {
        inFlight = false;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void syncExactProcess();
    };

    void syncExactProcess();
    const timer = window.setInterval(() => void syncExactProcess(), 1500);
    window.addEventListener("focus", syncExactProcess);
    window.addEventListener("pageshow", syncExactProcess);
    window.addEventListener("online", syncExactProcess);
    window.addEventListener("sigapro:data-changed", syncExactProcess as EventListener);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", syncExactProcess);
      window.removeEventListener("pageshow", syncExactProcess);
      window.removeEventListener("online", syncExactProcess);
      window.removeEventListener("sigapro:data-changed", syncExactProcess as EventListener);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [baseProcess?.id, liveProcess, processId, session.id]);

  const effectiveScopeId =
    process?.municipalityId ??
    process?.tenantId ??
    municipality?.id ??
    scopeId ??
    session.tenantId ??
    null;
  const { headerBranding: guideHeaderBranding } = useInstitutionBranding(effectiveScopeId);
  const {
    departments: organizationDepartments,
    status: organizationStatus,
    getPath: getOrganizationPath,
    getPathRecords: getOrganizationPathRecords,
  } = useMunicipalOrganogram(effectiveScopeId);
  const constructionPermit = useConstructionPermit(effectiveScopeId, process?.id);
  const isMasterOperator =
    session.role === "master_admin" ||
    session.role === "master_ops";
  const canProtocolOperate =
    isMasterOperator || canAccessMunicipalArea(session, "protocolos");
  const canAnalysisOperate =
    isMasterOperator || canAccessMunicipalArea(session, "analise");
  const canFinanceOperate =
    isMasterOperator || canAccessMunicipalArea(session, "financeiro");
  const stableTabAccessRef = useRef<CachedProcessTabAccess | null>(
    readCachedProcessTabAccess(session.id, processId ?? ""),
  );

  const currentStableTabAccess =
    stableTabAccessRef.current &&
    stableTabAccessRef.current.sessionId === session.id &&
    stableTabAccessRef.current.processId === (processId ?? "")
      ? stableTabAccessRef.current
      : {
          sessionId: session.id,
          processId: processId ?? "",
          analysis: false,
          finance: false,
        };

  const analysisAccessNow =
    !planEntitlements.isResolving &&
    planEntitlements.canUseModule("Analise tecnica") &&
    canAnalysisOperate;
  const financeAccessNow =
    !planEntitlements.isResolving &&
    planEntitlements.canUseModule("Financeiro") &&
    canFinanceOperate;

  if (
    !stableTabAccessRef.current ||
    stableTabAccessRef.current.sessionId !== currentStableTabAccess.sessionId ||
    stableTabAccessRef.current.processId !== currentStableTabAccess.processId ||
    (analysisAccessNow && !stableTabAccessRef.current.analysis) ||
    (financeAccessNow && !stableTabAccessRef.current.finance)
  ) {
    stableTabAccessRef.current = {
      ...currentStableTabAccess,
      analysis: currentStableTabAccess.analysis || analysisAccessNow,
      finance: currentStableTabAccess.finance || financeAccessNow,
    };
  }

  const stableAnalysisAccess = stableTabAccessRef.current.analysis;
  const stableFinanceAccess = stableTabAccessRef.current.finance;
  useEffect(() => {
    const current = stableTabAccessRef.current;
    if (!current || current.sessionId === "unknown" || !current.processId) return;
    if (!current.analysis && !current.finance) return;
    writeCachedProcessTabAccess(current);
  }, [
    session.id,
    processId,
    stableTabAccessRef.current.analysis,
    stableTabAccessRef.current.finance,
  ]);
  const requestedTabForContinuity = new URLSearchParams(location.search).get("aba");
  const analysisTabVisible =
    stableAnalysisAccess ||
    (
      planEntitlements.isResolving &&
      requestedTabForContinuity === "analise" &&
      canAnalysisOperate
    );
  const financeTabVisible =
    stableFinanceAccess ||
    (
      planEntitlements.isResolving &&
      requestedTabForContinuity === "financeiro" &&
      canFinanceOperate
    );
  const isExternalSession =
    session.role === "profissional_externo" ||
    session.role === "property_owner" ||
    session.role === "proprietario_consulta";

  const prewarmProcessInstitutionId =
    process?.municipalityId ?? process?.tenantId ?? effectiveScopeId ?? null;
  const prewarmTenant = process
    ? institutions.find((item) => item.id === prewarmProcessInstitutionId) ?? null
    : null;
  const prewarmTenantSettings = process
    ? institutionSettingsCompat ?? getInstitutionSettings(prewarmProcessInstitutionId)
    : undefined;
  const prewarmStableGuideLogoUrl = getMunicipalityLogoOpenUrl(
    municipalityBranding?.headerLogoObjectKey ||
      municipalityBranding?.logoObjectKey ||
      "",
  );
  const prewarmGuideLogoUrl =
    prewarmStableGuideLogoUrl ||
    guideHeaderBranding.logoUrl ||
    ("fallbackLogoUrl" in guideHeaderBranding ? guideHeaderBranding.fallbackLogoUrl : "") ||
    prewarmTenantSettings?.logoUrl ||
    prewarmTenantSettings?.brasaoUrl ||
    "";
  const prewarmPaymentGuides = process
    ? getProcessPaymentGuides(process, prewarmTenantSettings)
    : [];
  const prewarmVisibleGuides =
    process && isExternalSession
      ? getExternallyVisibleProcessPaymentGuides(process, prewarmTenantSettings)
      : prewarmPaymentGuides;
  const prewarmGuideSignature = prewarmVisibleGuides
    .map((guide) =>
      [
        guide.kind,
        guide.code,
        guide.amount,
        guide.dueDate,
        guide.barcode || "",
        guide.digitableLine || "",
        guide.bankReference || "",
      ].join(":"),
    )
    .join("|");
  const prewarmSettingsSignature = [
    prewarmGuideLogoUrl,
    prewarmTenantSettings?.paymentProvider || "",
    prewarmTenantSettings?.paymentProviderEnvironment || "",
    prewarmTenantSettings?.bankCode || "",
    prewarmTenantSettings?.bankAgreementCode || "",
    prewarmTenantSettings?.chavePix || "",
    prewarmTenantSettings?.pixMerchantCity || "",
    municipalityName || "",
    prewarmTenant?.name || "",
  ].join("|");
  const [message, setMessage] = useState("");
  const [messageAudience, setMessageAudience] = useState<"interno" | "externo" | "misto">("misto");
  const [messageRecipient, setMessageRecipient] = useState("todos");
  const [requirementTitle, setRequirementTitle] = useState("");
  const [requirementDescription, setRequirementDescription] = useState("");
  const [requirementDueDate, setRequirementDueDate] = useState("");
  const [requirementVisibility, setRequirementVisibility] = useState<"interno" | "externo" | "misto">("misto");
  const [requirementResponse, setRequirementResponse] = useState<Record<string, string>>({});
  const [dispatchTo, setDispatchTo] = useState("");
  const [dispatchSubject, setDispatchSubject] = useState("");
  const [dispatchDueDate, setDispatchDueDate] = useState(() => currentLocalDateValue());
  const [dispatchVisibility, setDispatchVisibility] = useState<"interno" | "externo" | "misto">("interno");
  type ProcessTab = "resumo" | "imovel" | "documentos" | "analise" | "financeiro" | "alvara" | "historico";
  const [activeTab, setActiveTab] = useState<ProcessTab>(() => {
    const requested = new URLSearchParams(location.search).get("aba");
    return requested && ["resumo", "imovel", "documentos", "analise", "financeiro", "alvara", "historico"].includes(requested)
      ? requested as ProcessTab
      : "imovel";
  });
  const openedProcessRef = useRef<string | null>(null);
  const [viewerDocumentId, setViewerDocumentId] = useState<string | null>(null);
  const [viewerZoom, setViewerZoom] = useState(1);
  const [documentAccessUrls, setDocumentAccessUrls] = useState<Record<string, string>>({});
  const [documentAccessErrors, setDocumentAccessErrors] = useState<Record<string, string>>({});
  const [documentUploads, setDocumentUploads] = useState<Record<string, UploadedFileItem[]>>({});
  const [requirementUploads, setRequirementUploads] = useState<Record<string, UploadedFileItem[]>>({});
  const [recoverableFiles, setRecoverableFiles] = useState<RecoverableProcessFile[]>([]);
  const [recoverableSelection, setRecoverableSelection] = useState<Record<string, string>>({});
  const [recoverableStatus, setRecoverableStatus] = useState("");
  const [recoverableLoading, setRecoverableLoading] = useState(false);
  const [openingDocumentId, setOpeningDocumentId] = useState("");
  const [annotationDraft, setAnnotationDraft] = useState("");
  const [annotationPoint, setAnnotationPoint] = useState<{ x: number; y: number } | null>(null);
  const [processActionStatus, setProcessActionStatus] = useState("");
  const [processActionBusy, setProcessActionBusy] = useState("");
  const [supervisorActionStatus, setSupervisorActionStatus] = useState("");
  const [supervisorActionBusy, setSupervisorActionBusy] = useState(false);
  const [guideBillingBusyKey, setGuideBillingBusyKey] = useState("");
  const [preparedGuideCharges, setPreparedGuideCharges] = useState<Record<string, MercadoPagoGuideCharge>>({});
  const [preparedGuideLogoUrl, setPreparedGuideLogoUrl] = useState("");
  const [guidePreparationError, setGuidePreparationError] = useState("");
  const [constructionAreaInput, setConstructionAreaInput] = useState("");
  const [constructionUsageInput, setConstructionUsageInput] = useState("");
  const [workTypeInput, setWorkTypeInput] = useState("");
  const [habiteSeConstructionStandardInput, setHabiteSeConstructionStandardInput] = useState("");
  const [isEditingIssuedIssGuide, setIsEditingIssuedIssGuide] = useState(false);
  const viewerAreaRef = useRef<HTMLDivElement | null>(null);
  const documentWorkspaceWindowRef = useRef<Window | null>(null);

  useEffect(() => {
    let lastAutomaticDate = currentLocalDateValue();
    setDispatchDueDate((current) => current || lastAutomaticDate);

    const timer = window.setInterval(() => {
      const nextAutomaticDate = currentLocalDateValue();
      if (nextAutomaticDate === lastAutomaticDate) return;
      setDispatchDueDate((current) =>
        !current || current === lastAutomaticDate ? nextAutomaticDate : current,
      );
      lastAutomaticDate = nextAutomaticDate;
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!process || prewarmVisibleGuides.length === 0) {
      setPreparedGuideCharges({});
      setPreparedGuideLogoUrl("");
      setGuidePreparationError("");
      setGuideBillingBusyKey("");
      return () => {
        cancelled = true;
      };
    }

    const prepareGuides = async () => {
      setGuideBillingBusyKey("preparing-guides");
      setGuidePreparationError("");

      try {
        const logoPromise = prepareGuideInstitutionalLogo(
          prewarmStableGuideLogoUrl,
          prewarmGuideLogoUrl,
          prewarmTenantSettings?.headerLogoUrl,
          prewarmTenantSettings?.brasaoUrl,
          prewarmTenantSettings?.logoUrl,
        ).catch(
          () =>
            getRenderedMunicipalityLogoDataUrl() ||
            prewarmTenantSettings?.brasaoUrl ||
            prewarmTenantSettings?.headerLogoUrl ||
            prewarmGuideLogoUrl ||
            "",
        );

        const preparedCharges: Record<string, MercadoPagoGuideCharge> = {};

        for (const guide of prewarmVisibleGuides) {
          const banking = resolveGuideBankingData({
            settings: prewarmTenantSettings,
            guide,
            municipalityName: municipalityName || prewarmTenant?.name,
            municipalityCity:
              prewarmTenantSettings?.pixMerchantCity || prewarmTenant?.city,
          });

          // Guia compensada é documento histórico. Abrir a tela, trocar de dia
          // ou pressionar F5 jamais pode gerar uma nova cobrança para ela.
          if (guide.status === "compensada") continue;
          if (banking.barcode && banking.digitableLine) continue;

          preparedCharges[guide.code] = await ensureMercadoPagoGuideCharge({
            municipalityId: effectiveScopeId,
            guideCode: guide.code,
            amount: guide.amount,
            dueDate: guide.dueDate,
            description: `${guide.label} · ${process.protocol}`,
          });
        }

        const embeddedLogo = await logoPromise;
        if (cancelled) return;

        setPreparedGuideCharges((current) => ({
          ...current,
          ...preparedCharges,
        }));
        setPreparedGuideLogoUrl(embeddedLogo || prewarmGuideLogoUrl || "");
      } catch (error) {
        if (cancelled) return;
        setGuidePreparationError(
          error instanceof Error
            ? error.message
            : "Não foi possível preparar os dados bancários da guia.",
        );
      } finally {
        if (!cancelled) setGuideBillingBusyKey("");
      }
    };

    void prepareGuides();

    return () => {
      cancelled = true;
    };
  }, [
    effectiveScopeId,
    prewarmGuideSignature,
    prewarmSettingsSignature,
    process?.id,
    process?.protocol,
  ]);
  const setProcessTab = (tab: ProcessTab) => {
    if (tab === "analise" && !stableAnalysisAccess) return;
    if (
      tab === "financeiro" &&
      session.role !== "profissional_externo" &&
      !stableFinanceAccess
    ) return;
    const nextParams = new URLSearchParams(location.search);
    nextParams.set("aba", tab);
    if (tab !== "financeiro") nextParams.delete("guia");
    navigate({ pathname: location.pathname, search: nextParams.toString() }, { replace: true, preventScrollReset: true });
    setActiveTab(tab);
  };

  useEffect(() => {
    if (!process) return;
    setConstructionAreaInput(process.property.area > 0 ? String(process.property.area) : "");
    setConstructionUsageInput(process.property.usage || "");
    setWorkTypeInput(process.property.workType || "");
    setHabiteSeConstructionStandardInput(process.property.constructionStandard || "");
    setIsEditingIssuedIssGuide(false);
  }, [
    process?.id,
    process?.property.area,
    process?.property.usage,
    process?.property.workType,
    process?.property.constructionStandard,
  ]);

  const ownsCurrentProcessStage =
    !!process && isProcessOwnedBySessionDepartment(session, process);
  const isProtocolTrackingOnly =
    !!process &&
    canProtocolOperate &&
    !ownsCurrentProcessStage &&
    session.role !== "prefeitura_admin" &&
    session.role !== "master_admin" &&
    session.role !== "master_ops";

  // Durante F5 com store quente, o processo real já está disponível pelo cache
  // visual, mas permissões/departamento ainda podem estar revalidando. Não deixe
  // esse intervalo transitório trocar a aba atual (ex.: Habite-se -> Histórico).
  // A mesma regra já protege a Análise: a tela real permanece montada enquanto
  // a autorização é confirmada em segundo plano.
  const stableProtocolTrackingOnly =
    dataReadyForCurrentUser && !platformDataLoading
      ? isProtocolTrackingOnly
      : false;

  useEffect(() => {
    if (!processId || openedProcessRef.current === processId) return;
    openedProcessRef.current = processId;
    const requested = new URLSearchParams(location.search).get("aba");
    const preferredTab: ProcessTab = requested && ["resumo", "imovel", "documentos", "analise", "financeiro", "alvara", "historico"].includes(requested)
      ? requested as ProcessTab
      : "imovel";
    setActiveTab(stableProtocolTrackingOnly && preferredTab !== "resumo" ? "historico" : preferredTab);
  }, [stableProtocolTrackingOnly, processId, location.search]);

  useEffect(() => {
    if (!processId) return;
    const requested = new URLSearchParams(location.search).get("aba");
    if (!requested || !["resumo", "imovel", "documentos", "analise", "financeiro", "alvara", "historico"].includes(requested)) return;
    setActiveTab(stableProtocolTrackingOnly && requested !== "resumo" ? "historico" : requested as ProcessTab);
  }, [location.search, stableProtocolTrackingOnly, processId]);

  useEffect(() => {
    if (!stableProtocolTrackingOnly) return;
    if (activeTab === "historico" || activeTab === "resumo") return;
    setActiveTab("historico");
  }, [activeTab, stableProtocolTrackingOnly]);

  useEffect(() => {
    if (!process || !processId) return;

    const canonicalRouteKey = buildProcessRouteKey(process.protocol, process.id);
    if (!canonicalRouteKey) return;

    let currentRouteKey = processId;
    try {
      currentRouteKey = decodeURIComponent(processId);
    } catch {
      currentRouteKey = processId;
    }

    if (
      currentRouteKey.trim().toLocaleLowerCase("pt-BR") ===
      canonicalRouteKey.toLocaleLowerCase("pt-BR")
    ) {
      return;
    }

    navigate(
      {
        pathname: buildProcessPath(process),
        search: location.search,
        hash: location.hash,
      },
      { replace: true, preventScrollReset: true },
    );
  }, [
    location.hash,
    location.search,
    navigate,
    process?.id,
    process?.protocol,
    processId,
  ]);

  useEffect(() => {
    if (activeTab !== "financeiro" || !requestedGuideCode) return;

    // Em navegação fria, o primeiro frame pode acontecer antes das guias do
    // processo chegarem do store. Reexecutamos quando a assinatura das guias
    // muda e usamos dois frames para garantir que o card exato já foi montado.
    let outerFrame = 0;
    let innerFrame = 0;
    outerFrame = window.requestAnimationFrame(() => {
      innerFrame = window.requestAnimationFrame(() => {
        document.getElementById("guia-selecionada")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });

    return () => {
      window.cancelAnimationFrame(outerFrame);
      window.cancelAnimationFrame(innerFrame);
    };
  }, [activeTab, requestedGuideCode, processId, prewarmGuideSignature]);

  useEffect(() => {
    if (activeTab !== "historico" || location.hash !== "#despacho") return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("despacho")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, location.hash, processId]);

  useEffect(() => {
    if (!isExternalSession) return;
    if (activeTab === "analise") {
      setActiveTab("resumo");
      return;
    }
    if (activeTab === "financeiro" && session.role !== "profissional_externo") {
      setActiveTab("resumo");
    }
  }, [activeTab, isExternalSession, session.role]);

  const canUploadProcessDocuments = session.role === "profissional_externo" && process?.status === "rascunho";
  const canRecoverStoredDocuments =
    canUploadProcessDocuments ||
    (
      ownsCurrentProcessStage &&
      (
        canProtocolOperate ||
        session.role === "prefeitura_supervisor" ||
        session.role === "analista"
      )
    );
  const canAttachToRequirement = (item: ProcessRecord["requirements"][number]) =>
    item.status === "aberta" &&
    session.role !== "prefeitura_admin" &&
    (isInternalRole(session.role) || session.role === "profissional_externo" || session.role === "proprietario_consulta");

  const recoverableDocumentsFingerprint = (process?.documents ?? [])
    .map((document) =>
      [
        document.id,
        document.uploaded ? "1" : "0",
        document.filePath || "",
      ].join(":"),
    )
    .join("|");

  useEffect(() => {
    let cancelled = false;

    if (
      !canRecoverStoredDocuments ||
      !process ||
      activeTab !== "documentos" ||
      !process.documents.some((document) => !document.uploaded)
    ) {
      return () => {
        cancelled = true;
      };
    }

    const loadRecoverableFiles = async () => {
      setRecoverableLoading(true);
      setRecoverableStatus("");
      try {
        const files = await listRecoverableProcessFiles({ processId: process.id });
        if (cancelled) return;
        const alreadyLinked = new Set(
          process.documents
            .map((document) => document.filePath)
            .filter((value): value is string => Boolean(value)),
        );
        const available = files.filter((file) => !alreadyLinked.has(file.objectKey));
        setRecoverableFiles(available);
        if (available.length > 0) {
          setRecoverableStatus(
            `${available.length} upload(s) deste protocolo encontrado(s) no armazenamento. Você pode recuperar sem reenviar.`,
          );
        }
      } catch (error) {
        if (!cancelled) {
          setRecoverableStatus(
            error instanceof Error
              ? error.message
              : "Não foi possível procurar uploads anteriores.",
          );
        }
      } finally {
        if (!cancelled) setRecoverableLoading(false);
      }
    };

    void loadRecoverableFiles();

    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    canRecoverStoredDocuments,
    process?.id,
    recoverableDocumentsFingerprint,
  ]);

  useEffect(() => {
    let cancelled = false;
    setDocumentAccessUrls({});
    setDocumentAccessErrors({});

    if (!process?.id || isExternalSession) {
      return () => {
        cancelled = true;
      };
    }

    const bucket =
      (import.meta.env.VITE_R2_BUCKET_DOCUMENTOS as string | undefined) ||
      "sigapro-documentos";

    const candidates = process.documents.filter(
      (document) => document.uploaded && Boolean(document.filePath),
    );

    void Promise.allSettled(
      candidates.map(async (document) => {
        try {
          const url = await getSignedUrlForObjectStrict({
            bucket,
            objectKey: document.filePath!,
            expiresIn: 21600,
          });
          if (cancelled || !url) return;
          setDocumentAccessUrls((current) =>
            current[document.id] === url
              ? current
              : { ...current, [document.id]: url },
          );
          cacheDocumentWorkspaceAccessUrl(process.id, document.id, url);
        } catch (error) {
          if (!cancelled) {
            setDocumentAccessErrors((current) => ({
              ...current,
              [document.id]:
                error instanceof Error
                  ? error.message
                  : "Não foi possível preparar o acesso seguro ao documento.",
            }));
          }
          // A rota dedicada ainda possui fallback próprio.
        }
      }),
    );

    return () => {
      cancelled = true;
    };
  }, [process?.id, recoverableDocumentsFingerprint, isExternalSession]);

  if (!process) {
    if (platformDataLoading || !dataReadyForCurrentUser) {
      // F5 sem cache visual só acontece no primeiro acesso da rota.
      // Mantemos o frame institucional real montado em vez de devolver null,
      // evitando um root vazio/branco enquanto o store é resolvido.
      return (
        <PortalFrame eyebrow="Processo" title="Carregando processo">
          <PageShell className="sig-process-detail-premium !max-w-none !px-3 sm:!px-4 lg:!px-5 2xl:!px-6">
            <div className="min-h-[420px]" aria-hidden="true" />
          </PageShell>
        </PortalFrame>
      );
    }

    return (
      <PortalFrame eyebrow="Processo" title="Processo Não Encontrado">
        <Card className="rounded-[28px] border-slate-200">
          <CardContent className="p-8 text-sm text-slate-600">O protocolo solicitado não existe na base carregada.</CardContent>
        </Card>
      </PortalFrame>
    );
  }

  if (!canTrackProcess(session, process, effectiveScopeId)) {
    return (
      <PortalFrame eyebrow="Controle de Acesso" title="Conteúdo Protegido">
        <Card className="rounded-[28px] border-rose-200 bg-rose-50">
          <CardContent className="p-8">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <ShieldAlert className="h-5 w-5" />
              <p className="font-semibold">Este perfil não pode visualizar documentos nem dados processuais desta prefeitura.</p>
            </div>
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">
              O administrador geral consegue testar os acessos, mas o conteúdo sigiloso permanece bloqueado.
            </p>
          </CardContent>
        </Card>
      </PortalFrame>
    );
  }

  const processInstitutionId = process.municipalityId ?? process.tenantId;
  const tenant = institutions.find((item) => item.id === processInstitutionId) ?? null;
  const tenantSettings = institutionSettingsCompat ?? getInstitutionSettings(processInstitutionId);
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
  const isHabiteSeProcess = isOccupancyPermitProcessType(process.type);
  const paymentGuides = getProcessPaymentGuides(process, tenantSettings);
  const isExternalProcessViewer = isExternalSession;
  const visiblePaymentGuides = isExternalProcessViewer
    ? getExternallyVisibleProcessPaymentGuides(process, tenantSettings)
    : paymentGuides;
  const requestedPaymentGuide = requestedGuideCode
    ? paymentGuides.find((guide) => guide.code === requestedGuideCode) ?? null
    : null;
  const issuedConstructionGuide = paymentGuides.find((guide) => guide.kind === "iss_obra");
  const approvalGuide = paymentGuides.find((guide) => guide.kind === "aprovacao_final");
  const habiteSeGuide = paymentGuides.find((guide) => guide.kind === "habite_se");
  const habiteSeGuideSentExternally = habiteSeGuide
    ? isProcessPaymentGuideSharedExternally(process, habiteSeGuide)
    : false;
  const permitReachedIssuanceStage =
    Boolean(constructionPermit) &&
    constructionPermit?.status !== "rascunho";
  // Um Alvará já preparado/encaminhado antes da ativação da cobrança final
  // nunca pode regredir visualmente para Análise. Se uma guia final já existe,
  // ela continua obrigatória; caso contrário, preservamos o estágio oficial já alcançado.
  const approvalPaymentRequired =
    !isHabiteSeProcess &&
    tenantSettings?.finalApprovalFeeEnabled !== false &&
    (!permitReachedIssuanceStage || Boolean(approvalGuide));
  const approvalPaymentConfirmed =
    !approvalPaymentRequired || approvalGuide?.status === "compensada";
  const constructionGuideSentExternally = issuedConstructionGuide
    ? isProcessPaymentGuideSharedExternally(process, issuedConstructionGuide)
    : false;
  const uploadedCount = process.documents.filter((document) => document.uploaded).length;
  const protocolGuide = visiblePaymentGuides.find((guide) => guide.kind === "protocolo");
  const pixPayload = protocolGuide
    ? buildGuidePixPayload({
        settings: tenantSettings,
        guide: protocolGuide,
        municipalityName: municipalityName || tenant?.name,
        municipalityCity: tenantSettings?.pixMerchantCity || tenant?.city,
      })
    : "";
  const canEditAssignedAnalysis =
    !isExternalProcessViewer &&
    canEditAssignedAnalysisArtifact(session, process, effectiveScopeId);
  const canReviewDocuments =
    !isExternalProcessViewer &&
    (
      canAnalyzeProcessDocument(session, process, effectiveScopeId) ||
      (isHabiteSeProcess && canEditAssignedAnalysis)
    );
  const canEditAnalysisChecklist = canEditAssignedAnalysis;
  const canUseMunicipalChecklist =
    !isExternalProcessViewer &&
    !isProtocolTrackingOnly &&
    (canAnalysisOperate || canEditAssignedAnalysis) &&
    matchesOperationalScope(effectiveScopeId, process) &&
    ["master_admin", "master_ops", "prefeitura_supervisor", "analista", "fiscal"].includes(session.role);
  const isAnalysisSupervisor =
    session.role === "prefeitura_supervisor" &&
    canAccessMunicipalArea(session, "analise");
  const runSupervisorAction = async (
    action: () => Promise<void>,
    successMessage: string,
  ) => {
    if (supervisorActionBusy) return;
    setSupervisorActionBusy(true);
    setSupervisorActionStatus("");
    try {
      await action();
      setSupervisorActionStatus(successMessage);
    } catch (error) {
      setSupervisorActionStatus(
        error instanceof Error
          ? `Não foi possível concluir: ${error.message}`
          : "Não foi possível concluir a operação da Diretoria.",
      );
    } finally {
      setSupervisorActionBusy(false);
    }
  };

  const handleBeginSupervisorIntervention = async (reason: string) => {
    await runSupervisorAction(
      () =>
        beginAnalysisSupervisorIntervention({
          processId: process.id,
          reason,
          minutes: 30,
        }),
      "Intervenção da Diretoria iniciada por 30 minutos. Todas as alterações serão auditadas.",
    );
  };

  const handleEndSupervisorIntervention = async () => {
    await runSupervisorAction(
      () => endAnalysisSupervisorIntervention(process.id),
      "Intervenção encerrada. O processo voltou ao modo acompanhamento.",
    );
  };

  const handleReassignAnalysis = async (targetProfileId: string, reason: string) => {
    await runSupervisorAction(
      () =>
        reassignProcessAnalysis({
          processId: process.id,
          targetProfileId,
          reason,
        }),
      "Análise redistribuída com sucesso e registrada no histórico.",
    );
  };

  const visibleDocumentRows =
    isProtocolTrackingOnly
      ? []
      : isInternalRole(session.role)
        ? process.documents
        : process.documents.filter((document) => document.uploaded);
  const approvedDocumentCount = process.documents.filter(
    (document) => document.uploaded && document.reviewStatus === "aprovado",
  ).length;
  const communicateDocumentCount = process.documents.filter(
    (document) => document.uploaded && document.reviewStatus === "rejeitado",
  ).length;
  const awaitingReviewDocumentCount = process.documents.filter(
    (document) =>
      document.uploaded &&
      document.reviewStatus !== "aprovado" &&
      document.reviewStatus !== "rejeitado",
  ).length;
  const reviewedDocumentCount = approvedDocumentCount + communicateDocumentCount;
  const documentReviewProgress =
    uploadedCount > 0
      ? Math.min(100, Math.round((reviewedDocumentCount / uploadedCount) * 100))
      : 0;
  const documentDeliveryProgress =
    process.documents.length > 0
      ? Math.min(100, Math.round((uploadedCount / process.documents.length) * 100))
      : 0;
  const pendingExternalDocumentCount = process.documents.filter((document) => !document.uploaded).length;
  const requiredAnalysisDocuments = process.documents.filter(
    (document) => document.required || document.uploaded,
  );
  const allAnalysisDocumentsApproved =
    requiredAnalysisDocuments.length > 0 &&
    requiredAnalysisDocuments.every(
      (document) => document.uploaded && document.reviewStatus === "aprovado",
    );
  const hasOpenAnalysisRequirements = process.requirements.some(
    (requirement) => requirement.status === "aberta" || requirement.status === "respondida",
  );
  const constructionGuide = visiblePaymentGuides.find(
    (guide) => guide.kind === "iss_obra",
  );
  const canFinanceConfirmConstructionPayment =
    Boolean(constructionGuide) &&
    constructionGuide?.status === "pendente" &&
    canFinanceOperate &&
    constructionGuideSentExternally;
  const canManageIssuedIssGuide =
    Boolean(constructionGuide) &&
    constructionGuide?.status !== "compensada" &&
    (isMasterOperator || canReviewDocuments);
  const constructionGuideRequest = process.dispatches.find(
    (dispatch) =>
      /(issqn|iss|projeto).*guia|guia.*(issqn|iss|projeto)/i.test(dispatch.subject) &&
      ["aguardando", "respondido"].includes(dispatch.status),
  );
  const habiteSeGuideRequest = process.dispatches.find(
    (dispatch) =>
      /guia.*habite|habite.*guia/i.test(dispatch.subject) &&
      ["aguardando", "respondido"].includes(dispatch.status),
  );
  const constructionGuideIssueAudit = process.auditTrail.find(
    (entry) =>
      entry.category === "financeiro" &&
      /guia.*(issqn|iss).*emitida/i.test(`${entry.title} ${entry.detail}`),
  );
  const constructionGuideRequester =
    constructionGuide?.requestedBy ||
    constructionGuideRequest?.requestedBy ||
    process.analysis?.assignedTo ||
    "";
  const constructionGuideIssuer =
    constructionGuide?.issuedBy ||
    constructionGuideIssueAudit?.actor ||
    "";
  const constructionGuideIssuerMode =
    tenantSettings?.constructionGuideIssuerMode ?? "analise";
  const analysisCanIssueConstructionGuide =
    constructionGuideIssuerMode === "analise" || constructionGuideIssuerMode === "ambos";
  const financeCanIssueConstructionGuide =
    constructionGuideIssuerMode === "financeiro" || constructionGuideIssuerMode === "ambos";
  const constructionAreaValue = Number(String(constructionAreaInput).replace(",", "."));
  const configuredIssProfiles = tenantSettings?.issRateProfiles ?? [];
  const constructionUsageOptions = Array.from(
    new Set(
      configuredIssProfiles.length > 0
        ? configuredIssProfiles.map((profile) => profile.label).filter(Boolean)
        : ["Residencial", "Comercial e mista", "Industrial", "Loteamentos"],
    ),
  );
  const constructionGuidePreviewAmount = calculateIssGuideAmount(
    Number.isFinite(constructionAreaValue) ? constructionAreaValue : 0,
    constructionUsageInput,
    tenantSettings,
  );
  const approvalGuidePreview = calculateApprovalGuideBreakdown(
    process.property.area,
    process.property.usage,
    process.property.constructionStandard,
    tenantSettings,
  );
  const habiteSeStandardOrder = ["luxo", "primeira", "medio", "economico"];
  const habiteSeFinishOptions = (tenantSettings?.approvalRateProfiles ?? [])
    .filter(
      (profile) =>
        normalizeMunicipalFeeLabel(profile.usage) ===
          normalizeMunicipalFeeLabel(process.property.usage) &&
        Number(profile.rate) > 0,
    )
    .sort((left, right) => {
      const leftIndex = habiteSeStandardOrder.indexOf(
        normalizeMunicipalFeeLabel(left.standard),
      );
      const rightIndex = habiteSeStandardOrder.indexOf(
        normalizeMunicipalFeeLabel(right.standard),
      );
      return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex);
    });
  const habiteSeGuidePreview = calculateHabiteSeGuideBreakdown(
    process.property.area,
    process.property.usage,
    habiteSeConstructionStandardInput,
    tenantSettings,
  );
  const displayGuide = requestedPaymentGuide ?? approvalGuide ?? constructionGuide ?? protocolGuide;

  const getDocumentReviewVisual = (document: typeof process.documents[number]) => {
    if (!document.uploaded) {
      return {
        label: "Aguardando envio",
        card: "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950/35",
        badge: "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200",
        button: "border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200",
      };
    }
    if (document.reviewStatus === "aprovado") {
      return {
        label: "Aprovado",
        card: "border-emerald-300 bg-emerald-50/70 dark:border-emerald-500/40 dark:bg-emerald-950/25",
        badge: "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-500/50 dark:bg-emerald-950/60 dark:text-emerald-300",
        button: "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70",
      };
    }
    if (document.reviewStatus === "rejeitado") {
      return {
        label: "Comunique-se",
        card: "border-amber-300 bg-amber-50/70 dark:border-amber-500/40 dark:bg-amber-950/25",
        badge: "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-500/50 dark:bg-amber-950/60 dark:text-amber-300",
        button: "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-500/50 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-950/70",
      };
    }
    return {
      label: "Aguardando análise",
      card: "border-sky-300 bg-sky-50/60 dark:border-sky-500/40 dark:bg-sky-950/25",
      badge: "border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-500/50 dark:bg-sky-950/60 dark:text-sky-300",
      button: "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:border-sky-500/50 dark:bg-sky-950/40 dark:text-sky-300 dark:hover:bg-sky-950/70",
    };
  };
  const viewerDocument = viewerDocumentId ? process.documents.find((document) => document.id === viewerDocumentId) ?? null : null;
  const getDocumentAccessUrl = (document: typeof process.documents[number]) =>
    document.filePath
      ? documentAccessUrls[document.id] || ""
      : document.previewUrl || "";
  const getDocumentFallbackUrl = (document: typeof process.documents[number]) => {
    const accessUrl = getDocumentAccessUrl(document);
    if (accessUrl) return accessUrl;

    // Arquivo real armazenado nunca cai em preview demonstrativo. Se a URL
    // assinada ainda não existe ou falhou, a UI deve mostrar carregamento/erro.
    if (document.filePath) return "";

    return buildDocumentPreview(
      document.label,
      document.fileName,
      tenant?.name ?? tenantSettings?.beneficiarioArrecadacao,
    );
  };
  const canAnnotateViewer =
    !!viewerDocument &&
    canReviewDocuments &&
    /projeto arquitetonico|memorial/i.test(viewerDocument.label);
  const externalRecipientName = process.technicalLead || process.ownerName;
  const internalRecipients = sessionUsers.filter((user) => matchesOperationalScope(effectiveScopeId, user) && isInternalRole(user.role));
  const processTransitVisibility = process.processControl?.externalTransitView ?? "completo";
  const canViewCompleteTransit =
    !isProtocolTrackingOnly &&
    (isInternalRole(session.role) || processTransitVisibility === "completo");
  const organizationDestinations = organizationDepartments;

  const rawCurrentFolder = process.processControl?.currentFolder || process.dispatches[0]?.to || process.sla.currentStage;
  const holdsIssuedIssInsideUrbanism =
    Boolean(issuedConstructionGuide) &&
    !constructionGuideSentExternally &&
    issuedConstructionGuide?.status !== "compensada";
  const currentFolder = holdsIssuedIssInsideUrbanism
    ? URBAN_ANALYSIS_DEPARTMENT
    : process.status === "analise_tecnica" && /^(protocolo|an[aá]lise t[eé]cnica)$/i.test(rawCurrentFolder.trim())
      ? URBAN_ANALYSIS_DEPARTMENT
      : rawCurrentFolder;
  const currentOrganizationPath = getOrganizationPath(currentFolder);
  const currentOrganizationTrail = getOrganizationPathRecords(currentFolder)
    .filter((item) => item.isActive)
    .map((item) => ({
      code: item.code?.trim() || "UNID",
      name: item.name,
    }));

  const protocolDepartment = organizationDepartments.find((department) =>
    /protocolo|triagem|recep[cç][aã]o/i.test(department.name),
  );
  const administrationDepartment = organizationDepartments.find((department) =>
    /administra[cç][aã]o|administrativo|secretaria de administra[cç][aã]o/i.test(department.name),
  );
  const protocolOrganizationPath = protocolDepartment
    ? getOrganizationPath(protocolDepartment.name)
    : administrationDepartment
      ? `${getOrganizationPath(administrationDepartment.name)} › Protocolo`
      : "Administração › Protocolo";

  const normalizedCurrentFolder = currentFolder
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

  const initialUrbanAnalysisDestination = organizationDepartments.find(
    (department) =>
      department.code?.trim().toUpperCase() === "ANU" ||
      /an[aá]lise urban[ií]stica/i.test(department.name),
  );
  const requiresInitialUrbanAnalysisDispatch =
    isOccupancyPermitProcessType(process.type) &&
    process.status === "triagem" &&
    /protocolo|triagem|administr/.test(normalizedCurrentFolder);

  const isFinalProcessStatus = ["deferido", "indeferido", "arquivado"].includes(process.status);
  const constructionPaymentCompensated =
    issuedConstructionGuide?.status === "compensada";
  const approvalPaymentCompensated =
    approvalGuide?.status === "compensada";
  let currentFlowIndex = 0;
  if (isHabiteSeProcess) {
    if (isFinalProcessStatus) {
      currentFlowIndex = 6;
    } else if (
      habiteSeGuide?.status === "compensada" ||
      /decis[aã]o|emiss[aã]o do habite/.test(normalizedCurrentFolder)
    ) {
      currentFlowIndex = 5;
    } else if (
      Boolean(habiteSeGuide) ||
      Boolean(habiteSeGuideRequest) ||
      /financ|tesour|arrecad/.test(normalizedCurrentFolder)
    ) {
      currentFlowIndex = 4;
    } else if (/fiscal|vistoria|inspec|conferencia/.test(normalizedCurrentFolder)) {
      currentFlowIndex = 3;
    } else if (
      /analise|urban|obra|engenharia/.test(normalizedCurrentFolder) ||
      ["pagamento_confirmado", "distribuicao", "analise_tecnica", "despacho_intersetorial", "exigencia", "reapresentacao"].includes(process.status)
    ) {
      currentFlowIndex = 2;
    } else if (["guia_emitida", "pagamento_pendente"].includes(process.status)) {
      currentFlowIndex = 1;
    }
  } else if (isFinalProcessStatus || constructionPermit?.status === "emitido") {
    currentFlowIndex = 5;
  } else if (permitReachedIssuanceStage) {
    // O artefato oficial do Alvará é a fonte autoritativa do estágio alcançado.
    // Ex.: PM-2026-00002 está em assinatura manual e não pode voltar para Análise
    // apenas porque o status operacional do processo ainda é analise_tecnica.
    currentFlowIndex = 4;
  } else if (
    constructionPaymentCompensated &&
    (!approvalPaymentRequired || approvalPaymentCompensated)
  ) {
    // O Alvará só entra na etapa de assinatura quando todas as cobranças
    // configuradas para o licenciamento estiverem compensadas.
    currentFlowIndex = 4;
  } else if (
    approvalPaymentRequired &&
    approvalGuide &&
    approvalGuide.status !== "compensada"
  ) {
    currentFlowIndex = 3;
  } else if (
    constructionGuideSentExternally &&
    issuedConstructionGuide?.status !== "compensada" &&
    (issuedConstructionGuide || /financ|tesour|arrecad|tribut/.test(normalizedCurrentFolder))
  ) {
    currentFlowIndex = 3;
  } else if (
    /analise|urban|obra|engenharia|fiscal/.test(normalizedCurrentFolder) ||
    ["pagamento_confirmado", "distribuicao", "analise_tecnica", "despacho_intersetorial", "exigencia", "reapresentacao"].includes(process.status)
  ) {
    currentFlowIndex = 2;
  } else if (["guia_emitida", "pagamento_pendente"].includes(process.status)) {
    currentFlowIndex = 1;
  }

  const flowLabels = isHabiteSeProcess
    ? [
        "Protocolo do Habite-se",
        "Pagamento inicial",
        "Análise documental",
        "Vistoria / conferência",
        "Financeiro",
        "Decisão / emissão",
        "Conclusão",
      ]
    : [
        "Protocolo",
        "Pagamento inicial",
        "Análise Urbanística",
        "Financeiro",
        "Alvará de Construção",
        "Conclusão",
      ];
  const flowSteps = flowLabels.map((label, index) => ({
    key: `municipal-flow-${index}`,
    label,
    state: isFinalProcessStatus
      ? "done"
      : index < currentFlowIndex
        ? "done"
        : index === currentFlowIndex
          ? "current"
          : "pending",
  }));
  const currentFlowStatusLabel =
    isFinalProcessStatus
      ? isHabiteSeProcess
        ? "Concluído"
        : statusLabel(process.status)
      : permitReachedIssuanceStage && !isHabiteSeProcess
        ? "Alvará de Construção"
        : flowLabels[currentFlowIndex] || statusLabel(process.status);

  const displayOrganizationPath =
    permitReachedIssuanceStage && !isHabiteSeProcess
      ? constructionPermit?.status === "assinatura_manual"
        ? "Alvará de Construção • assinatura manual"
        : constructionPermit?.status === "aguardando_diretor"
          ? "Alvará de Construção • aguardando Diretoria"
          : constructionPermit?.status === "emitido"
            ? "Alvará de Construção • emitido"
            : "Alvará de Construção"
      : currentOrganizationPath;

  const effectiveSlaStage =
    permitReachedIssuanceStage && !isHabiteSeProcess
      ? constructionPermit?.status === "assinatura_manual"
        ? "Alvará preparado para assinatura manual"
        : constructionPermit?.status === "aguardando_diretor"
          ? "Alvará aguardando assinatura da Diretoria"
          : constructionPermit?.status === "emitido"
            ? "Alvará emitido"
            : "Alvará de Construção"
      : process.sla.currentStage;

  // "Sair do processo" sempre volta para uma área que o usuário pode acessar.
  // A unidade atual do PROCESSO nunca deve decidir a pasta do USUÁRIO:
  // um analista pode estar apenas acompanhando um processo já no Financeiro,
  // e o Protocolo pode acompanhar um processo já no Urbanismo.
  const processExitPath =
    session.role === "profissional_externo"
      ? "/externo/controle"
      : session.role === "property_owner" || session.role === "proprietario_consulta"
        ? "/proprietario"
        : session.role === "prefeitura_admin"
          ? planEntitlements.canUseModule("Protocolo digital")
            ? "/dashboard/processos"
            : "/dashboard"
          : session.role === "master_admin" || session.role === "master_ops"
            ? "/dashboard/processos"
            : canAccessMunicipalArea(session, "analise")
              ? "/prefeitura/analise"
              : canAccessMunicipalArea(session, "financeiro")
                ? "/prefeitura/financeiro"
                : canAccessMunicipalArea(session, "protocolos")
                  ? "/prefeitura/protocolos"
                  : "/dashboard";

  const protocolStartedAt =
    process.auditTrail.find((entry) => /processo protocolado|protocolado|abertura/i.test(entry.title))?.at ||
    process.timeline[process.timeline.length - 1]?.at ||
    "";
  const transitSteps = [...process.dispatches]
    .reverse()
    .filter((dispatch) => {
      if (!holdsIssuedIssInsideUrbanism) return true;
      const destination = String(dispatch.to || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR");
      const subject = String(dispatch.subject || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR");

      const isPrematureIssFinanceHandoff =
        /financ|tesour|arrecad|tribut/.test(destination) &&
        (
          /guia.*(issqn|iss|projeto).*emitid/.test(subject) ||
          /controle financeiro/.test(subject)
        );

      return !isPrematureIssFinanceHandoff;
    });
  const hasTransitHistory = transitSteps.length > 0;
  const hasAnalysisDispatch = transitSteps.some((dispatch) =>
    /analise|análise|urban|obra|engenharia/i.test(dispatch.to),
  );
  const showAnalysisMilestone =
    Boolean(process.analysis?.startedAt || process.analysis?.assignedTo) &&
    !hasAnalysisDispatch;
  const analysisStartedAt = process.analysis?.startedAt
    ? new Date(process.analysis.startedAt).toLocaleString("pt-BR")
    : "";

  const constructionStandardLabel =
    process.property.constructionStandard === "luxo"
      ? "Luxo"
      : process.property.constructionStandard === "primeira"
        ? "Primeira"
        : process.property.constructionStandard === "economico"
          ? "Econômico"
          : process.property.constructionStandard === "medio"
            ? "Médio"
            : "Não informado";
  const linkedOwnerProfile = process.ownerProfileId
    ? getUserProfile(process.ownerProfileId)
    : undefined;
  const linkedTechnicalProfile = process.technicalProfileId
    ? getUserProfile(process.technicalProfileId)
    : undefined;
  const isProjectProfessionalViewer =
    session.role === "profissional_externo" &&
    processBelongsToExternalProfessional(session, process);
  const isUrbanAnalysisViewer =
    (session.role === "analista" || session.role === "prefeitura_supervisor") &&
    canAnalysisOperate &&
    matchesOperationalScope(effectiveScopeId, process);
  const canViewCompleteCadastro =
    !isProtocolTrackingOnly &&
    (isProjectProfessionalViewer || isUrbanAnalysisViewer);
  const getProfileByName = (name: string) => {
    const matchedUser = sessionUsers.find((user) => user.name === name || user.email === name);
    return matchedUser ? getUserProfile(matchedUser.id, matchedUser.email) : undefined;
  };
  const visibleMessages = process.messages.filter((item) => {
    if (isProtocolTrackingOnly) return false;
    if (item.audience === "misto") return true;
    if (item.audience === "interno") return isInternalRole(session.role);
    return session.role === "profissional_externo" || session.role === "proprietario_consulta" || session.name === externalRecipientName;
  });
  const visibleDispatches = process.dispatches.filter((dispatch) => {
    const visibility = dispatch.visibility || "interno";
    if (visibility === "misto") return true;
    if (visibility === "interno") return canViewCompleteTransit;
    return session.role === "profissional_externo" || session.role === "proprietario_consulta";
  });
  const visibleRequirements = process.requirements.filter((item) => {
    if (isProtocolTrackingOnly) return false;
    if (item.visibility === "misto") return true;
    if (item.visibility === "interno") return isInternalRole(session.role);
    return !isInternalRole(session.role);
  });
  const tabItems = [
    { key: "imovel" as ProcessTab, label: "Imóvel", enabled: !isProtocolTrackingOnly },
    { key: "documentos" as ProcessTab, label: `Documentos (${uploadedCount})`, enabled: !isProtocolTrackingOnly },
    {
      key: "analise" as ProcessTab,
      label: "Análise / Ficha técnica",
      enabled:
        !isExternalProcessViewer &&
        !isProtocolTrackingOnly &&
        analysisTabVisible,
    },
    {
      key: "financeiro" as ProcessTab,
      label: "Financeiro",
      enabled:
        session.role === "profissional_externo" ||
        (
          !isExternalProcessViewer &&
          !isProtocolTrackingOnly &&
          financeTabVisible
        ),
    },
    {
      key: "alvara" as ProcessTab,
      label: isHabiteSeProcess
        ? "Habite-se"
        : constructionPermit?.status === "emitido"
          ? "Alvará emitido"
          : "Alvará de Construção",
      enabled:
        !isProtocolTrackingOnly &&
        (
          isHabiteSeProcess
            ? true
            : isExternalProcessViewer
              ? currentFlowIndex >= 4 || constructionPermit?.status === "emitido"
              : canAnalysisOperate || constructionPaymentCompensated || Boolean(constructionPermit)
        ),
    },
    { key: "historico" as ProcessTab, label: "Acompanhamento", enabled: true },
    { key: "resumo" as ProcessTab, label: "Resumo", enabled: true },
  ].filter((item) => item.enabled);

  const showPrimaryDetailColumn = ["imovel", "documentos", "analise", "financeiro", "alvara", "historico"].includes(activeTab);
  const showSecondaryDetailColumn = ["analise", "financeiro"].includes(activeTab);
  const useSplitDetailLayout = false;
  const cardShell = "sig-process-card min-w-0 rounded-[20px] border border-slate-200 bg-white shadow-[0_14px_34px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-900";
  const printGuide = async (
    guideKind: PaymentGuideKind = "protocolo",
    autoPrint = true,
    guideCode?: string,
  ) => {
    const selectedGuide =
      (guideCode
        ? visiblePaymentGuides.find((guide) => guide.code === guideCode)
        : undefined) ||
      visiblePaymentGuides.find((guide) => guide.kind === guideKind);
    if (!selectedGuide) return;

    const issuedAt = String(selectedGuide.issuedAt || "").trim();
    if (!issuedAt) {
      setProcessActionStatus(
        "A guia oficial não possui data de emissão persistida. Para preservar a integridade do documento, o sistema não substituirá essa data pela data de hoje.",
      );
      return;
    }
    const year = new Date(issuedAt).getFullYear().toString();
    const approvalBreakdown =
      selectedGuide.kind === "aprovacao_final"
        ? calculateApprovalGuideBreakdown(
            selectedGuide.areaM2 ?? process.property.area,
            selectedGuide.usage || process.property.usage,
            selectedGuide.constructionStandard || process.property.constructionStandard,
            tenantSettings,
          )
        : null;
    const habiteSeBreakdown =
      selectedGuide.kind === "habite_se"
        ? calculateHabiteSeGuideBreakdown(
            selectedGuide.areaM2 ?? process.property.area,
            selectedGuide.usage || process.property.usage,
            selectedGuide.constructionStandard || process.property.constructionStandard,
            tenantSettings,
          )
        : null;
    const canItemizeApproval =
      Boolean(approvalBreakdown) &&
      Math.abs(Number(approvalBreakdown?.totalAmount ?? 0) - Number(selectedGuide.amount || 0)) < 0.02;
    const canItemizeHabiteSe =
      Boolean(habiteSeBreakdown?.profile) &&
      Math.abs(Number(habiteSeBreakdown?.totalAmount ?? 0) - Number(selectedGuide.amount || 0)) < 0.02;
    const guideItems: GuiaRecolhimentoOficialProps["itens"] =
      selectedGuide.kind === "aprovacao_final" && approvalBreakdown && canItemizeApproval
        ? [
            {
              ano: year,
              divida: `Alvará de ${selectedGuide.usage || process.property.usage || "Construção"}`,
              tabela: tenantSettings?.guiaPrefixo || "DAM",
              sb: "",
              pc: "",
              principal: approvalBreakdown.permitFee,
              multa: 0,
              juros: 0,
              correcao: 0,
              total: approvalBreakdown.permitFee,
            },
            {
              ano: year,
              divida: `${approvalBreakdown.areaM2.toLocaleString("pt-BR")} m² de aprovação • ${selectedGuide.usage || process.property.usage || "Obra"} • ${selectedGuide.constructionStandard || process.property.constructionStandard || "Padrão"} • ${approvalBreakdown.aliquotPercent.toLocaleString("pt-BR")}%`,
              tabela: `R$ ${approvalBreakdown.licenseUnitValue.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 4,
              })}/m²`,
              sb: "",
              pc: "",
              principal: approvalBreakdown.licenseAmount,
              multa: 0,
              juros: 0,
              correcao: 0,
              total: approvalBreakdown.licenseAmount,
            },
          ]
        : selectedGuide.kind === "habite_se" && habiteSeBreakdown && canItemizeHabiteSe
          ? [
              {
                ano: year,
                divida: `Habite-se • ${selectedGuide.usage || process.property.usage || "Construção"} • ${constructionStandardDisplayLabel(
                  selectedGuide.constructionStandard || process.property.constructionStandard,
                )}`,
                tabela: `R$ ${habiteSeBreakdown.baseValueM2.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}/m² × ${habiteSeBreakdown.aliquotPercent.toLocaleString("pt-BR")}%`,
                sb: "",
                pc: "",
                principal: habiteSeBreakdown.totalAmount,
                multa: 0,
                juros: 0,
                correcao: 0,
                total: habiteSeBreakdown.totalAmount,
              },
            ]
          : [
              {
                ano: year,
                divida: selectedGuide.label,
                tabela: tenantSettings?.guiaPrefixo || "DAM",
                sb: "",
                pc: "",
                principal: selectedGuide.amount,
                multa: 0,
                juros: 0,
                correcao: 0,
                total: selectedGuide.amount,
              },
            ];

    const banking = resolveGuideBankingData({
      settings: tenantSettings,
      guide: selectedGuide,
      municipalityName: municipalityName || tenant?.name,
      municipalityCity: tenantSettings?.pixMerchantCity || tenant?.city,
    });
    const historicalPaidGuide = selectedGuide.status === "compensada";
    const providerCharge = historicalPaidGuide
      ? null
      : preparedGuideCharges[selectedGuide.code] ?? null;
    const digitableLine = historicalPaidGuide
      ? banking.digitableLine
      : providerCharge
        ? providerCharge.digitableLine
        : banking.digitableLine;
    const barcode = historicalPaidGuide
      ? banking.barcode
      : providerCharge
        ? providerCharge.barcodeContent
        : banking.barcode;

    if (!historicalPaidGuide && (!barcode || !digitableLine)) {
      setProcessActionStatus(
        guidePreparationError
          ? `A guia não foi aberta porque os dados bancários ainda não estão válidos: ${guidePreparationError}`
          : "A guia ainda está sendo preparada. Aguarde a conclusão dos dados bancários antes de abrir.",
      );
      return;
    }

    const providerInstitution = providerCharge?.financialInstitution?.trim() || "";
    const providerName =
      providerInstitution && providerInstitution.toLowerCase() !== "boleto"
        ? providerInstitution
        : banking.bankName || "Mercado Pago";

    // Reserva a nova guia ainda dentro do gesto do clique. Assim podemos aguardar
    // a conversão do brasão/logo para data URL sem transformar a abertura em popup
    // assíncrono bloqueado pelo navegador.
    const reservedGuideWindow = reserveGuiaRecolhimentoOficialWindow(
      `Guia ${selectedGuide.code}`,
    );
    if (!reservedGuideWindow) {
      setProcessActionStatus(
        "O navegador bloqueou a abertura da guia. Permita pop-ups para o SIGAPRO e tente novamente.",
      );
      return;
    }

    const renderedGuideLogoUrl = getRenderedMunicipalityLogoDataUrl();
    const directGuideLogoFallback =
      renderedGuideLogoUrl ||
      tenantSettings?.headerLogoUrl ||
      tenantSettings?.brasaoUrl ||
      guideHeaderBranding.logoUrl ||
      ("fallbackLogoUrl" in guideHeaderBranding ? guideHeaderBranding.fallbackLogoUrl : "") ||
      stableGuideLogoUrl ||
      tenantSettings?.logoUrl ||
      "";

    let embeddedGuideLogoUrl = preparedGuideLogoUrl || "";
    if (!embeddedGuideLogoUrl) {
      embeddedGuideLogoUrl = await prepareGuideInstitutionalLogo(
        renderedGuideLogoUrl,
        stableGuideLogoUrl,
        guideHeaderBranding.logoUrl,
        "fallbackLogoUrl" in guideHeaderBranding ? guideHeaderBranding.fallbackLogoUrl : "",
        tenantSettings?.headerLogoUrl,
        tenantSettings?.brasaoUrl,
        tenantSettings?.logoUrl,
      ).catch(() => "");
    }
    embeddedGuideLogoUrl = embeddedGuideLogoUrl || directGuideLogoFallback;

    const rawIssuedBy = String(selectedGuide.issuedBy || "").trim();
    const issuedByLooksLikeId =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawIssuedBy);
    const issuedByDisplay = issuedByLooksLikeId || !rawIssuedBy ? session.name : rawIssuedBy;

    const guideDocument: GuiaRecolhimentoOficialProps = {
      prefeitura: {
        nome: municipalityName || tenant?.name || tenantSettings?.beneficiarioArrecadacao || "Prefeitura Municipal",
        secretaria: tenantSettings?.secretariaResponsavel || "Secretaria responsável",
        endereco: tenantSettings?.endereco || "Endereço não configurado",
        telefone: tenantSettings?.telefone || "",
        logoUrl: embeddedGuideLogoUrl,
        cadastroTitulo: "Cadastro Eventual",
      },
      contribuinte: {
        nome: process.ownerName,
        cpfCnpj: process.ownerDocument,
        endereco: process.address,
        numeroCadastro: process.property.registration || process.protocol,
      },
      guia: {
        numeroGuia: selectedGuide.code,
        exercicio: year,
        dataDocumento: issuedAt,
        vencimento: selectedGuide.dueDate,
        observacao: historicalPaidGuide
          ? `${getGuideObservation(selectedGuide.kind)} Documento histórico quitado; data de emissão e baixa preservadas conforme o registro original.`
          : getGuideObservation(selectedGuide.kind),
        funcionarioResponsavel: issuedByDisplay,
        proprietario: selectedGuide.ownerName || process.ownerName,
        profissionalResponsavel: selectedGuide.professionalName || process.technicalLead,
        analistaSolicitante:
          selectedGuide.kind === "iss_obra"
            ? process.analysis?.assignedTo || constructionGuideRequester || session.name
            : undefined,
        funcionarioEmissor:
          selectedGuide.kind === "iss_obra"
            ? constructionGuideIssuer || issuedByDisplay
            : issuedByDisplay,
        areaObra: selectedGuide.areaM2 ?? process.property.area,
        usoObra: selectedGuide.usage || process.property.usage,
        padraoConstrutivo:
          selectedGuide.kind === "iss_obra"
            ? process.property.workType || workTypeInput || undefined
            : selectedGuide.constructionStandard || constructionStandardLabel,
        codigoBarras: barcode,
        linhaDigitavel: digitableLine,
        qrCodePixUrl: "",
        pixPayload: banking.pixPayload,
        bankName: providerName,
        bankEnvironment:
          providerCharge?.environment || selectedGuide.providerEnvironment,
        bankAgreement: banking.bankAgreement,
        bankInstructions: banking.bankInstructions,
        bankReference: providerCharge?.orderId || selectedGuide.bankReference,
        bankPaymentId: providerCharge?.paymentId || selectedGuide.bankPaymentId,
        bankStatus: providerCharge?.status || selectedGuide.bankStatus,
        bankStatusDetail:
          providerCharge?.statusDetail || selectedGuide.bankStatusDetail,
        bankAuthenticatedAt:
          providerCharge?.authenticatedAt ||
          selectedGuide.bankAuthenticatedAt ||
          (selectedGuide.status === "compensada" ? selectedGuide.paidAt : undefined),
        paymentProvider:
          selectedGuide.paymentProvider ||
          (historicalPaidGuide && !selectedGuide.bankReference
            ? "manual"
            : tenantSettings?.paymentProvider || "mercado_pago"),
        valorDocumento: selectedGuide.amount,
        descontos: 0,
        outrosAcrescimos: 0,
        valorCobrado: selectedGuide.amount,
        autenticacaoMecanica: "",
        referencia: getGuideReference(selectedGuide.kind),
      },
      itens: guideItems,
    };

    const opened = openGuiaRecolhimentoOficialWindow(
      guideDocument,
      {
        title: `Guia ${selectedGuide.code}`,
        autoPrint,
      },
      reservedGuideWindow,
    );

    if (!opened) {
      try {
        reservedGuideWindow.close();
      } catch {
        // noop
      }
      setProcessActionStatus(
        "Não foi possível concluir a abertura da guia oficial.",
      );
    }
  };
  const runProcessAction = async (
    key: string,
    action: () => Promise<void>,
    successMessage: string,
    options?: { allowMunicipalAdmin?: boolean },
  ) => {
    if (session.role === "prefeitura_admin" && !options?.allowMunicipalAdmin) {
      setProcessActionStatus(
        "Esta ação operacional pertence ao setor responsável. O Administrador da Prefeitura mantém governança do processo e pode executar o encaminhamento institucional quando necessário.",
      );
      return false;
    }
    setProcessActionBusy(key);
    setProcessActionStatus("");
    try {
      await action();
      setProcessActionStatus(successMessage);
      return true;
    } catch (error) {
      setProcessActionStatus(
        error instanceof Error ? error.message : "Não foi possível concluir a operação no banco oficial.",
      );
      return false;
    } finally {
      setProcessActionBusy("");
    }
  };

  const getConstructionGuideInput = () => {
    const areaM2 = Number(String(constructionAreaInput).replace(",", "."));
    if (!Number.isFinite(areaM2) || areaM2 <= 0) {
      setProcessActionStatus("Informe a quantidade correta de metros quadrados da obra.");
      return null;
    }
    if (!constructionUsageInput.trim()) {
      setProcessActionStatus("Selecione o uso da edificação para calcular o ISSQN / Projeto.");
      return null;
    }
    if (!workTypeInput.trim()) {
      setProcessActionStatus("Selecione a natureza da obra.");
      return null;
    }

    return {
      processId: process.id,
      areaM2,
      usage: constructionUsageInput,
      workType: workTypeInput,
    };
  };

  const handleGenerateConstructionGuide = () => {
    if (!analysisCanIssueConstructionGuide) {
      setProcessActionStatus("Nesta Prefeitura, a Guia de ISSQN / Projeto é emitida pelo Setor Financeiro.");
      return;
    }
    const input = getConstructionGuideInput();
    if (!input) return;

    void runProcessAction(
      "generate-construction-guide",
      async () => {
        await updateIssProjectGuideData(input);
        await issuePaymentGuide(process.id, session.name, "iss_obra");
      },
      "Guia de ISSQN / Projeto gerada. Ela já está disponível no Financeiro para controle e pode ser enviada ao profissional.",
    );
  };

  const handleForwardConstructionGuideToFinance = () => {
    if (!financeCanIssueConstructionGuide) {
      setProcessActionStatus("O workflow desta Prefeitura está configurado para emissão pela Análise Urbanística.");
      return;
    }
    const input = getConstructionGuideInput();
    if (!input) return;

    void runProcessAction(
      "forward-construction-guide",
      async () => {
        await updateIssProjectGuideData(input);
        await requestConstructionPaymentGuide(process.id, session.name);
      },
      "Dados da obra confirmados e encaminhados ao Financeiro para emissão da Guia de ISSQN / Projeto.",
    );
  };

  const handleIssueConstructionGuideFromFinance = () => {
    if (!financeCanIssueConstructionGuide) {
      setProcessActionStatus("O administrador desta Prefeitura definiu que a guia deve ser emitida pela Análise Urbanística.");
      return;
    }
    void runProcessAction(
      "finance-issue-construction-guide",
      () => issuePaymentGuide(process.id, session.name, "iss_obra"),
      "Guia de ISSQN / Projeto emitida pelo Financeiro e vinculada ao processo.",
    );
  };

  const handleConfirmConstructionPayment = async () => {
    if (!constructionGuide) return;
    if (!constructionGuideSentExternally) {
      setProcessActionStatus(
        "A Guia de ISSQN / Projeto ainda não foi liberada ao profissional. O Financeiro só pode dar baixa depois da liberação oficial.",
      );
      return;
    }
    if (!canFinanceOperate) {
      setProcessActionStatus(
        "Somente o Setor Financeiro pode confirmar o pagamento da Guia de ISSQN / Projeto.",
      );
      return;
    }

    const ok = await runProcessAction(
      "confirm-construction-payment",
      () => markGuideAsPaid(process.id, session.name, "iss_obra"),
      "Pagamento confirmado. O processo retornou automaticamente à Análise Urbanística.",
    );

    if (ok) {
      navigate(
        `/prefeitura/financeiro/protocolos?retorno=analise&processo=${encodeURIComponent(
          formatOfficialProcessNumber(process.protocol),
        )}`,
        { replace: true },
      );
    }
  };

  const handleGenerateApprovalGuide = () => {
    if (!approvalPaymentRequired) {
      setProcessActionStatus(
        "A Prefeitura não configurou cobrança de aprovação/Alvará para este fluxo.",
      );
      return;
    }
    if (approvalGuide) {
      setProcessActionStatus("A Guia de Pagamento - Aprovação / Alvará já foi emitida.");
      return;
    }
    if (!constructionPaymentCompensated) {
      setProcessActionStatus(
        "A Guia de ISSQN / Projeto precisa estar compensada antes da guia de aprovação/Alvará.",
      );
      return;
    }
    if (!allAnalysisDocumentsApproved || hasOpenAnalysisRequirements) {
      setProcessActionStatus(
        "Conclua a análise documental e todas as exigências antes de emitir a guia de aprovação/Alvará.",
      );
      return;
    }
    if (!process.property.constructionStandard?.trim()) {
      setProcessActionStatus(
        "Informe o padrão de acabamento da obra (Luxo, Primeira, Médio ou Econômico) antes de calcular a aprovação/Alvará.",
      );
      return;
    }
    if (!approvalGuidePreview.profile || approvalGuidePreview.baseValueM2 <= 0) {
      setProcessActionStatus(
        "A Prefeitura ainda não cadastrou o valor oficial do m² para este tipo de obra e padrão de acabamento.",
      );
      return;
    }
    if (!canAnalysisOperate || !ownsCurrentProcessStage) {
      setProcessActionStatus(
        "A Guia de Pagamento - Aprovação / Alvará deve ser encaminhada pela unidade responsável pela análise.",
      );
      return;
    }

    void runProcessAction(
      "generate-approval-guide",
      () => issuePaymentGuide(process.id, session.name, "aprovacao_final"),
      "Guia de Pagamento - Aprovação / Alvará emitida pelo cálculo oficial e encaminhada ao Financeiro. Ela já está disponível ao interessado.",
    );
  };

  const handleConfirmApprovalPayment = async () => {
    if (!approvalGuide || approvalGuide.status === "compensada") return;
    if (!canFinanceOperate) {
      setProcessActionStatus(
        "Somente o Setor Financeiro pode confirmar o pagamento da guia de aprovação/Alvará.",
      );
      return;
    }

    const ok = await runProcessAction(
      "confirm-approval-payment",
      () => markGuideAsPaid(process.id, session.name, "aprovacao_final"),
      "Pagamento da aprovação/Alvará confirmado. O processo retornou à Análise Urbanística e o Alvará pode seguir para assinatura.",
    );

    if (ok) {
      navigate(
        `/prefeitura/financeiro/protocolos?retorno=analise&processo=${encodeURIComponent(
          formatOfficialProcessNumber(process.protocol),
        )}`,
        { replace: true },
      );
    }
  };

  const handleIssueHabiteSeGuide = () => {
    if (!canFinanceOperate) {
      setProcessActionStatus("Somente o Setor Financeiro pode emitir a Guia de Habite-se.");
      return;
    }
    if (!habiteSeGuideRequest && !/financ/.test(normalizedCurrentFolder)) {
      setProcessActionStatus(
        "A vistoria / conferência ainda não encaminhou este Habite-se ao Financeiro.",
      );
      return;
    }
    if (habiteSeGuide) {
      setProcessActionStatus("A Guia de Habite-se já foi emitida para este processo.");
      return;
    }
    if (process.property.area <= 0) {
      setProcessActionStatus(
        "A área do imóvel não está informada no cadastro do processo. Corrija a ficha antes de emitir a guia.",
      );
      return;
    }
    if (!process.property.usage?.trim()) {
      setProcessActionStatus(
        "O tipo de construção/uso não está informado no cadastro do processo.",
      );
      return;
    }

    const selectedStandard = habiteSeConstructionStandardInput.trim();
    if (!selectedStandard) {
      setProcessActionStatus("Selecione o tipo de acabamento para calcular a taxa do Habite-se.");
      return;
    }
    if (
      !habiteSeGuidePreview.profile ||
      habiteSeGuidePreview.baseValueM2 <= 0 ||
      habiteSeGuidePreview.totalAmount <= 0
    ) {
      setProcessActionStatus(
        "A tabela oficial não possui valor para este tipo de construção e acabamento.",
      );
      return;
    }

    void runProcessAction(
      "issue-habite-se-guide",
      () =>
        issueHabiteSePaymentGuide({
          processId: process.id,
          constructionStandard: selectedStandard,
        }),
      `Guia de Habite-se emitida pelo cálculo oficial: ${process.property.area.toLocaleString(
        "pt-BR",
      )} m² × ${formatCurrency(habiteSeGuidePreview.baseValueM2)}/m² × ${habiteSeGuidePreview.aliquotPercent.toLocaleString(
        "pt-BR",
      )}% = ${formatCurrency(habiteSeGuidePreview.totalAmount)}.`,
    );
  };

  const handleSendHabiteSeGuideToProfessional = () => {
    if (!habiteSeGuide || habiteSeGuideSentExternally) return;
    if (!canFinanceOperate) {
      setProcessActionStatus("Somente o Setor Financeiro pode enviar a Guia de Habite-se ao profissional responsável.");
      return;
    }

    void runProcessAction(
      "send-habite-se-guide",
      () => shareHabiteSePaymentGuide(process.id),
      "Guia de Habite-se enviada ao profissional externo responsável pelo projeto e registrada na auditoria.",
    );
  };

  const handleConfirmHabiteSePayment = async () => {
    if (!habiteSeGuide || habiteSeGuide.status === "compensada") return;
    if (!canFinanceOperate) {
      setProcessActionStatus("Somente o Setor Financeiro pode confirmar o pagamento da Guia de Habite-se.");
      return;
    }
    if (!habiteSeGuideSentExternally) {
      setProcessActionStatus(
        "Envie primeiro a Guia de Habite-se ao profissional responsável. A confirmação do pagamento fica bloqueada até o envio ser registrado.",
      );
      return;
    }

    await runProcessAction(
      "confirm-habite-se-payment",
      () => markGuideAsPaid(process.id, session.name, "habite_se"),
      "Pagamento da Guia de Habite-se confirmado. O processo retornou ao Analista para emissão do Alvará de Habite-se.",
    );
  };

  const handleReviseConstructionGuide = async () => {
    if (!constructionGuide || !canManageIssuedIssGuide) return;
    const input = getConstructionGuideInput();
    if (!input) return;

    const ok = await runProcessAction(
      "revise-construction-guide",
      () => reviseIssProjectGuide(input),
      "Nova versão da Guia de ISSQN / Projeto gerada. Somente esta versão permanece vigente e ela precisa ser revisada antes de novo envio ao profissional.",
    );
    if (ok) {
      setIsEditingIssuedIssGuide(false);
    }
  };

  const handleSendConstructionGuideToProfessional = () => {
    if (!constructionGuide || constructionGuideSentExternally || isEditingIssuedIssGuide) return;
    void runProcessAction(
      "send-construction-guide",
      () => shareIssProjectGuide(process.id),
      "Guia liberada manualmente pelo analista e enviada ao profissional responsável.",
    );
  };

  const handleSendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (isProtocolTrackingOnly) {
      setProcessActionStatus("Este processo está em acompanhamento. O Protocolo não pode alterar a etapa de outro departamento.");
      return;
    }
    if (!isInternalRole(session.role)) {
      setProcessActionStatus("O profissional externo só pode responder solicitações abertas pela Prefeitura.");
      return;
    }
    if (!message.trim()) return;
    const ok = await runProcessAction(
      "message",
      () =>
        sendProcessMessage({
          processId: process.id,
          senderName: session.name,
          senderRole: session.role,
          audience: messageAudience,
          recipientName: messageRecipient === "todos" ? undefined : messageRecipient,
          message,
        }),
      "Mensagem registrada no processo.",
    );
    if (ok) setMessage("");
  };
  const handleCreateRequirement = async (event: FormEvent) => {
    event.preventDefault();
    if (isProtocolTrackingOnly) {
      setProcessActionStatus("Somente o departamento responsável pela etapa atual pode emitir exigências.");
      return;
    }
    if (!requirementTitle.trim() || !requirementDescription.trim() || !requirementDueDate) return;
    const ok = await runProcessAction(
      "requirement",
      () =>
        createRequirement({
          processId: process.id,
          title: requirementTitle,
          description: requirementDescription,
          dueDate: requirementDueDate,
          actor: session.name,
          targetName: externalRecipientName,
          visibility: requirementVisibility,
        }),
      "Exigência registrada no processo.",
    );
    if (ok) {
      setRequirementTitle("");
      setRequirementDescription("");
      setRequirementDueDate("");
    }
  };
  const handleDispatchSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isProtocolTrackingOnly) {
      setProcessActionStatus("O Protocolo está apenas acompanhando este processo e não pode despachá-lo nesta etapa.");
      return;
    }
    if (!currentFolder.trim() || !dispatchTo.trim() || !dispatchSubject.trim() || !dispatchDueDate) return;

    const selectedDestination = organizationDepartments.find(
      (department) => department.id === dispatchTo || department.name === dispatchTo,
    );
    if (!selectedDestination) {
      setProcessActionStatus("Selecione o destino diretamente no organograma municipal.");
      return;
    }

    if (
      requiresInitialUrbanAnalysisDispatch &&
      selectedDestination.id !== initialUrbanAnalysisDestination?.id
    ) {
      setProcessActionStatus(
        "Nesta etapa, o Habite-se deve sair do Protocolo diretamente para a Análise Urbanística.",
      );
      return;
    }

    const ok = await runProcessAction(
      "dispatch",
      () =>
        dispatchProcess({
          processId: process.id,
          actor: session.name,
          from: currentFolder.trim(),
          to: selectedDestination.name,
          subject: dispatchSubject.trim(),
          dueDate: dispatchDueDate,
          visibility: dispatchVisibility,
        }),
      `Processo encaminhado com sucesso para ${selectedDestination.name}. A nova unidade já recebeu o trâmite no fluxo oficial.`,
      { allowMunicipalAdmin: true },
    );
    if (ok) {
      setDispatchTo("");
      setDispatchSubject("");
      setDispatchDueDate(currentLocalDateValue());
      setDispatchVisibility("interno");
    }
  };
  const updateTransitVisibility = (visibility: ProcessTransitVisibility) => {
    void runProcessAction(
      "transit-visibility",
      () =>
        setProcessTransitVisibility({
          processId: process.id,
          actor: session.name,
          visibility,
        }),
      "Visibilidade de tramitação atualizada.",
    );
  };
  const openDocumentWorkspace = (documentId: string, forceAnalysis = false) => {
    const selectedDocument = process.documents.find((item) => item.id === documentId);
    if (!selectedDocument || openingDocumentId) return;

    const shouldAnalyze = forceAnalysis || canReviewDocuments;
    const route = shouldAnalyze ? "analisar" : "visualizar";
    const query = shouldAnalyze ? "?ferramenta=highlight" : "";
    const workspaceUrl =
      `${window.location.origin}${buildProcessPath(process)}/documentos/${documentId}/${route}${query}`;

    setOpeningDocumentId(documentId);
    setProcessActionStatus("");

    const warmedAccessUrl =
      documentAccessUrls[selectedDocument.id] ||
      selectedDocument.previewUrl ||
      "";
    if (warmedAccessUrl) {
      cacheDocumentWorkspaceAccessUrl(
        process.id,
        selectedDocument.id,
        warmedAccessUrl,
      );
    }

    // Abre diretamente a rota real da mesa documental. Não existe mais
    // about:blank, shell, skeleton ou página de preparação entre o clique e o PDF.
    const existingWorkspace = documentWorkspaceWindowRef.current;
    const openedTab =
      existingWorkspace && !existingWorkspace.closed
        ? existingWorkspace
        : window.open(workspaceUrl, "sigapro-document-workspace");

    if (!openedTab) {
      setProcessActionStatus(
        "O navegador bloqueou a guia do documento. Libere pop-ups para o SIGAPRO e tente novamente.",
      );
      setOpeningDocumentId("");
      return;
    }

    documentWorkspaceWindowRef.current = openedTab;

    if (existingWorkspace && !existingWorkspace.closed) {
      openedTab.location.replace(workspaceUrl);
    }

    openedTab.opener = null;
    openedTab.focus();
    window.setTimeout(() => setOpeningDocumentId(""), 180);
  };

  const openViewer = (documentId: string) => void openDocumentWorkspace(documentId, false);
  const openAnalysisViewer = (documentId: string) => void openDocumentWorkspace(documentId, true);
  const handleViewerClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!canAnnotateViewer || !viewerAreaRef.current) return;
    const rect = viewerAreaRef.current.getBoundingClientRect();
    setAnnotationPoint({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    });
  };
  const handleRecoverStoredDocument = async (document: typeof process.documents[number]) => {
    if (!canRecoverStoredDocuments) {
      setProcessActionStatus("Este perfil não pode recuperar documentos já enviados ao armazenamento.");
      return;
    }
    const objectKey = recoverableSelection[document.id];
    const candidate = recoverableFiles.find((file) => file.objectKey === objectKey);
    if (!candidate) {
      setProcessActionStatus("Escolha um upload anterior para recuperar.");
      return;
    }

    const ok = await runProcessAction(
      `recover-document-${document.id}`,
      async () => {
        const result = await appendProcessDocuments(
          process.id,
          [
            {
              id: `doc-${crypto.randomUUID()}`,
              label: document.label,
              required: document.required,
              uploaded: true,
              signed: false,
              reviewStatus: "pendente",
              annotations: [],
              version: Math.max(1, Number(document.version || 0) + 1),
              source: "profissional",
              fileName: candidate.fileName,
              filePath: candidate.objectKey,
              mimeType: inferMimeType(candidate.fileName),
              sizeLabel: formatBytes(candidate.size),
              fileSizeBytes: candidate.size,
            },
          ],
          session.name,
        );

        if (Number(result.synced || 0) !== 1) {
          throw new Error("O arquivo foi localizado, mas não foi confirmado no processo.");
        }
      },
      `${document.label} recuperado do armazenamento e vinculado ao processo.`,
    );

    if (ok) {
      setRecoverableFiles((current) => current.filter((file) => file.objectKey !== objectKey));
      setRecoverableSelection((current) => {
        const next = { ...current };
        delete next[document.id];
        return next;
      });
    }
  };

  const handleUploadMissingDocument = async (document: typeof process.documents[number]) => {
    if (!canUploadProcessDocuments) {
      setProcessActionStatus("Somente o profissional externo pode enviar documentos para o processo.");
      return;
    }
    const selected = documentUploads[document.id]?.[0];
    if (!selected?.file) {
      setProcessActionStatus("Selecione um arquivo antes de enviar.");
      return;
    }

    const ok = await runProcessAction(
      `upload-document-${document.id}`,
      async () => {
        const uploaded = await uploadFileToStorage({
          bucket: "process-documents",
          tenantId: effectiveScopeId,
          userId: session.id,
          file: selected.file!,
          folder: "protocolos",
        });

        await appendProcessDocuments(
          process.id,
          [
            {
              id: `doc-${crypto.randomUUID()}`,
              label: document.label,
              required: document.required,
              uploaded: true,
              signed: false,
              reviewStatus: "pendente",
              annotations: [],
              version: Math.max(1, Number(document.version || 0) + 1),
              source: isInternalRole(session.role) ? "prefeitura" : "profissional",
              fileName: selected.fileName,
              filePath: uploaded.path,
              mimeType: selected.mimeType,
              sizeLabel: selected.sizeLabel,
              fileSizeBytes: selected.file.size,
              previewUrl: uploaded.publicUrl || undefined,
            },
          ],
          session.name,
        );
      },
      `${document.label} anexado ao processo e disponibilizado para a análise urbanística.`,
    );

    if (ok) {
      setDocumentUploads((current) => {
        const next = { ...current };
        delete next[document.id];
        return next;
      });
    }
  };

  const handleRequirementAttachment = async (item: typeof process.requirements[number]) => {
    if (!canAttachToRequirement(item)) {
      setProcessActionStatus("O envio de anexos só fica disponível enquanto o comunique-se estiver aberto.");
      return;
    }
    const selected = requirementUploads[item.id]?.[0];
    if (!selected?.file) {
      setProcessActionStatus("Selecione um arquivo antes de anexar.");
      return;
    }

    const ok = await runProcessAction(
      `requirement-upload-${item.id}`,
      async () => {
        const uploaded = await uploadFileToStorage({
          bucket: "process-documents",
          tenantId: effectiveScopeId,
          userId: session.id,
          file: selected.file!,
          folder: "comunique-se",
        });

        await appendProcessDocuments(
          process.id,
          [{
            id: `doc-${crypto.randomUUID()}`,
            label: `Comunique-se: ${item.title}`,
            required: false,
            uploaded: true,
            signed: false,
            reviewStatus: "pendente",
            annotations: [],
            version: 1,
            source: isInternalRole(session.role) ? "prefeitura" : "profissional",
            fileName: selected.fileName,
            filePath: uploaded.path,
            mimeType: selected.mimeType,
            sizeLabel: selected.sizeLabel,
            fileSizeBytes: selected.file.size,
            previewUrl: uploaded.publicUrl || undefined,
          }],
          session.name,
        );
      },
      "Arquivo anexado ao comunique-se.",
    );

    if (ok) {
      setRequirementUploads((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    }
  };

  const handleSaveAnnotation = async () => {
    if (!viewerDocument || !annotationPoint || !annotationDraft.trim()) return;
    const ok = await runProcessAction(
      "annotation",
      () =>
        addDocumentAnnotation(process.id, viewerDocument.id, {
          kind: "text",
          page: 1,
          x: annotationPoint.x,
          y: annotationPoint.y,
          width: 0,
          height: 0,
          note: annotationDraft,
          author: session.name,
        }),
      "Anotação salva no documento.",
    );
    if (ok) {
      setAnnotationDraft("");
      setAnnotationPoint(null);
    }
  };

  return (
    <PortalFrame
      eyebrow={formatProfessionalProcessType(process.type)}
      title={formatOfficialProcessLabel({ protocol: process.protocol, type: process.type })}
      focusMode
    >
      <PageShell className="sig-process-detail-premium !max-w-none !px-3 sm:!px-4 lg:!px-5 2xl:!px-6">
      <PageHero
        eyebrow="Painel do processo"
        title={formatOfficialProcessLabel({ protocol: process.protocol, type: process.type })}
        description={
          isExternalProcessViewer
            ? "Acompanhe seu protocolo, seus documentos, exigências, pagamentos liberados e o andamento público do processo."
            : "Acompanhe situação, documentos, comunicações, análise técnica e financeiro em um único painel institucional."
        }
        icon={Workflow}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <MarkerSelector
              processId={process.id}
              tags={process.tags}
              actor={session.name}
              subjectLabel="processo"
              triggerClassName="h-9"
            />
            {isExternalProcessViewer ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              onClick={() => navigate(processExitPath)}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair do processo
            </Button>
          </div>
        }
      />
      {session.role === "prefeitura_admin" ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-500/30 dark:bg-sky-950/30 dark:text-sky-200">
          <p className="font-semibold">Governança administrativa da Prefeitura</p>
          <p className="mt-1 leading-6">
            O Administrador acompanha todo o processo e pode realizar o encaminhamento institucional pelo organograma. Aprovação técnica, baixa financeira e demais atos especializados continuam restritos aos setores competentes.
          </p>
        </div>
      ) : null}
      {isProtocolTrackingOnly ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <p className="font-semibold">Modo acompanhamento do Protocolo</p>
          <p className="mt-1 leading-6">
            Este processo está sob responsabilidade de outro departamento. O Protocolo pode acompanhar apenas a tramitação e o status geral, sem acessar documentos técnicos, análise interna, financeiro ou executar ações da etapa atual.
          </p>
        </div>
      ) : null}
      {processActionStatus ? (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            /não foi|erro|falha|indisponível|sem acesso/i.test(processActionStatus)
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {processActionStatus}
        </div>
      ) : null}

      <MunicipalOrganogramBar
        municipalityId={effectiveScopeId}
        departmentHint={currentFolder}
        title="Organograma do processo"
        description="A unidade atual aparece dentro da hierarquia oficial da Prefeitura. O mesmo organograma é usado para escolher o destino dos despachos."
        showLink={false}
      />

      <PageStatsRow className="sig-process-stats">
        <StatCard label="Etapa atual" value={currentFlowStatusLabel} description={displayOrganizationPath} icon={Workflow} tone="blue" valueClassName="text-xl md:text-2xl" />
        <StatCard label="Documentos enviados" value={String(uploadedCount)} description="Arquivos presentes no processo" icon={FileStack} tone="emerald" />
        <StatCard label="Exigências visíveis" value={String(visibleRequirements.length)} description="Pendências e devolutivas desta vista" icon={ShieldAlert} tone="amber" />
        <StatCard label="Guia inicial" value={protocolGuide ? formatCurrency(protocolGuide.amount) : "Não emitida"} description="Controle financeiro do protocolo" icon={FileKey2} tone="default" valueClassName="text-xl md:text-2xl" />
      </PageStatsRow>
      <Card data-process-flow-card="true" className={`${cardShell} sig-process-flow-card`}>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-lg font-medium text-slate-900">{formatOfficialProcessNumber(process.protocol)}</p>
            <Badge variant="outline" className={statusTone(process.status)}>
              {currentFlowStatusLabel}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {isExternalProcessViewer ? "Etapa atual" : "Unidade responsável"}:{" "}
            <span className="font-medium text-slate-700 dark:text-slate-200">{displayOrganizationPath}</span>
            {" • "}Entrada: {process.timeline[0]?.at || protocolGuide?.issuedAt || "sem data"}
          </p>

          <div data-process-flow-track="true" className="mt-6 rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-5 shadow-inner dark:border-slate-700 dark:bg-slate-950/55">
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,130px),1fr))]">
              {flowSteps.map((step, index) => (
                <div key={step.key} className="relative">
                  {index < flowSteps.length - 1 ? (
                    <div
                      className={`absolute left-[52%] top-5 hidden h-px w-full md:block ${
                        step.state === "done" ? "bg-emerald-400 dark:bg-emerald-600" : "bg-slate-300 dark:bg-slate-700"
                      }`}
                    />
                  ) : null}
                  <div className="relative z-10 flex flex-col items-center text-center">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold shadow-sm ${
                        step.state === "done"
                          ? "border-emerald-500 bg-emerald-600 text-white"
                          : step.state === "current"
                            ? "border-sky-500 bg-sky-600 text-white ring-4 ring-sky-100 dark:ring-sky-950"
                            : "border-slate-300 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                      }`}
                    >
                      {step.state === "done" ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                    </div>
                    <p
                      className={`mt-3 text-[11px] font-semibold ${
                        step.state === "current"
                          ? "text-sky-700 dark:text-sky-300"
                          : step.state === "done"
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-slate-500 dark:text-slate-400"
                      }`}
                    >
                      {step.label}
                    </p>
                    {step.state === "current" ? (
                      <span className="mt-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-sky-700 dark:bg-sky-950/70 dark:text-sky-300">
                        Agora
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div
            data-process-tabbar="true"
            className="mt-4 grid gap-2 rounded-[16px] border border-slate-200 bg-slate-100/90 p-1.5 shadow-inner dark:border-slate-700 dark:bg-slate-900/80 [grid-template-columns:repeat(auto-fit,minmax(min(100%,118px),1fr))]"
          >
            {tabItems.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setProcessTab(tab.key)}
                  className={`relative min-h-11 rounded-[12px] border px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
                    isActive
                      ? "border-[#0b5e93] bg-[linear-gradient(135deg,#0b4f7a_0%,#0b6fa8_100%)] !text-white shadow-[0_8px_18px_rgba(11,94,147,0.26)] [color:#fff] [-webkit-text-fill-color:#fff]"
                      : "border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-white hover:text-slate-950 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 grid items-stretch gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,315px),1fr))]">
        <Card data-process-summary-card="true" data-summary-tone="blue" className={`${cardShell} sig-premium-summary-card sig-summary-blue h-full`}>
          <CardContent className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={statusTone(process.status)}>
                {statusLabel(process.status)}
              </Badge>
              <Badge variant="outline" className="rounded-full">
                {process.type}
              </Badge>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600" title={process.address}>{process.address}</p>
            <p className="mt-2 text-sm leading-6 text-slate-500" title={`Protocolo oficial ${process.externalProtocol} - ${officialMunicipalityLabel(tenant?.name || municipalityName)}`}>
              Protocolo oficial {process.externalProtocol} - {officialMunicipalityLabel(tenant?.name || municipalityName)}
            </p>
          </CardContent>
        </Card>
        <Card data-process-summary-card="true" data-summary-tone="emerald" className={`${cardShell} sig-premium-summary-card sig-summary-emerald h-full`}>
          <CardContent className="p-5">
            <p className="sig-label">
              {approvalGuide
                ? "Guia de aprovação / Alvará"
                : constructionGuide
                  ? "Guia de ISSQN / Projeto"
                  : "Guia de protocolo"}
            </p>
            <p className="sig-fit-title mt-3 text-lg font-medium leading-7 text-slate-900" title={displayGuide?.code || "Sem guia"}>{displayGuide?.code || "Sem guia"}</p>
            <p className="mt-2 text-base font-medium leading-6 text-slate-700">{displayGuide ? formatCurrency(displayGuide.amount) : "Não emitida"}</p>
            <p className="sig-field-help sig-fit-copy mt-1" title={tenantSettings?.beneficiarioArrecadacao || tenant?.name || ""}>{tenantSettings?.beneficiarioArrecadacao || tenant?.name}</p>
            {displayGuide ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  disabled={Boolean(guideBillingBusyKey)}
                  onClick={() => void printGuide(displayGuide.kind, false, displayGuide.code)}
                >
                  {guideBillingBusyKey ? (
                                  <Clock3 className="mr-2 h-4 w-4 animate-pulse" />
                                ) : (
                                  <Eye className="mr-2 h-4 w-4" />
                                )}
                                {guideBillingBusyKey ? "Preparando guia..." : "Visualizar guia"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  disabled={Boolean(guideBillingBusyKey)}
                  onClick={() => void printGuide(displayGuide.kind, true, displayGuide.code)}
                >
                  {guideBillingBusyKey ? (
                                  <Clock3 className="mr-2 h-4 w-4 animate-pulse" />
                                ) : (
                                  <Printer className="mr-2 h-4 w-4" />
                                )}
                                {guideBillingBusyKey ? "Preparando guia..." : "Imprimir guia"}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card data-process-summary-card="true" data-summary-tone="violet" className={`${cardShell} sig-premium-summary-card sig-summary-violet h-full`}>
          <CardContent className="p-5">
            <p className="sig-label">Documentos</p>
            <p className="mt-3 text-lg font-medium leading-7 text-slate-900 dark:text-slate-100">
              {uploadedCount}/{process.documents.length}
            </p>
            <p className="sig-field-help mt-2">Checklist com versão, nome do arquivo e assinatura</p>
          </CardContent>
        </Card>

        {isHabiteSeProcess || currentFlowIndex >= 4 || constructionPermit || (!isExternalProcessViewer && canAnalysisOperate) ? (
          <Card data-process-summary-card="true" data-summary-tone="sky" data-permit-summary-card="true" data-surface="semantic-card" data-tone="sky" className={`${cardShell} sig-premium-summary-card sig-summary-sky h-full border-sky-200 bg-[linear-gradient(145deg,#f7fbff_0%,#e7f5ff_100%)] shadow-[0_16px_38px_rgba(14,165,233,0.12)] dark:border-sky-500/35 dark:bg-[linear-gradient(145deg,#102a42_0%,#0b2033_100%)]`}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="sig-label">{isHabiteSeProcess ? "Habite-se" : "Alvará de Construção"}</p>
                  <p className="mt-3 text-lg font-bold leading-7 text-slate-950 dark:text-white">
                    {isHabiteSeProcess
                      ? formatOfficialProcessNumber(process.protocol)
                      : constructionPermit?.permitNumber || "Em preparação"}
                  </p>
                </div>
                <span data-summary-icon="permit" className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-200 bg-sky-100 text-sky-800 shadow-[0_8px_18px_rgba(14,165,233,0.14)] dark:border-sky-500/40 dark:bg-sky-950/70 dark:text-sky-100">
                  <FileBadge2 className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {isHabiteSeProcess
                  ? "Protocolo próprio para análise da conclusão da obra, separado da aprovação e do Alvará."
                  : constructionPermit?.status === "emitido"
                    ? "Documento final emitido e disponível no processo."
                    : constructionPermit?.status === "assinatura_manual"
                      ? "Alvará preenchido e preparado para assinatura manual. Os dados oficiais já estão salvos no processo."
                      : constructionPermit?.status === "aguardando_diretor"
                        ? "Alvará preenchido e encaminhado para assinatura da Diretoria."
                        : constructionPermit
                          ? "Alvará preenchido e salvo como rascunho oficial. Revise antes de encaminhar para assinatura."
                          : isExternalProcessViewer
                            ? "A Prefeitura está preparando o Alvará desta obra."
                            : "Preencha os dados do Alvará, revise a prévia e siga para as assinaturas."}
              </p>
              <Button
                type="button"
                data-primary-action="process"
                className="mt-4 min-h-11 w-full rounded-xl bg-[linear-gradient(135deg,#075985_0%,#0284c7_100%)] px-4 font-bold !text-white shadow-[0_10px_24px_rgba(7,89,133,0.24)] hover:brightness-105 [&_*]:!text-white"
                onClick={() => setProcessTab("alvara")}
              >
                {isHabiteSeProcess
                  ? "Abrir workflow do Habite-se"
                  : constructionPermit?.status === "emitido"
                    ? "Abrir Alvará"
                    : constructionPermit?.status === "assinatura_manual"
                      ? "Abrir / conferir Alvará"
                      : constructionPermit?.status === "aguardando_diretor"
                        ? "Abrir / acompanhar assinatura"
                        : constructionPermit
                          ? "Revisar Alvará"
                          : isExternalProcessViewer
                            ? "Acompanhar Alvará"
                            : "Preencher Alvará"}
              </Button>
            </CardContent>
          </Card>
        ) : null}
        {!isExternalProcessViewer ? (
          <Card data-process-summary-card="true" data-summary-tone="amber" className={`${cardShell} sig-premium-summary-card sig-summary-amber h-full`}>
            <CardContent className="p-5">
              <p className="sig-label">SLA atual</p>
              <p className="mt-3 text-lg font-medium leading-7 text-slate-900" title={effectiveSlaStage}>{effectiveSlaStage}</p>
              <p className="sig-field-help mt-2" title={`Prazo ${process.sla.dueDate} - ${process.sla.hoursRemaining}h restantes`}>Prazo {process.sla.dueDate} - {process.sla.hoursRemaining}h restantes</p>
              {process.sla.breached ? <p className="mt-2 text-sm font-medium text-rose-600">Prazo estourado</p> : null}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {(activeTab === "resumo" || activeTab === "historico") ? (
      <div className="mt-4 grid items-stretch gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))]">
        <Card className={`${cardShell} h-full`}>
          <CardContent className="p-5">
            {isExternalProcessViewer ? (
              <div>
                <p className="sig-label">Andamento do processo</p>
                <p className="mt-2 text-base font-medium text-slate-900 dark:text-slate-100">
                  {currentFlowStatusLabel}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  Aqui aparecem apenas informações do seu protocolo e movimentações liberadas para acompanhamento externo.
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="sig-label">Controle de tramitação</p>
                  <p className="mt-2 line-clamp-2 text-base font-medium text-slate-900">Processo com tramitação entre setores e pastas institucionais</p>
                  <p className="mt-2 text-sm text-slate-500">
                    A unidade atual é <span className="font-medium text-slate-700">{currentFolder}</span>. Os despachos formais mantêm a conversa entre os setores responsáveis.
                  </p>
                </div>
                <div className="grid min-w-0 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,120px),1fr))] xl:min-w-[320px]">
                  <div>
                    <p className="sig-label">Unidade atual</p>
                    <p className="sig-fit-title mt-2 text-sm font-medium leading-6 text-slate-900" title={currentFolder}>{currentFolder}</p>
                  </div>
                  <div>
                    <p className="sig-label">Trâmites</p>
                    <p className="mt-2 text-sm font-medium text-slate-900">{process.dispatches.length}</p>
                  </div>
                  <div>
                    <p className="sig-label">Último destino</p>
                    <p className="sig-fit-title mt-2 text-sm font-medium leading-6 text-slate-900" title={process.dispatches[0]?.to || currentFolder}>{process.dispatches[0]?.to || currentFolder}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {!isExternalProcessViewer && canAnalysisOperate && ownsCurrentProcessStage ? (
          <Card className={`${cardShell} h-full`}>
            <CardContent className="p-5">
              <p className="sig-label">Acesso externo ao fluxo</p>
              <p className="mt-2 text-base font-medium text-slate-900">
                {processTransitVisibility === "completo" ? "Acompanhamento completo liberado" : "Trâmites internos restritos"}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Defina se o acesso externo pode acompanhar despachos institucionais ou somente o andamento público.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  variant={processTransitVisibility === "completo" ? "default" : "outline"}
                  className={`rounded-full ${processTransitVisibility === "completo" ? "bg-slate-950 hover:bg-slate-900" : ""}`}
                  onClick={() => updateTransitVisibility("completo")}
                >
                  Fluxo completo
                </Button>
                <Button
                  type="button"
                  variant={processTransitVisibility === "restrito" ? "default" : "outline"}
                  className={`rounded-full ${processTransitVisibility === "restrito" ? "bg-slate-950 hover:bg-slate-900" : ""}`}
                  onClick={() => updateTransitVisibility("restrito")}
                >
                  Restringir trâmites
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
      ) : null}

      {activeTab !== "resumo" ? (
      <div className={`mt-5 grid min-w-0 items-start gap-5 ${useSplitDetailLayout ? "xl:grid-cols-[minmax(0,1.38fr)_minmax(320px,0.86fr)] min-[1600px]:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.82fr)]" : "grid-cols-1"}`}>
        {showPrimaryDetailColumn ? (
        <div className="grid min-w-0 content-start auto-rows-max gap-6 self-start">
          {activeTab === "imovel" && (
            <ProcessIdentityPanel
              process={process}
              ownerProfile={linkedOwnerProfile}
              technicalProfile={linkedTechnicalProfile}
              constructionStandardLabel={constructionStandardLabel}
              canViewFullIdentity={canViewCompleteCadastro}
            />
          )}

          {activeTab === "documentos" && (
          <Card
            data-process-document-workspace="true"
            className={`${cardShell} overflow-hidden border-slate-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.08)]`}
          >
            <CardHeader id="sig-process-document-command-center" data-process-command-center="true" data-force-card-contrast="dark" data-premium-inverse-surface="true" data-premium-process-dark-header="documents" data-process-dark-header="true" data-surface-tone="dark" data-surface="fixed-dark" className="sig-process-dark-surface-v9 sig-premium-command-surface border-b border-slate-700/40 bg-[linear-gradient(135deg,#071525_0%,#123a58_58%,#1f6489_100%)] px-5 py-5 !text-white shadow-inner md:px-6 [&_h1]:!text-white [&_h2]:!text-white [&_h3]:!text-white [&_p]:!text-white [&_span]:!text-white [&_svg]:!text-white">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 items-start gap-4">
                  <div data-premium-header-icon="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-sky-300/35 bg-[#0b5e93] !text-white shadow-[0_8px_20px_rgba(2,132,199,0.25)]">
                    <FileStack className="h-6 w-6 !text-white" />
                  </div>
                  <div data-command-header-copy="true" className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] !text-sky-100">
                      Central documental do processo
                    </p>
                    <CardTitle className="mt-1 text-xl font-bold !text-white">
                      {canUploadProcessDocuments ? "Documentos do protocolo" : "Documentos enviados pelo profissional"}
                    </CardTitle>
                    <p className="mt-1 max-w-3xl text-sm leading-6 !text-slate-200">
                      {canUploadProcessDocuments
                        ? "Envie e acompanhe os documentos obrigatórios deste protocolo."
                        : isExternalProcessViewer
                          ? "Acompanhe os arquivos enviados, o resultado das conferências e as exigências vinculadas."
                          : "Confira, visualize e analise tecnicamente os documentos encaminhados pelo profissional responsável."}
                    </p>

                    {currentOrganizationTrail.length > 0 ? (
                      <div data-dark-organogram-trail="true" className="mt-3 flex flex-wrap items-center gap-2">
                        {currentOrganizationTrail.map((unit, index) => (
                          <div key={`document-org-${unit.code}-${unit.name}`} className="flex items-center gap-2">
                            {index > 0 ? (
                              <span aria-hidden="true" className="!text-sky-200/80">›</span>
                            ) : null}
                            <span
                              data-dark-organogram-code="true"
                              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[10px] font-black tracking-[0.10em] !text-white shadow-sm backdrop-blur-sm"
                              title={unit.name}
                            >
                              <span className="!text-white">{unit.code}</span>
                              <span className="hidden font-semibold tracking-normal !text-sky-100 sm:inline">
                                {unit.name}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[470px]">
                  <div data-command-metric="blue" className="sig-command-metric rounded-2xl border border-sky-300/35 bg-[#0b5e93] px-3 py-3 shadow-[0_8px_20px_rgba(2,132,199,0.20)]">
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] !text-sky-100">Enviados</p>
                    <p className="mt-1 text-xl font-bold !text-white">{uploadedCount}/{process.documents.length}</p>
                  </div>
                  <div data-command-metric="emerald" className="sig-command-metric rounded-2xl border border-emerald-300/35 bg-[#0b6b50] px-3 py-3 shadow-[0_8px_20px_rgba(5,150,105,0.20)]">
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] !text-emerald-100">Aprovados</p>
                    <p className="mt-1 text-xl font-bold !text-emerald-50">{approvedDocumentCount}</p>
                  </div>
                  <div data-command-metric="amber" className="sig-command-metric rounded-2xl border border-amber-300/40 bg-[#8a5b08] px-3 py-3 shadow-[0_8px_20px_rgba(217,119,6,0.20)]">
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] !text-amber-100">Pendências</p>
                    <p className="mt-1 text-xl font-bold !text-amber-50">{communicateDocumentCount + awaitingReviewDocumentCount}</p>
                  </div>
                  <div data-command-metric="cyan" className="sig-command-metric rounded-2xl border border-cyan-300/35 bg-[#0a6c86] px-3 py-3 shadow-[0_8px_20px_rgba(8,145,178,0.20)]">
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] !text-cyan-100">Conferência</p>
                    <p className="mt-1 text-xl font-bold !text-white">{documentReviewProgress}%</p>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center">
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] !text-slate-200">
                    <span>Entrega documental</span>
                    <span>{documentDeliveryProgress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-sky-300 transition-[width]"
                      style={{ width: `${documentDeliveryProgress}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] !text-slate-200">
                    <span>Conferência técnica</span>
                    <span>{documentReviewProgress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-emerald-300 transition-[width]"
                      style={{ width: `${documentReviewProgress}%` }}
                    />
                  </div>
                </div>
                {canRecoverStoredDocuments ? (
                  <Button
                    type="button"
                    variant="outline"
                    data-dark-header-action="true"
                    className="h-10 rounded-full border-white/30 bg-[#0a3552] px-4 !text-white shadow-[0_8px_18px_rgba(2,30,50,0.20)] hover:bg-[#0c456b] hover:!text-white [&_*]:!text-white"
                    disabled={recoverableLoading}
                    onClick={() => {
                      setRecoverableStatus("");
                      setRecoverableFiles([]);
                      const reload = async () => {
                        setRecoverableLoading(true);
                        try {
                          const files = await listRecoverableProcessFiles({ processId: process.id });
                          const alreadyLinked = new Set(
                            process.documents
                              .map((document) => document.filePath)
                              .filter((value): value is string => Boolean(value)),
                          );
                          const available = files.filter((file) => !alreadyLinked.has(file.objectKey));
                          setRecoverableFiles(available);
                          setRecoverableStatus(
                            available.length > 0
                              ? `${available.length} upload(s) anterior(es) encontrado(s).`
                              : "Nenhum upload anterior disponível para recuperação.",
                          );
                        } catch (error) {
                          setRecoverableStatus(
                            error instanceof Error ? error.message : "Falha ao procurar uploads anteriores.",
                          );
                        } finally {
                          setRecoverableLoading(false);
                        }
                      };
                      void reload();
                    }}
                  >
                    {recoverableLoading ? "Procurando..." : "Buscar uploads anteriores"}
                  </Button>
                ) : null}
              </div>
            </CardHeader>

            <CardContent
              data-process-document-content="true"
              className="space-y-4 p-5 md:p-6"
            >
              {(!canUploadProcessDocuments && pendingExternalDocumentCount > 0) || recoverableStatus ? (
                <div className="grid gap-2 lg:grid-cols-2">
                  {!canUploadProcessDocuments && pendingExternalDocumentCount > 0 ? (
                    <div
                      data-process-document-alert="pending"
                      className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800"
                    >
                      {pendingExternalDocumentCount} item(ns) ainda aguardam envio do profissional.
                    </div>
                  ) : <div />}
                  {canRecoverStoredDocuments && recoverableStatus ? (
                    <div
                      data-process-document-alert="info"
                      className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-800"
                    >
                      {recoverableStatus}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {canReviewDocuments ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div data-surface="semantic-card" data-tone="emerald" className="sig-document-kpi rounded-2xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
                          Aprovados
                        </p>
                        <p className="mt-1 text-2xl font-bold text-emerald-900 dark:text-emerald-100">
                          {approvedDocumentCount}
                        </p>
                      </div>
                      <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                    </div>
                  </div>

                  <div data-surface="semantic-card" data-tone="amber" className="sig-document-kpi rounded-2xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800 dark:text-amber-300">
                          Comunique-se
                        </p>
                        <p className="mt-1 text-2xl font-bold text-amber-950 dark:text-amber-100">
                          {communicateDocumentCount}
                        </p>
                      </div>
                      <ShieldAlert className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                    </div>
                  </div>

                  <div data-surface="semantic-card" data-tone="sky" className="sig-document-kpi rounded-2xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700 dark:text-sky-300">
                          Aguardando análise
                        </p>
                        <p className="mt-1 text-2xl font-bold text-sky-950 dark:text-sky-100">
                          {awaitingReviewDocumentCount}
                        </p>
                      </div>
                      <Clock3 className="h-6 w-6 text-sky-600 dark:text-sky-400" />
                    </div>
                  </div>

                  <div data-surface="semantic-card" data-tone="neutral" className="sig-document-kpi rounded-2xl border p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                      Progresso da conferência
                    </p>
                    <p className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">
                      {reviewedDocumentCount}/{uploadedCount}
                    </p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div
                        className="h-full rounded-full bg-emerald-600 transition-[width]"
                        style={{
                          width: `${uploadedCount > 0 ? Math.min(100, Math.round((reviewedDocumentCount / uploadedCount) * 100)) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {!canUploadProcessDocuments && visibleDocumentRows.length === 0 ? (
                <div
                  data-process-document-empty="true"
                  className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center"
                >
                  <FileStack className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="mt-3 font-semibold text-slate-900">
                    Nenhum documento foi enviado pelo profissional até o momento.
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    O analista não anexa documentos em nome do profissional. Assim que o responsável externo enviar os arquivos, eles aparecerão automaticamente aqui para análise.
                  </p>
                </div>
              ) : null}

              {visibleDocumentRows.map((document, index) => {
                const reviewVisual = getDocumentReviewVisual(document);
                const isApproved = document.reviewStatus === "aprovado";
                const hasCommunique = document.reviewStatus === "rejeitado";
                const documentMarkerTags = documentMarkers.getTags(process.id, document.id);

                return (
                  <div
                    key={document.id}
                    data-process-document-card="true"
                    data-force-card-contrast="adaptive"
                    data-document-state={
                      isApproved
                        ? "approved"
                        : hasCommunique
                          ? "issue"
                          : document.uploaded
                            ? "review"
                            : "missing"
                    }
                    data-surface="adaptive-card"
                    className={`group relative overflow-hidden rounded-[22px] border bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_18px_42px_rgba(15,23,42,0.12)] dark:bg-slate-900 dark:shadow-[0_14px_34px_rgba(0,0,0,0.28)] [contain:layout_style] ${reviewVisual.card}`}
                  >
                    <div
                      className={`absolute inset-y-0 left-0 w-1 ${
                        isApproved
                          ? "bg-emerald-500"
                          : hasCommunique
                            ? "bg-amber-500"
                            : document.uploaded
                              ? "bg-sky-500"
                              : "bg-slate-300 dark:bg-slate-700"
                      }`}
                    />

                    <div className="flex flex-wrap items-start justify-between gap-4 pl-2">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400">
                            Documento {String(index + 1).padStart(2, "0")} de {String(visibleDocumentRows.length).padStart(2, "0")}
                          </span>
                          <Badge variant="outline" className={`rounded-full font-semibold ${reviewVisual.badge}`}>
                            {isApproved ? <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> : hasCommunique ? <ShieldAlert className="mr-1 h-3.5 w-3.5" /> : <Clock3 className="mr-1 h-3.5 w-3.5" />}
                            {reviewVisual.label}
                          </Badge>
                        </div>

                        {document.uploaded ? (
                          <button
                            type="button"
                            onClick={() => openViewer(document.id)}
                            className="block max-w-full text-left font-semibold text-slate-950 hover:text-sky-700 hover:underline dark:text-slate-100 dark:hover:text-sky-300"
                            title={canReviewDocuments ? "Abrir documento na mesa de análise" : "Abrir documento"}
                          >
                            {document.label}
                          </button>
                        ) : (
                          <p className="font-semibold text-slate-950 dark:text-slate-100">{document.label}</p>
                        )}

                        <button
                          type="button"
                          disabled={!document.uploaded}
                          onClick={() => document.uploaded && openViewer(document.id)}
                          className="mt-1 block max-w-full truncate text-left text-sm text-slate-500 enabled:hover:text-sky-700 enabled:hover:underline disabled:cursor-default dark:text-slate-400 dark:enabled:hover:text-sky-300"
                          title={document.uploaded ? (canReviewDocuments ? "Abrir documento na mesa de análise" : "Abrir documento") : undefined}
                        >
                          {document.fileName || "Arquivo ainda não enviado"}
                          {document.mimeType ? ` • ${document.mimeType}` : ""}
                          {document.sizeLabel ? ` • ${document.sizeLabel}` : ""}
                        </button>

                        {document.uploaded ? (
                          <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                            Origem: {document.source === "profissional" ? "Profissional responsável" : document.source}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <MarkerSelector
                          tags={documentMarkerTags}
                          actor={session.name}
                          subjectLabel="documento"
                          triggerClassName="h-8"
                          onApplyMarker={(label, color) =>
                            documentMarkers.addMarker(process.id, document.id, label, color)
                          }
                          onRemoveMarker={(tag) =>
                            documentMarkers.removeMarker(process.id, document.id, tag)
                          }
                        />
                        <Badge variant="outline" className="rounded-full border-slate-200 bg-white/70 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                          {document.required ? "Obrigatório" : "Opcional"}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={`rounded-full ${
                            document.uploaded
                              ? "border-slate-200 bg-white/70 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300"
                              : "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-500/50 dark:bg-amber-950/60 dark:text-amber-300"
                          }`}
                        >
                          {document.uploaded ? "Enviado" : "Pendente de envio"}
                        </Badge>

                        {document.uploaded && canReviewDocuments ? (
                          <button
                            type="button"
                            onClick={() => openAnalysisViewer(document.id)}
                            disabled={Boolean(openingDocumentId)}
                            data-primary-action="document" className="sig-primary-document-action inline-flex h-10 items-center gap-2 rounded-full bg-[linear-gradient(135deg,#082f49_0%,#075985_48%,#0f78b8_100%)] px-5 text-[12px] font-bold !text-white shadow-[0_10px_24px_rgba(7,89,133,0.28)] transition hover:-translate-y-px hover:brightness-110 [&_*]:!text-white"
                          >
                            <PencilLine className="h-4 w-4" />
                            {openingDocumentId === document.id ? "Abrindo análise..." : "Abrir documento e analisar"}
                          </button>
                        ) : !canReviewDocuments && (document.previewUrl || document.uploaded) ? (
                          <button
                            type="button"
                            onClick={() => openViewer(document.id)}
                            disabled={Boolean(openingDocumentId)}
                            data-primary-action="document" className="sig-primary-document-action inline-flex h-9 items-center gap-2 rounded-full bg-[linear-gradient(135deg,#0b5e93_0%,#0f78b8_100%)] px-4 text-[11px] font-bold !text-white shadow-[0_8px_20px_rgba(14,116,181,0.24)] transition hover:-translate-y-px hover:brightness-105 [&_*]:!text-white"
                          >
                            <Maximize2 className="h-4 w-4" />
                            {openingDocumentId === document.id ? "Abrindo..." : "Abrir documento"}
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {canRecoverStoredDocuments && !document.uploaded ? (
                      <div data-pending-document-card="true" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-500/40 dark:bg-amber-950/25">
                        <p className="text-sm font-semibold text-amber-950 dark:text-amber-200">
                          {canUploadProcessDocuments ? "Documento pendente de envio" : "Upload do profissional aguardando vínculo"}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-amber-800 dark:text-amber-300">
                          {canUploadProcessDocuments
                            ? "Se você já enviou este arquivo anteriormente, tente recuperá-lo do armazenamento; caso contrário, selecione o documento correto."
                            : "Somente arquivos já enviados pelo profissional aparecem aqui. Vincule o arquivo ao item correto do checklist para disponibilizá-lo à análise."}
                        </p>
                        {recoverableFiles.length > 0 ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                            <Select
                              value={recoverableSelection[document.id] || ""}
                              onValueChange={(value) =>
                                setRecoverableSelection((current) => ({ ...current, [document.id]: value }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Escolher upload anterior" />
                              </SelectTrigger>
                              <SelectContent>
                                {recoverableFiles.map((file) => (
                                  <SelectItem key={file.objectKey} value={file.objectKey}>
                                    {file.fileName} • {formatBytes(file.size)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="outline"
                              className="rounded-full"
                              disabled={
                                processActionBusy === `recover-document-${document.id}` ||
                                !recoverableSelection[document.id]
                              }
                              onClick={() => void handleRecoverStoredDocument(document)}
                            >
                              {processActionBusy === `recover-document-${document.id}`
                                ? "Recuperando..."
                                : "Recuperar arquivo"}
                            </Button>
                          </div>
                        ) : null}

                        {canUploadProcessDocuments ? (
                          <>
                            <div className="mt-3">
                              <FileDropZone
                                title={document.label}
                                description="PDF ou imagem. O arquivo será salvo no armazenamento oficial e ficará disponível para análise da Prefeitura."
                                accept=".pdf,image/*"
                                multiple={false}
                                allowPreview
                                files={documentUploads[document.id] ?? []}
                                onFilesSelected={(selected) =>
                                  setDocumentUploads((current) => ({ ...current, [document.id]: selected }))
                                }
                              />
                            </div>
                            <Button
                              type="button"
                              className="mt-3 rounded-full bg-slate-950 px-5 text-white hover:bg-slate-900 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
                              disabled={
                                processActionBusy === `upload-document-${document.id}` ||
                                !(documentUploads[document.id]?.[0]?.file)
                              }
                              onClick={() => void handleUploadMissingDocument(document)}
                            >
                              {processActionBusy === `upload-document-${document.id}`
                                ? "Enviando..."
                                : "Enviar documento"}
                            </Button>
                          </>
                        ) : null}
                      </div>
                    ) : null}

                    {document.uploaded && (document.annotations?.length ?? 0) > 0 ? (
                      <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-500/30 dark:bg-violet-950/25">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-300">
                              Apontamentos técnicos
                            </p>
                            <p className="mt-1 text-sm font-semibold text-slate-950 dark:text-white">
                              {document.annotations?.length} marcação(ões) vinculada(s) a este documento
                            </p>
                          </div>
                          <Badge variant="outline" className="rounded-full border-violet-200 bg-white text-violet-700 dark:border-violet-500/40 dark:bg-violet-950/40 dark:text-violet-300">
                            Lista de correções
                          </Badge>
                        </div>
                        <div className="mt-3 grid gap-2">
                          {(document.annotations ?? []).slice(0, 3).map((annotation, annotationIndex) => (
                            <div
                              key={annotation.id}
                              className="flex items-start gap-3 rounded-xl border border-violet-100 bg-white px-3 py-2.5 dark:border-violet-500/20 dark:bg-slate-900"
                            >
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[10px] font-bold text-white">
                                {annotationIndex + 1}
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                                  Página {annotation.page || 1} • {annotation.kind === "highlight" ? "Área marcada" : "Texto / comentário"}
                                </p>
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
                                  {annotation.note}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                        {(document.annotations?.length ?? 0) > 3 ? (
                          <p className="mt-2 text-xs font-medium text-violet-700 dark:text-violet-300">
                            + {(document.annotations?.length ?? 0) - 3} apontamento(s). Abra o documento para visualizar todos no painel técnico.
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {canReviewDocuments && document.uploaded ? (
                      <div
                        data-process-document-review-strip="true"
                        className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3"
                      >
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          isApproved
                            ? "bg-emerald-50 text-emerald-700"
                            : hasCommunique
                              ? "bg-amber-50 text-amber-700"
                              : "bg-sky-50 text-sky-700"
                        }`}>
                          {isApproved ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : hasCommunique ? (
                            <ShieldAlert className="h-4 w-4" />
                          ) : (
                            <Clock3 className="h-4 w-4" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {isApproved
                              ? "Documento conferido e aprovado."
                              : hasCommunique
                                ? "Comunique-se registrado para correção."
                                : "Aguardando conferência técnica."}
                          </p>
                          <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {hasCommunique
                              ? "As marcações e observações permanecem vinculadas ao documento."
                              : "Use “Analisar / marcar PDF” para marca-texto, comentários pontuais e decisão técnica."}
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>
          )}

          {activeTab === "analise" && canUseMunicipalChecklist && (
            <>
              {isAnalysisSupervisor ? (
                <AnalysisSupervisorControl
                  process={process}
                  session={session}
                  users={sessionUsers}
                  busy={supervisorActionBusy}
                  status={supervisorActionStatus}
                  onBeginIntervention={handleBeginSupervisorIntervention}
                  onEndIntervention={handleEndSupervisorIntervention}
                  onReassign={handleReassignAnalysis}
                />
              ) : null}
              <UrbanAnalysisChecklistPanel
                process={process}
                session={session}
                readOnly={!canEditAnalysisChecklist}
                municipalityId={effectiveScopeId || process.tenantId}
                municipalityName={municipalityName || tenant?.name || "Prefeitura Municipal"}
                municipalityLogoUrl={
                  tenantSettings?.headerLogoUrl ||
                  tenantSettings?.logoUrl ||
                  tenantSettings?.brasaoUrl ||
                  ""
                }
                secretariat={tenantSettings?.secretariaResponsavel || "Secretaria responsável"}
                directorate={
                  tenantSettings?.diretoriaResponsavel ||
                  getOrganizationPath(currentFolder) ||
                  "Diretoria / Divisão de Urbanismo"
                }
                municipalityAddress={tenantSettings?.endereco || ""}
                municipalityPhone={tenantSettings?.telefone || ""}
                municipalityEmail={tenantSettings?.email || ""}
                departmentLabel={getOrganizationPath(currentFolder) || "Análise Urbanística"}
                organogramTrail={currentOrganizationTrail}
              />
              {canReviewDocuments ? (
                <AnalysisReadinessPanel
                  process={process}
                  ownerProfile={linkedOwnerProfile}
                  technicalProfile={linkedTechnicalProfile}
                />
              ) : null}
            </>
          )}

          {!isExternalProcessViewer && activeTab === "analise" && !isHabiteSeProcess && (
          <Card className={cardShell}>
            <CardHeader className="border-b border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-slate-950 dark:text-slate-100">
                    <FileCheck2 className="h-5 w-5 text-sky-700 dark:text-sky-300" />
                    Conclusão da Análise Urbanística • ISSQN / Projeto
                  </CardTitle>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Depois da aprovação dos documentos, o analista confere os dados informados no protocolo e confirma os dados usados no ISSQN / Projeto. A emissão segue a regra definida pelo administrador da Prefeitura: Análise Urbanística, Financeiro ou ambos.
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`rounded-full font-semibold ${
                    allAnalysisDocumentsApproved && !hasOpenAnalysisRequirements
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-300"
                  }`}
                >
                  {allAnalysisDocumentsApproved && !hasOpenAnalysisRequirements
                    ? "Análise documental concluída"
                    : "Análise ainda pendente"}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-5 pt-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-900/50">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">Dados para cálculo da guia de ISSQN / Projeto</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Documentos aprovados: {approvedDocumentCount}/{requiredAnalysisDocuments.length}. Confira a metragem, o uso e a natureza da obra.
                    </p>
                    <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 dark:border-sky-500/40 dark:bg-sky-950/40 dark:text-sky-200">
                      <UserRound className="h-3.5 w-3.5" />
                      Responsável pela análise: {process.analysis?.assignedTo || (canReviewDocuments ? session.name : "Não atribuído")}
                    </div>
                  </div>
                  {constructionGuide ? (
                    <Badge
                      variant="outline"
                      className={`rounded-full ${
                        constructionGuideSentExternally
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-300"
                      }`}
                    >
                      {constructionGuide.status === "compensada"
                        ? "Pagamento compensado"
                        : constructionGuideSentExternally
                          ? "Enviada ao profissional"
                          : "Aguardando revisão e envio"}
                    </Badge>
                  ) : null}
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Área da obra (m²)</label>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      inputMode="decimal"
                      value={constructionAreaInput}
                      onChange={(event) => setConstructionAreaInput(event.target.value)}
                      disabled={!canReviewDocuments || (Boolean(constructionGuide) && !isEditingIssuedIssGuide)}
                      className="mt-2 h-11 bg-white dark:bg-slate-950"
                      placeholder="Ex.: 250,00"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Uso da edificação</label>
                    <Select
                      value={constructionUsageInput}
                      onValueChange={setConstructionUsageInput}
                      disabled={!canReviewDocuments || (Boolean(constructionGuide) && !isEditingIssuedIssGuide)}
                    >
                      <SelectTrigger className="mt-2 h-11 bg-white dark:bg-slate-950">
                        <SelectValue placeholder="Selecione o uso da edificação" />
                      </SelectTrigger>
                      <SelectContent>
                        {constructionUsageOptions.map((usage) => (
                          <SelectItem key={usage} value={usage}>{usage}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Natureza da obra</label>
                    <Select
                      value={workTypeInput}
                      onValueChange={setWorkTypeInput}
                      disabled={!canReviewDocuments || (Boolean(constructionGuide) && !isEditingIssuedIssGuide)}
                    >
                      <SelectTrigger className="mt-2 h-11 bg-white text-slate-950 dark:bg-slate-950 dark:text-slate-100">
                        <SelectValue placeholder="Selecione a natureza da obra" />
                      </SelectTrigger>
                      <SelectContent>
                        {workTypeCatalog.map((workType) => (
                          <SelectItem key={workType} value={workType}>{workType}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-sky-200 bg-white p-4 dark:border-sky-500/30 dark:bg-slate-950/35 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Valor do ISSQN / Projeto</p>
                    <p className="mt-1 text-2xl font-bold text-slate-950 dark:text-slate-100">
                      {constructionUsageInput && constructionAreaValue > 0
                        ? formatCurrency(constructionGuidePreviewAmount)
                        : "Aguardando dados"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      O valor final é confirmado pelo banco usando a tabela oficial cadastrada pela Prefeitura.
                    </p>
                  </div>

                  {constructionGuide ? (
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full"
                        disabled={Boolean(guideBillingBusyKey)}
                  onClick={() => void printGuide("iss_obra", false)}
                      >
                        {guideBillingBusyKey ? (
                                  <Clock3 className="mr-2 h-4 w-4 animate-pulse" />
                                ) : (
                                  <Eye className="mr-2 h-4 w-4" />
                                )}
                                {guideBillingBusyKey ? "Preparando guia..." : "Visualizar guia"}
                      </Button>

                      {canManageIssuedIssGuide ? (
                        isEditingIssuedIssGuide ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              className="rounded-full"
                              disabled={Boolean(processActionBusy)}
                              onClick={() => {
                                setConstructionAreaInput(process.property.area > 0 ? String(process.property.area) : "");
                                setConstructionUsageInput(process.property.usage || "");
                                setWorkTypeInput(process.property.workType || "");
                                setIsEditingIssuedIssGuide(false);
                              }}
                            >
                              Cancelar correção
                            </Button>
                            <Button
                              type="button"
                              className="rounded-full bg-amber-600 px-5 !text-white hover:bg-amber-700 dark:bg-amber-500 dark:!text-slate-950 dark:hover:bg-amber-400"
                              disabled={
                                processActionBusy === "revise-construction-guide" ||
                                !(constructionAreaValue > 0) ||
                                !constructionUsageInput ||
                                !workTypeInput
                              }
                              onClick={() => void handleReviseConstructionGuide()}
                            >
                              <FileKey2 className="mr-2 h-4 w-4" />
                              {processActionBusy === "revise-construction-guide"
                                ? "Gerando nova versão..."
                                : "Gerar nova versão"}
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            className="rounded-full border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-300"
                            onClick={() => setIsEditingIssuedIssGuide(true)}
                          >
                            <PencilLine className="mr-2 h-4 w-4" />
                            Corrigir guia
                          </Button>
                        )
                      ) : null}

                      {!constructionGuideSentExternally && !isEditingIssuedIssGuide ? (
                        <Button
                          type="button"
                          className="rounded-full bg-sky-700 px-5 !text-white hover:bg-sky-800 dark:bg-sky-500 dark:!text-slate-950 dark:hover:bg-sky-400"
                          disabled={processActionBusy === "send-construction-guide" || !canManageIssuedIssGuide}
                          onClick={handleSendConstructionGuideToProfessional}
                        >
                          <MessageSquareMore className="mr-2 h-4 w-4" />
                          {processActionBusy === "send-construction-guide" ? "Enviando..." : "Revisado — enviar ao profissional"}
                        </Button>
                      ) : constructionGuideSentExternally ? (
                        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/35 dark:text-emerald-300">
                          <CheckCircle2 className="h-4 w-4" />
                          Versão vigente já enviada
                        </div>
                      ) : null}
                    </div>
                  ) : constructionGuideRequest ? (
                    <div className="inline-flex items-center gap-2 rounded-full border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800 dark:border-sky-500/40 dark:bg-sky-950/40 dark:text-sky-300">
                      <Clock3 className="h-4 w-4" />
                      Encaminhada ao Financeiro para emissão
                    </div>
                  ) : (
                    <div className="flex flex-wrap justify-end gap-2">
                      {analysisCanIssueConstructionGuide ? (
                        <Button
                          type="button"
                          className="rounded-full bg-sky-700 px-6 !text-white hover:bg-sky-800 dark:bg-sky-500 dark:!text-slate-950 dark:hover:bg-sky-400"
                          disabled={
                            processActionBusy === "generate-construction-guide" ||
                            !canReviewDocuments ||
                            !allAnalysisDocumentsApproved ||
                            hasOpenAnalysisRequirements ||
                            !(constructionAreaValue > 0) ||
                            !constructionUsageInput ||
                            !workTypeInput
                          }
                          onClick={handleGenerateConstructionGuide}
                        >
                          <FileKey2 className="mr-2 h-4 w-4" />
                          {processActionBusy === "generate-construction-guide"
                            ? "Gerando guia..."
                            : "Gerar guia agora"}
                        </Button>
                      ) : null}

                      {financeCanIssueConstructionGuide ? (
                        <Button
                          type="button"
                          variant={analysisCanIssueConstructionGuide ? "outline" : "default"}
                          className={analysisCanIssueConstructionGuide
                            ? "rounded-full border-sky-300 px-6 text-sky-800 dark:border-sky-500/40 dark:text-sky-300"
                            : "rounded-full bg-sky-700 px-6 !text-white hover:bg-sky-800 dark:bg-sky-500 dark:!text-slate-950 dark:hover:bg-sky-400"}
                          disabled={
                            processActionBusy === "forward-construction-guide" ||
                            !canReviewDocuments ||
                            !allAnalysisDocumentsApproved ||
                            hasOpenAnalysisRequirements ||
                            !(constructionAreaValue > 0) ||
                            !constructionUsageInput ||
                            !workTypeInput
                          }
                          onClick={handleForwardConstructionGuideToFinance}
                        >
                          <ArrowRightLeft className="mr-2 h-4 w-4" />
                          {processActionBusy === "forward-construction-guide"
                            ? "Encaminhando..."
                            : "Encaminhar ao Financeiro"}
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>

                {constructionGuide ? (
                  <div className={`mt-4 rounded-xl border px-4 py-3 text-sm leading-6 ${
                    constructionGuideSentExternally
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/25 dark:text-emerald-300"
                      : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/25 dark:text-amber-300"
                  }`}>
                    {constructionGuideSentExternally
                      ? "A versão vigente foi liberada manualmente pelo analista e já está disponível ao profissional."
                      : "A guia foi gerada, mas ainda não foi liberada ao profissional. O analista deve visualizar e conferir a guia; se houver erro, use Corrigir guia e gere uma nova versão. Somente a versão mais recente permanece vigente."}
                  </div>
                ) : null}

                {!allAnalysisDocumentsApproved ? (
                  <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-300">
                    A guia só pode ser gerada quando todos os documentos e projetos estiverem aprovados.
                  </p>
                ) : hasOpenAnalysisRequirements ? (
                  <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-300">
                    Existe Comunique-se ou exigência aberta. Conclua a pendência antes de gerar a guia.
                  </p>
                ) : null}
              </div>

              {constructionGuide ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/35">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Guia</p>
                    <p className="mt-2 font-semibold text-slate-950 dark:text-slate-100">{constructionGuide.code}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatCurrency(constructionGuide.amount)}</p>
                    <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                      Versão {Number(constructionGuide.revision ?? 0) + 1}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/35">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Proprietário</p>
                    <p className="mt-2 font-semibold text-slate-950 dark:text-slate-100">{process.ownerName}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/35">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Profissional responsável</p>
                    <p className="mt-2 font-semibold text-slate-950 dark:text-slate-100">{process.technicalLead}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950/35">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Responsável pela emissão</p>
                    <p className="mt-2 font-semibold text-slate-950 dark:text-slate-100">{constructionGuideIssuer || session.name}</p>
                    <p className={`mt-1 text-xs ${
                      constructionGuideSentExternally
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-amber-700 dark:text-amber-300"
                    }`}>
                      {constructionGuide.status === "compensada"
                        ? "Pagamento compensado — processo retornado à Análise Urbanística"
                        : constructionGuideSentExternally
                          ? "Liberada ao profissional e encaminhada ao Financeiro"
                          : "Ainda em Análise Urbanística — aguardando liberação manual"}
                    </p>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
          )}

          {activeTab === "alvara" && (
            isHabiteSeProcess ? (
              <OccupancyPermitProcessPanel
                process={process}
                session={session}
                externalView={isExternalProcessViewer}
                municipalityName={municipalityName || tenant?.name || "Prefeitura Municipal"}
                municipalityLogoUrl={
                  tenantSettings?.brasaoUrl ||
                  tenantSettings?.headerLogoUrl ||
                  tenantSettings?.logoUrl ||
                  ""
                }
                municipalityAddress={tenantSettings?.endereco || ""}
                municipalityPhone={tenantSettings?.telefone || ""}
                municipalityEmail={tenantSettings?.email || ""}
                secretariat={tenantSettings?.secretariaResponsavel}
                directorate={
                  tenantSettings?.diretoriaResponsavel ||
                  "Divisão de Análise e Aprovação de Projetos - DAAP"
                }
                dataReady={
                  dataReadyForCurrentUser &&
                  session.id !== "unknown"
                }
                onProcessRefresh={() => refreshRemoteStore()}
                onCompleteProcess={async () => {
                  await updateProcessStatus({
                    processId: process.id,
                    status: "deferido",
                    actor: session.name,
                    title: "Processo de Habite-se concluído",
                    detail:
                      "Alvará de Habite-se emitido com assinatura eletrônica válida da Diretoria. Processo concluído administrativamente pelo responsável autorizado, permanecendo visível na pasta de concluídos e no histórico oficial.",
                  });
                  await refreshRemoteStore(process.id);
                  window.dispatchEvent(new Event("sigapro:data-changed"));
                }}
                onReopenProcess={async (reason) => {
                  await reopenProcess({
                    processId: process.id,
                    actor: session.name,
                    reason,
                  });
                  await refreshRemoteStore(process.id);
                  window.dispatchEvent(new Event("sigapro:data-changed"));
                }}
                onViewHabiteSeGuide={
                  habiteSeGuide
                    ? () => void printGuide("habite_se", false, habiteSeGuide.code)
                    : undefined
                }
                onPrintHabiteSeGuide={
                  habiteSeGuide
                    ? () => void printGuide("habite_se", true, habiteSeGuide.code)
                    : undefined
                }
              />
            ) : (
            <>
              {!isExternalProcessViewer && approvalPaymentRequired ? (
                <Card
                  data-approval-payment-card="true"
                  className={`${cardShell} overflow-hidden border-violet-200 dark:border-violet-500/30`}
                >
                  <CardHeader
                    data-approval-payment-header="true"
                    className="border-b border-violet-100 bg-[linear-gradient(135deg,#f8f7ff_0%,#eef4ff_100%)] dark:border-violet-500/20 dark:bg-[linear-gradient(135deg,#17152b_0%,#10243a_100%)]"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Wallet className="h-5 w-5 text-violet-700 dark:text-violet-300" />
                          <CardTitle data-approval-payment-title="true" className="text-slate-950 dark:text-white">
                            Pagamento da aprovação / Alvará
                          </CardTitle>
                        </div>
                        <p
                          data-approval-payment-copy="true"
                          className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300"
                        >
                          Esta cobrança pertence ao licenciamento atual. Habite-se não participa deste processo: ele possui protocolo, documentos e workflow próprios.
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`w-fit rounded-full font-semibold ${
                          approvalGuide?.status === "compensada"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-300"
                            : approvalGuide
                              ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-300"
                              : constructionPaymentCompensated &&
                                  allAnalysisDocumentsApproved &&
                                  !hasOpenAnalysisRequirements &&
                                  Boolean(process.property.constructionStandard) &&
                                  Boolean(approvalGuidePreview.profile) &&
                                  approvalGuidePreview.baseValueM2 > 0
                                ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-950/40 dark:text-sky-300"
                                : "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
                        }`}
                      >
                        {approvalGuide?.status === "compensada"
                          ? "Pagamento compensado"
                          : approvalGuide
                            ? "Aguardando Financeiro"
                            : constructionPaymentCompensated &&
                                allAnalysisDocumentsApproved &&
                                !hasOpenAnalysisRequirements &&
                                Boolean(process.property.constructionStandard) &&
                                Boolean(approvalGuidePreview.profile) &&
                                approvalGuidePreview.baseValueM2 > 0
                              ? "Pronta para emissão"
                              : "Aguardando pré-requisitos"}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 p-5">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Área aprovada</p>
                        <p className="mt-2 text-sm font-bold text-slate-950 dark:text-white">
                          {approvalGuidePreview.areaM2.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Tipo / acabamento</p>
                        <p className="mt-2 text-sm font-bold text-slate-950 dark:text-white">
                          {process.property.usage || "Não informado"} • {constructionStandardLabel}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Referência oficial</p>
                        <p className="mt-2 text-sm font-bold text-slate-950 dark:text-white">
                          {approvalGuidePreview.baseValueM2 > 0
                            ? `${formatCurrency(approvalGuidePreview.baseValueM2)} / m²`
                            : "Não configurada"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Alíquota</p>
                        <p className="mt-2 text-sm font-bold text-slate-950 dark:text-white">
                          {approvalGuidePreview.aliquotPercent.toLocaleString("pt-BR")}%
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {approvalGuidePreview.baseValueM2 > 0
                            ? `${formatCurrency(approvalGuidePreview.licenseUnitValue)} / m² efetivo`
                            : "Aguardando tabela"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-500/30 dark:bg-violet-950/30">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-violet-700 dark:text-violet-300">Total</p>
                        <p className="mt-2 text-base font-black text-slate-950 dark:text-white">
                          {formatCurrency(approvalGuide?.amount ?? approvalGuidePreview.totalAmount)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Alvará fixo: {formatCurrency(approvalGuidePreview.permitFee)}
                        </p>
                      </div>
                    </div>

                    <div className={`rounded-2xl border p-4 ${
                      approvalGuide?.status === "compensada"
                        ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-500/30 dark:bg-emerald-950/25"
                        : approvalGuide
                          ? "border-amber-200 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-950/25"
                          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950/30"
                    }`}>
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-950 dark:text-white">
                            {approvalGuide?.status === "compensada"
                              ? "Pagamento compensado — Alvará liberado para assinatura"
                              : approvalGuide
                                ? `Guia ${approvalGuide.code} emitida — aguardando compensação pelo Financeiro`
                                : "Emita a guia após a conclusão técnica e a compensação do ISSQN / Projeto."}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {approvalGuide
                              ? `Valor oficial gravado: ${formatCurrency(approvalGuide.amount)} • Vencimento: ${approvalGuide.dueDate || "não informado"}.`
                              : "Fórmula: taxa fixa do Alvará + (área × valor oficial do m² por tipo/acabamento × alíquota)."}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {approvalGuide ? (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                className="rounded-full"
                                disabled={Boolean(guideBillingBusyKey)}
                  onClick={() => void printGuide("aprovacao_final", false)}
                              >
                                {guideBillingBusyKey ? (
                                  <Clock3 className="mr-2 h-4 w-4 animate-pulse" />
                                ) : (
                                  <Eye className="mr-2 h-4 w-4" />
                                )}
                                {guideBillingBusyKey ? "Preparando guia..." : "Visualizar guia"}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                className="rounded-full"
                                disabled={Boolean(guideBillingBusyKey)}
                  onClick={() => void printGuide("aprovacao_final", true)}
                              >
                                {guideBillingBusyKey ? (
                                  <Clock3 className="mr-2 h-4 w-4 animate-pulse" />
                                ) : (
                                  <Printer className="mr-2 h-4 w-4" />
                                )}
                                {guideBillingBusyKey ? "Preparando guia..." : "Imprimir guia"}
                              </Button>
                            </>
                          ) : (
                            <Button
                              type="button"
                              className="rounded-full bg-violet-700 px-6 !text-white shadow-sm hover:bg-violet-800 [&_*]:!text-white"
                              disabled={
                                processActionBusy === "generate-approval-guide" ||
                                !constructionPaymentCompensated ||
                                !allAnalysisDocumentsApproved ||
                                hasOpenAnalysisRequirements ||
                                !canAnalysisOperate ||
                                !ownsCurrentProcessStage ||
                                !process.property.constructionStandard ||
                                !approvalGuidePreview.profile ||
                                approvalGuidePreview.baseValueM2 <= 0 ||
                                approvalGuidePreview.totalAmount <= 0
                              }
                              onClick={handleGenerateApprovalGuide}
                            >
                              <FileKey2 className="mr-2 h-4 w-4" />
                              {processActionBusy === "generate-approval-guide"
                                ? "Emitindo..."
                                : "Emitir guia de aprovação / Alvará"}
                            </Button>
                          )}
                        </div>
                      </div>

                      {!approvalGuide && !process.property.constructionStandard ? (
                        <p className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-300">
                          Informe o padrão de acabamento da obra (Luxo, Primeira, Médio ou Econômico) antes do cálculo.
                        </p>
                      ) : null}
                      {!approvalGuide &&
                      process.property.constructionStandard &&
                      (!approvalGuidePreview.profile || approvalGuidePreview.baseValueM2 <= 0) ? (
                        <p className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-300">
                          Cadastre no Financeiro o valor oficial do m² para esta combinação de tipo de obra e acabamento.
                        </p>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              <ConstructionPermitPanel
                process={process}
                session={session}
                sessionUsers={sessionUsers}
                municipalityId={effectiveScopeId || process.tenantId}
                municipalityName={municipalityName || tenant?.name || "Prefeitura Municipal"}
                municipalityLogoUrl={
                  tenantSettings?.brasaoUrl ||
                  tenantSettings?.headerLogoUrl ||
                  tenantSettings?.logoUrl ||
                  ""
                }
                municipalityAddress={tenantSettings?.endereco || ""}
                municipalityPhone={tenantSettings?.telefone || ""}
                municipalityEmail={tenantSettings?.email || ""}
                secretariat={tenantSettings?.secretariaResponsavel}
                directorate={tenantSettings?.diretoriaResponsavel || "Divisão de Análise e Aprovação de Projetos - DAAP"}
                technicalProfile={linkedTechnicalProfile}
                issPaymentConfirmed={constructionGuide?.status === "compensada"}
                issPaidAt={constructionGuide?.paidAt}
                approvalPaymentRequired={approvalPaymentRequired}
                approvalPaymentConfirmed={approvalPaymentConfirmed}
                approvalPaidAt={approvalGuide?.paidAt}
                allDocumentsApproved={allAnalysisDocumentsApproved && !hasOpenAnalysisRequirements}
                externalView={isExternalProcessViewer}
                organogramTrail={currentOrganizationTrail}
              />
            </>
            )
          )}

          {isExternalProcessViewer && session.role === "profissional_externo" && activeTab === "financeiro" && (
          <Card className={cardShell}>
            <CardHeader className="border-b border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-slate-950 dark:text-slate-100">
                    <FileKey2 className="h-5 w-5 text-sky-700 dark:text-sky-300" />
                    Financeiro do processo
                  </CardTitle>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Aqui aparecem somente as guias liberadas oficialmente para você neste processo, com valor, vencimento e situação atual.
                  </p>
                </div>
                <Badge variant="outline" className="rounded-full border-slate-300 bg-slate-50 text-slate-700">
                  {visiblePaymentGuides.filter((guide) => guide.status !== "compensada").length} aberta(s)
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              {visiblePaymentGuides.length > 0 ? (
                <div className="grid gap-4">
                  {visiblePaymentGuides.map((guide) => (
                    <div
                      key={`${guide.kind}-${guide.code}`}
                      id={guide.code === requestedGuideCode ? `guia-lancamento-${guide.code}` : undefined}
                      data-guide-code={guide.code}
                      data-guide-selected={guide.code === requestedGuideCode ? "true" : "false"}
                      className={
                        guide.code === requestedGuideCode
                          ? "scroll-mt-28 rounded-2xl border-2 border-sky-400 bg-sky-50 p-5 shadow-[0_14px_34px_rgba(14,116,144,0.14)] dark:border-sky-500 dark:bg-sky-950/25"
                          : "rounded-2xl border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-700 dark:bg-slate-900/50"
                      }
                    >
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-slate-950 dark:text-slate-100">{guide.label}</p>
                            <Badge
                              variant="outline"
                              className={`rounded-full ${
                                guide.status === "compensada"
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-300"
                                  : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-300"
                              }`}
                            >
                              {guide.status === "compensada" ? "Pago / compensado" : "Em aberto"}
                            </Badge>
                          </div>
                          <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                            {getPaymentGuideDisplayReference(process, guide)}
                          </p>
                          {guide.officialProcessReference &&
                          guide.officialProcessReference !== guide.code ? (
                            <p className="mt-1 text-[11px] font-medium text-slate-400 dark:text-slate-500">
                              Guia original paga no pré-protocolo: {guide.code}
                            </p>
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600 dark:text-slate-300">
                            <span><strong>Valor:</strong> {formatCurrency(guide.amount)}</span>
                            <span><strong>Vencimento:</strong> {guide.dueDate || "Não informado"}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button type="button" variant="outline" className="rounded-full" disabled={Boolean(guideBillingBusyKey)} onClick={() => void printGuide(guide.kind, false, guide.code)}>
                            {guideBillingBusyKey ? (
                              <Clock3 className="mr-2 h-4 w-4 animate-pulse" />
                            ) : (
                              <Eye className="mr-2 h-4 w-4" />
                            )}
                            {guideBillingBusyKey ? "Preparando guia..." : "Visualizar"}
                          </Button>
                          <Button type="button" variant="outline" className="rounded-full" disabled={Boolean(guideBillingBusyKey)} onClick={() => void printGuide(guide.kind, true, guide.code)}>
                            {guideBillingBusyKey ? (
                              <Clock3 className="mr-2 h-4 w-4 animate-pulse" />
                            ) : (
                              <Printer className="mr-2 h-4 w-4" />
                            )}
                            {guideBillingBusyKey ? "Preparando guia..." : "Imprimir"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
                  Nenhuma cobrança foi liberada para você neste processo.
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {!isExternalProcessViewer && activeTab === "financeiro" && requestedPaymentGuide && (
          <Card
            id="guia-selecionada"
            data-selected-guide-summary="true"
            data-guide-selected="true"
            data-guide-code={requestedPaymentGuide.code}
            className="sig-process-card min-w-0 rounded-[20px] border-2 border-sky-300 bg-sky-50/60 shadow-[0_16px_38px_rgba(14,116,144,0.12)] dark:border-sky-500/50 dark:bg-sky-950/20"
          >
            <CardHeader className="border-b border-sky-200/80 dark:border-sky-700/50">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">
                    Guia selecionada no Financeiro
                  </p>
                  <CardTitle className="mt-1 flex items-center gap-2 text-slate-950 dark:text-slate-100">
                    <ReceiptText className="h-5 w-5 text-sky-700 dark:text-sky-300" />
                    {requestedPaymentGuide.code}
                  </CardTitle>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {requestedPaymentGuide.label}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    requestedPaymentGuide.status === "compensada"
                      ? "w-fit rounded-full border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/35 dark:text-emerald-300"
                      : "w-fit rounded-full border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/35 dark:text-amber-300"
                  }
                >
                  {requestedPaymentGuide.status === "compensada" ? "Compensada" : "Pendente"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Valor</p>
                  <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">
                    {formatCurrency(requestedPaymentGuide.amount)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Vencimento</p>
                  <p className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">
                    {requestedPaymentGuide.dueDate || "Não informado"}
                  </p>
                </div>
                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    disabled={Boolean(guideBillingBusyKey)}
                    onClick={() => void printGuide(requestedPaymentGuide.kind, false, requestedPaymentGuide.code)}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Visualizar esta guia
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          )}

          {!isExternalProcessViewer && activeTab === "financeiro" && isHabiteSeProcess && (
          <Card className={cardShell}>
            <CardHeader className="border-b border-slate-100 dark:border-slate-800">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-slate-950 dark:text-slate-100">
                    <FileKey2 className="h-5 w-5 text-sky-700 dark:text-sky-300" />
                    Financeiro do protocolo de Habite-se
                  </CardTitle>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Este processo possui cobrança e histórico próprios. Não herda ISSQN, taxa de aprovação
                    nem a guia do Alvará do processo anterior.
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    protocolGuide?.status === "compensada"
                      ? "w-fit rounded-full border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/35 dark:text-emerald-300"
                      : "w-fit rounded-full border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/35 dark:text-amber-300"
                  }
                >
                  {protocolGuide?.status === "compensada"
                    ? "Protocolo pago"
                    : "Pagamento inicial pendente"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-5">
              {protocolGuide ? (
                <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-950/35 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                      Guia deste protocolo
                    </p>
                    <p className="mt-2 text-base font-bold text-slate-950 dark:text-white">
                      {protocolGuide.code} • {formatCurrency(protocolGuide.amount)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      Vencimento: {protocolGuide.dueDate || "não informado"}.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" className="rounded-full" disabled={Boolean(guideBillingBusyKey)} onClick={() => void printGuide("protocolo", false)}>
                      {guideBillingBusyKey ? (
                        <Clock3 className="mr-2 h-4 w-4 animate-pulse" />
                      ) : (
                        <Eye className="mr-2 h-4 w-4" />
                      )}
                      {guideBillingBusyKey ? "Preparando guia..." : "Visualizar"}
                    </Button>
                    <Button type="button" variant="outline" className="rounded-full" disabled={Boolean(guideBillingBusyKey)} onClick={() => void printGuide("protocolo", true)}>
                      {guideBillingBusyKey ? (
                        <Clock3 className="mr-2 h-4 w-4 animate-pulse" />
                      ) : (
                        <Printer className="mr-2 h-4 w-4" />
                      )}
                      {guideBillingBusyKey ? "Preparando guia..." : "Imprimir"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950/35 dark:text-slate-300">
                  A guia inicial deste protocolo ainda não foi localizada no banco oficial.
                </div>
              )}
              <div
                data-habite-se-payment-card="true"
                className="overflow-hidden rounded-[20px] border border-sky-200 bg-white shadow-[0_12px_28px_rgba(14,116,144,0.08)] dark:border-sky-500/30 dark:bg-slate-900"
              >
                <div className="border-b border-sky-100 bg-[linear-gradient(135deg,#f8fbff_0%,#edf8ff_100%)] p-4 dark:border-sky-500/20 dark:bg-[linear-gradient(135deg,#0e2234_0%,#0f3048_100%)]">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-300">
                        Após vistoria / conferência
                      </p>
                      <p className="mt-1 text-base font-black text-slate-950 dark:text-white">
                        Guia de Pagamento do Habite-se
                      </p>
                      <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                        Esta é uma cobrança própria do Habite-se. Não reutiliza ISSQN nem a taxa de aprovação/Alvará do processo de origem.
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        habiteSeGuide?.status === "compensada"
                          ? "w-fit rounded-full border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/35 dark:text-emerald-300"
                          : habiteSeGuide
                            ? "w-fit rounded-full border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/35 dark:text-amber-300"
                            : habiteSeGuideRequest || /financ/.test(normalizedCurrentFolder)
                              ? "w-fit rounded-full border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-950/35 dark:text-sky-300"
                              : "w-fit rounded-full border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
                      }
                    >
                      {habiteSeGuide?.status === "compensada"
                        ? "Pagamento confirmado"
                        : habiteSeGuide
                          ? "Aguardando pagamento"
                          : habiteSeGuideRequest || /financ/.test(normalizedCurrentFolder)
                            ? "Aguardando emissão"
                            : "Aguardando vistoria"}
                    </Badge>
                  </div>
                </div>

                <div className="p-4">
                  {habiteSeGuide ? (
                    <div className="space-y-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/45">
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Guia</p>
                          <p className="mt-2 text-sm font-black text-slate-950 dark:text-white">{habiteSeGuide.code}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/45">
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Valor</p>
                          <p className="mt-2 text-lg font-black text-slate-950 dark:text-white">{formatCurrency(habiteSeGuide.amount)}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/45">
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Vencimento</p>
                          <p className="mt-2 text-sm font-black text-slate-950 dark:text-white">{habiteSeGuide.dueDate || "Não informado"}</p>
                        </div>
                      </div>

                      {habiteSeGuide.areaM2 && habiteSeGuide.constructionStandard ? (
                        <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4 dark:border-sky-500/30 dark:bg-sky-950/25">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-sky-700 dark:text-sky-300">
                                Cálculo oficial registrado
                              </p>
                              <p className="mt-1 text-sm font-bold text-slate-950 dark:text-white">
                                {habiteSeGuide.areaM2.toLocaleString("pt-BR")} m² • {habiteSeGuide.usage || process.property.usage || "Uso não informado"} • {constructionStandardDisplayLabel(habiteSeGuide.constructionStandard)}
                              </p>
                            </div>
                            <Badge variant="outline" className="border-sky-300 bg-white text-sky-800 dark:border-sky-500/40 dark:bg-slate-950 dark:text-sky-200">
                              Área e acabamento congelados na emissão
                            </Badge>
                          </div>
                        </div>
                      ) : null}

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full"
                          disabled={Boolean(guideBillingBusyKey)}
                          onClick={() => void printGuide("habite_se", false, habiteSeGuide.code)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          Visualizar guia
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full"
                          disabled={Boolean(guideBillingBusyKey)}
                          onClick={() => void printGuide("habite_se", true, habiteSeGuide.code)}
                        >
                          <Printer className="mr-2 h-4 w-4" />
                          Imprimir
                        </Button>
                        {canFinanceOperate && habiteSeGuide.status !== "compensada" && !habiteSeGuideSentExternally ? (
                          <Button
                            type="button"
                            className="rounded-full bg-sky-700 font-bold !text-white hover:bg-sky-600 [&_*]:!text-white"
                            disabled={processActionBusy === "send-habite-se-guide"}
                            onClick={handleSendHabiteSeGuideToProfessional}
                          >
                            <MessageSquareMore className="mr-2 h-4 w-4" />
                            {processActionBusy === "send-habite-se-guide"
                              ? "Enviando..."
                              : "Enviar ao profissional responsável"}
                          </Button>
                        ) : null}
                        {habiteSeGuideSentExternally ? (
                          <Badge
                            variant="outline"
                            className="rounded-full border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/35 dark:text-emerald-200"
                          >
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                            Enviada ao profissional
                          </Badge>
                        ) : null}
                        {canFinanceOperate && habiteSeGuide.status !== "compensada" ? (
                          <Button
                            type="button"
                            className="rounded-full bg-emerald-700 font-bold !text-white hover:bg-emerald-600 [&_*]:!text-white"
                            disabled={
                              processActionBusy === "confirm-habite-se-payment" ||
                              !habiteSeGuideSentExternally
                            }
                            onClick={() => void handleConfirmHabiteSePayment()}
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            {processActionBusy === "confirm-habite-se-payment"
                              ? "Confirmando..."
                              : "Confirmar pagamento"}
                          </Button>
                        ) : null}
                      </div>

                      {habiteSeGuide.status === "compensada" ? (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/25 dark:text-emerald-200">
                          Pagamento compensado. O processo retornou à Análise Urbanística para elaboração do Alvará de Habite-se e posterior assinatura da Diretoria.
                        </div>
                      ) : null}
                    </div>
                  ) : habiteSeGuideRequest || /financ/.test(normalizedCurrentFolder) ? (
                    canFinanceOperate ? (
                      <div className="space-y-4">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-950/45">
                            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">
                              Área do imóvel
                            </p>
                            <p className="mt-2 text-xl font-black text-slate-950 dark:text-white">
                              {process.property.area > 0
                                ? `${process.property.area.toLocaleString("pt-BR")} m²`
                                : "Não informada"}
                            </p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Automática do cadastro do protocolo
                            </p>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-950/45">
                            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">
                              Tipo de construção
                            </p>
                            <p className="mt-2 text-xl font-black text-slate-950 dark:text-white">
                              {process.property.usage || "Não informado"}
                            </p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Herdado das avaliações anteriores
                            </p>
                          </div>

                          <div className="rounded-2xl border border-sky-200 bg-sky-50/80 p-4 dark:border-sky-500/30 dark:bg-sky-950/25">
                            <label
                              htmlFor="habite-se-acabamento"
                              className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-sky-700 dark:text-sky-300"
                            >
                              Tipo de acabamento
                            </label>
                            <Select
                              value={habiteSeConstructionStandardInput}
                              onValueChange={setHabiteSeConstructionStandardInput}
                            >
                              <SelectTrigger
                                id="habite-se-acabamento"
                                className="mt-2 h-11 rounded-xl border-sky-300 bg-white font-bold text-slate-950 dark:border-sky-500/40 dark:bg-slate-950 dark:text-white"
                              >
                                <SelectValue placeholder="Selecione o acabamento" />
                              </SelectTrigger>
                              <SelectContent>
                                {habiteSeFinishOptions.map((profile) => (
                                  <SelectItem key={profile.id} value={profile.standard}>
                                    {constructionStandardDisplayLabel(profile.standard)} — {formatCurrency(profile.rate)}/m²
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="mt-1 text-xs text-sky-700/80 dark:text-sky-200/80">
                              Você escolhe apenas o acabamento
                            </p>
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-950/45">
                            <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">
                              Alíquota do Habite-se
                            </p>
                            <p className="mt-2 text-xl font-black text-slate-950 dark:text-white">
                              {habiteSeGuidePreview.aliquotPercent.toLocaleString("pt-BR")}%
                            </p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Configuração municipal oficial
                            </p>
                          </div>
                        </div>

                        <div className="rounded-[18px] border border-sky-200 bg-[linear-gradient(135deg,rgba(240,249,255,0.96),rgba(248,250,252,0.98))] p-4 shadow-[0_10px_28px_rgba(2,132,199,0.08)] dark:border-sky-500/30 dark:bg-[linear-gradient(135deg,rgba(8,47,73,0.42),rgba(15,23,42,0.72))]">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-sky-700 dark:text-sky-300">
                                Memória de cálculo
                              </p>
                              {habiteSeGuidePreview.profile ? (
                                <>
                                  <p className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                                    {habiteSeGuidePreview.areaM2.toLocaleString("pt-BR")} m² × {formatCurrency(habiteSeGuidePreview.baseValueM2)}/m² × {habiteSeGuidePreview.aliquotPercent.toLocaleString("pt-BR")}%
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                    {process.property.usage} • {constructionStandardDisplayLabel(habiteSeConstructionStandardInput)} • referência oficial de acabamento
                                  </p>
                                </>
                              ) : (
                                <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                                  Selecione um acabamento disponível para calcular automaticamente.
                                </p>
                              )}
                            </div>
                            <div className="min-w-[210px] rounded-2xl border border-sky-200 bg-white px-5 py-3 text-right dark:border-sky-500/30 dark:bg-slate-950">
                              <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                                Taxa calculada
                              </p>
                              <p className="mt-1 text-2xl font-black text-sky-800 dark:text-sky-200">
                                {habiteSeGuidePreview.totalAmount > 0
                                  ? formatCurrency(habiteSeGuidePreview.totalAmount)
                                  : "R$ 0,00"}
                              </p>
                            </div>
                          </div>
                        </div>

                        {process.property.area <= 0 || !process.property.usage?.trim() ? (
                          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100">
                            A área e o tipo de construção precisam estar preenchidos no cadastro do processo. Esses dados não são digitados novamente no Financeiro.
                          </div>
                        ) : habiteSeFinishOptions.length === 0 ? (
                          <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold leading-6 text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/30 dark:text-rose-100">
                            A tabela municipal não possui acabamento configurado para “{process.property.usage}”. A guia permanece bloqueada até a configuração oficial ser corrigida.
                          </div>
                        ) : null}

                        <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700">
                          <p className="max-w-3xl text-xs leading-5 text-slate-500 dark:text-slate-400">
                            A tela mostra a prévia, mas o valor final é recalculado no banco usando a área oficial do imóvel, o acabamento selecionado, a tabela municipal e a alíquota. O cálculo e os dados usados ficam congelados na guia e registrados em auditoria.
                          </p>
                          <Button
                            type="button"
                            className="h-11 shrink-0 rounded-xl bg-[linear-gradient(135deg,#075985_0%,#0284c7_100%)] px-5 font-bold !text-white shadow-[0_10px_24px_rgba(7,89,133,0.20)] hover:brightness-105 [&_*]:!text-white"
                            disabled={
                              processActionBusy === "issue-habite-se-guide" ||
                              process.property.area <= 0 ||
                              !process.property.usage?.trim() ||
                              !habiteSeConstructionStandardInput.trim() ||
                              !habiteSeGuidePreview.profile ||
                              habiteSeGuidePreview.totalAmount <= 0
                            }
                            onClick={() => void handleIssueHabiteSeGuide()}
                          >
                            <ReceiptText className="mr-2 h-4 w-4" />
                            {processActionBusy === "issue-habite-se-guide"
                              ? "Emitindo..."
                              : habiteSeGuidePreview.totalAmount > 0
                                ? `Gerar guia • ${formatCurrency(habiteSeGuidePreview.totalAmount)}`
                                : "Gerar Guia de Habite-se"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950 dark:border-sky-500/30 dark:bg-sky-950/25 dark:text-sky-100">
                        A vistoria foi concluída e o processo está com o Financeiro para emissão da Guia de Habite-se.
                      </div>
                    )
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-950/45 dark:text-slate-300">
                      A Guia de Habite-se fica disponível somente depois que a Vistoria / conferência concluir a etapa e encaminhar formalmente o processo ao Financeiro.
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          )}

          {!isExternalProcessViewer && activeTab === "financeiro" && !isHabiteSeProcess && (
          <Card className={cardShell}>
            <CardHeader className="border-b border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-slate-950 dark:text-slate-100">
                    <FileKey2 className="h-5 w-5 text-sky-700 dark:text-sky-300" />
                    Controle da Guia de ISSQN / Projeto
                  </CardTitle>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {constructionGuideIssuerMode === "financeiro"
                      ? "Nesta Prefeitura, a Análise Urbanística confirma os dados da obra e o Financeiro faz a emissão da guia."
                      : constructionGuideIssuerMode === "ambos"
                        ? "Nesta Prefeitura, a guia pode ser emitida pela Análise Urbanística ou pelo Financeiro, conforme o encaminhamento do processo."
                        : "Nesta Prefeitura, a guia é gerada na Análise Urbanística e só chega ao Financeiro depois da liberação manual ao profissional. A baixa do pagamento da obra é responsabilidade do Financeiro."}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`rounded-full font-semibold ${
                    constructionGuide
                      ? constructionGuide.status === "compensada"
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-300"
                      : "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
                  }`}
                >
                  {constructionGuide
                    ? constructionGuide.status === "compensada"
                      ? "Pagamento confirmado"
                      : "Aguardando pagamento"
                    : constructionGuideRequest && financeCanIssueConstructionGuide
                      ? "Aguardando emissão pelo Financeiro"
                      : constructionGuideIssuerMode === "analise"
                        ? "Aguardando geração pela Análise"
                        : "Aguardando encaminhamento da Análise"}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-5 pt-5">
              {constructionGuide ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Guia</p>
                      <p className="mt-2 font-semibold text-slate-950 dark:text-slate-100">{constructionGuide.code}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatCurrency(constructionGuide.amount)}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Proprietário</p>
                      <p className="mt-2 font-semibold text-slate-950 dark:text-slate-100">{constructionGuide.ownerName || process.ownerName}</p>
                      <p className="mt-1 text-xs text-slate-500">{constructionGuide.ownerDocument || process.ownerDocument}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Profissional responsável</p>
                      <p className="mt-2 font-semibold text-slate-950 dark:text-slate-100">{constructionGuide.professionalName || process.technicalLead}</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Responsável pela emissão</p>
                      <p className="mt-2 font-semibold text-slate-950 dark:text-slate-100">{constructionGuideIssuer || "Servidor responsável"}</p>
                      <p className="mt-1 text-xs text-slate-500">{constructionGuide.issuedAt ? new Date(constructionGuide.issuedAt).toLocaleString("pt-BR") : ""}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-950/30">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                      <div>
                        <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">
                          {(constructionGuide.areaM2 ?? process.property.area).toFixed(2)} m² • {constructionGuide.usage || process.property.usage || "Uso não informado"} • {process.property.workType || workTypeInput || "Natureza não informada"}
                        </p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          Valor calculado automaticamente pela tabela oficial do workflow financeiro. Vencimento: {constructionGuide.dueDate}.
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button type="button" variant="outline" className="rounded-full" disabled={Boolean(guideBillingBusyKey)} onClick={() => void printGuide("iss_obra", false)}>
                          {guideBillingBusyKey ? (
                                  <Clock3 className="mr-2 h-4 w-4 animate-pulse" />
                                ) : (
                                  <Eye className="mr-2 h-4 w-4" />
                                )}
                                {guideBillingBusyKey ? "Preparando guia..." : "Visualizar guia"}
                        </Button>
                        <Button type="button" variant="outline" className="rounded-full" disabled={Boolean(guideBillingBusyKey)} onClick={() => void printGuide("iss_obra", true)}>
                          {guideBillingBusyKey ? (
                                  <Clock3 className="mr-2 h-4 w-4 animate-pulse" />
                                ) : (
                                  <Printer className="mr-2 h-4 w-4" />
                                )}
                                {guideBillingBusyKey ? "Preparando guia..." : "Imprimir guia"}
                        </Button>
                        {canFinanceConfirmConstructionPayment ? (
                          <Button
                            type="button"
                            className="rounded-full bg-emerald-700 px-5 !text-white shadow-sm hover:bg-emerald-800 [&_*]:!text-white"
                            disabled={processActionBusy === "confirm-construction-payment"}
                            onClick={handleConfirmConstructionPayment}
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            {processActionBusy === "confirm-construction-payment"
                              ? "Confirmando..."
                              : "Confirmar pagamento da obra"}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </>
              ) : constructionGuideRequest && financeCanIssueConstructionGuide ? (
                <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-5 dark:border-sky-500/30 dark:bg-sky-950/25">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">
                        Solicitação de emissão recebida da Análise Urbanística
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                        {process.property.area.toFixed(2)} m² • {process.property.usage || "Uso não informado"} • {process.property.workType || workTypeInput || "Natureza não informada"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Solicitante: {constructionGuideRequester || process.analysis?.assignedTo || "Analista responsável"}
                        {constructionGuideRequest.createdAt ? ` • ${constructionGuideRequest.createdAt}` : ""}
                      </p>
                    </div>
                    <Button
                      type="button"
                      className="shrink-0 rounded-full bg-sky-700 px-6 !text-white hover:bg-sky-800 dark:bg-sky-500 dark:!text-slate-950 dark:hover:bg-sky-400"
                      disabled={
                        processActionBusy === "finance-issue-construction-guide" ||
                        !canFinanceOperate
                      }
                      onClick={handleIssueConstructionGuideFromFinance}
                    >
                      <FileKey2 className="mr-2 h-4 w-4" />
                      {processActionBusy === "finance-issue-construction-guide"
                        ? "Emitindo..."
                        : "Emitir guia de ISSQN / Projeto"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
                  {constructionGuideIssuerMode === "analise"
                    ? "Nenhuma guia de ISSQN / Projeto foi gerada ainda. A emissão é responsabilidade da Análise Urbanística; após gerar, ela aparece automaticamente aqui para controle."
                    : "Nenhuma guia foi encaminhada ao Financeiro para emissão. A Análise Urbanística precisa concluir os documentos, confirmar os dados da obra e fazer o encaminhamento."}
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {!isExternalProcessViewer && activeTab === "financeiro" && !isHabiteSeProcess && (
          <Card className={cardShell}>
            <CardHeader className="border-b border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-slate-950 dark:text-slate-100">
                    <FileBadge2 className="h-5 w-5 text-violet-700 dark:text-violet-300" />
                    Guia de Pagamento - Aprovação / Alvará
                  </CardTitle>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                    Cálculo: área aprovada × valor de referência do m² para o tipo de obra e acabamento × alíquota municipal, somado à taxa fixa do Alvará quando configurada. Habite-se não pertence a este fluxo.
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={`rounded-full font-semibold ${
                    !approvalPaymentRequired
                      ? "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
                      : approvalGuide?.status === "compensada"
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : approvalGuide
                          ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-300"
                          : constructionPaymentCompensated && allAnalysisDocumentsApproved && !hasOpenAnalysisRequirements
                            ? "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-500/40 dark:bg-sky-950/40 dark:text-sky-300"
                            : "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
                  }`}
                >
                  {!approvalPaymentRequired
                    ? "Cobrança desativada"
                    : approvalGuide?.status === "compensada"
                      ? "Pagamento confirmado"
                      : approvalGuide
                        ? "Aguardando pagamento"
                        : constructionPaymentCompensated && allAnalysisDocumentsApproved && !hasOpenAnalysisRequirements
                          ? "Pronta para emissão"
                          : "Aguardando pré-requisitos"}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-5 pt-5">
              {!approvalPaymentRequired ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300">
                  Esta Prefeitura não exige a guia de aprovação/Alvará neste workflow. O Habite-se é aberto em protocolo próprio e independente.
                </div>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Área aprovada</p>
                      <p className="mt-2 font-semibold text-slate-950 dark:text-slate-100">
                        {approvalGuidePreview.areaM2.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Tipo / acabamento</p>
                      <p className="mt-2 font-semibold text-slate-950 dark:text-slate-100">
                        {process.property.usage || "Não informado"} • {constructionStandardLabel}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Referência do m²</p>
                      <p className="mt-2 font-semibold text-slate-950 dark:text-slate-100">
                        {formatCurrency(approvalGuidePreview.baseValueM2)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Alíquota</p>
                      <p className="mt-2 font-semibold text-slate-950 dark:text-slate-100">
                        {approvalGuidePreview.aliquotPercent.toLocaleString("pt-BR")}%
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatCurrency(approvalGuidePreview.licenseUnitValue)} / m² efetivo
                      </p>
                    </div>
                    <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-500/30 dark:bg-violet-950/30">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700 dark:text-violet-300">Total da guia</p>
                      <p className="mt-2 font-bold text-slate-950 dark:text-white">
                        {formatCurrency(approvalGuide?.amount ?? approvalGuidePreview.totalAmount)}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Alvará fixo: {formatCurrency(approvalGuidePreview.permitFee)}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-950/30">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">
                          {approvalGuide
                            ? `${approvalGuide.code} • ${formatCurrency(approvalGuide.amount)}`
                            : `${formatCurrency(approvalGuidePreview.licenseAmount)} de taxa de licença + ${formatCurrency(approvalGuidePreview.permitFee)} de Alvará`}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                          {approvalGuide
                            ? `Vencimento: ${approvalGuide.dueDate || "não informado"}. A guia emitida preserva o valor oficial gravado no processo.`
                            : "A emissão usa a tabela financeira oficial da Prefeitura e grava o valor calculado no processo."}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {approvalGuide ? (
                          <>
                            <Button type="button" variant="outline" className="rounded-full" disabled={Boolean(guideBillingBusyKey)} onClick={() => void printGuide("aprovacao_final", false)}>
                              {guideBillingBusyKey ? (
                                  <Clock3 className="mr-2 h-4 w-4 animate-pulse" />
                                ) : (
                                  <Eye className="mr-2 h-4 w-4" />
                                )}
                                {guideBillingBusyKey ? "Preparando guia..." : "Visualizar guia"}
                            </Button>
                            <Button type="button" variant="outline" className="rounded-full" disabled={Boolean(guideBillingBusyKey)} onClick={() => void printGuide("aprovacao_final", true)}>
                              {guideBillingBusyKey ? (
                                  <Clock3 className="mr-2 h-4 w-4 animate-pulse" />
                                ) : (
                                  <Printer className="mr-2 h-4 w-4" />
                                )}
                                {guideBillingBusyKey ? "Preparando guia..." : "Imprimir guia"}
                            </Button>
                            {approvalGuide.status !== "compensada" && canFinanceOperate ? (
                              <Button
                                type="button"
                                className="rounded-full bg-emerald-700 px-5 !text-white shadow-sm hover:bg-emerald-800 [&_*]:!text-white"
                                disabled={processActionBusy === "confirm-approval-payment"}
                                onClick={() => void handleConfirmApprovalPayment()}
                              >
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                {processActionBusy === "confirm-approval-payment"
                                  ? "Confirmando..."
                                  : "Confirmar pagamento"}
                              </Button>
                            ) : null}
                          </>
                        ) : (
                          <Button
                            type="button"
                            className="rounded-full bg-violet-700 px-6 !text-white shadow-sm hover:bg-violet-800 [&_*]:!text-white"
                            disabled={
                              processActionBusy === "generate-approval-guide" ||
                              !constructionPaymentCompensated ||
                              !allAnalysisDocumentsApproved ||
                              hasOpenAnalysisRequirements ||
                              !canAnalysisOperate ||
                              !ownsCurrentProcessStage ||
                              !process.property.constructionStandard ||
                              !approvalGuidePreview.profile ||
                              approvalGuidePreview.baseValueM2 <= 0 ||
                              approvalGuidePreview.totalAmount <= 0
                            }
                            onClick={handleGenerateApprovalGuide}
                          >
                            <FileKey2 className="mr-2 h-4 w-4" />
                            {processActionBusy === "generate-approval-guide"
                              ? "Emitindo..."
                              : "Emitir guia de aprovação / Alvará"}
                          </Button>
                        )}
                      </div>
                    </div>
                    {!approvalGuide &&
                    (!process.property.constructionStandard ||
                      !approvalGuidePreview.profile ||
                      approvalGuidePreview.baseValueM2 <= 0) ? (
                      <p className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-300">
                        {!process.property.constructionStandard
                          ? "O padrão de acabamento precisa estar definido no cadastro da obra antes do cálculo."
                          : "Configure a tabela oficial do tipo de obra, acabamento, alíquota e taxa do Alvará no Financeiro antes da emissão."}
                      </p>
                    ) : null}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          )}

          {activeTab === "historico" && (
          <Card className={cardShell}>
            <CardHeader className="border-b border-slate-100 pb-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-slate-950">
                    <Route className="h-5 w-5 text-sky-700" />
                    Fluxo do processo
                  </CardTitle>
                  <p className="mt-1 text-sm text-slate-500">
                    Veja por onde o processo passou, quando foi encaminhado e onde está agora.
                  </p>
                </div>
                <div
                  data-process-live-state={process.status}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    isFinalProcessStatus
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-sky-200 bg-sky-50 text-sky-800"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isFinalProcessStatus ? "bg-emerald-600" : "bg-sky-600"
                    }`}
                  />
                  {isFinalProcessStatus ? "Concluído" : "Em andamento"}
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6 pt-5">
              <div
                className={`rounded-2xl border bg-gradient-to-r p-5 ${
                  isFinalProcessStatus
                    ? "border-emerald-200 from-emerald-50 to-white"
                    : "border-sky-200 from-sky-50 to-white"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p
                      className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${
                        isFinalProcessStatus ? "text-emerald-700" : "text-sky-700"
                      }`}
                    >
                      {isFinalProcessStatus ? "Situação atual" : "Onde está agora"}
                    </p>
                    <p className="mt-2 text-base font-bold text-slate-950">
                      {isFinalProcessStatus ? "Processo concluído" : currentOrganizationPath}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {isFinalProcessStatus
                        ? process.processControl?.checkpoint || `Situação final: ${statusLabel(process.status)}`
                        : holdsIssuedIssInsideUrbanism
                          ? "Análise Urbanística em andamento"
                          : statusLabel(process.status)}
                      {!isFinalProcessStatus &&
                      /analise|urban|obra|engenharia/.test(normalizedCurrentFolder) &&
                      process.analysis?.assignedTo
                        ? ` • Responsável: ${process.analysis.assignedTo}`
                        : ""}
                    </p>
                  </div>
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border bg-white ${
                      isFinalProcessStatus
                        ? "border-emerald-200 text-emerald-700"
                        : "border-sky-200 text-sky-700"
                    }`}
                  >
                    {isFinalProcessStatus ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <Building2 className="h-5 w-5" />
                    )}
                  </div>
                </div>
              </div>

              <div className="relative">
                <div className="absolute bottom-5 left-[19px] top-5 w-px bg-slate-200" />

                <div className="relative flex gap-4 pb-5">
                  <div className="z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-4 border-white bg-emerald-600 text-white shadow-sm">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Entrada do processo
                        </p>
                        <p className="mt-1 font-semibold text-slate-950">{protocolOrganizationPath}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          Processo recebido e registrado oficialmente pela unidade de Protocolo.
                        </p>
                      </div>
                      {protocolStartedAt ? (
                        <div className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                          <Clock3 className="h-3.5 w-3.5" />
                          {protocolStartedAt}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {showAnalysisMilestone ? (
                  <div className="relative flex gap-4 pb-5">
                    <div className="z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-4 border-white bg-emerald-600 text-white shadow-sm">
                      <FileCheck2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                            Análise Urbanística
                          </p>
                          <p className="mt-1 font-semibold text-slate-950">
                            {getOrganizationPath(URBAN_ANALYSIS_DEPARTMENT)}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            Processo recebido pela mesa técnica
                            {!isExternalProcessViewer && process.analysis?.assignedTo ? ` • Responsável pela análise: ${process.analysis.assignedTo}` : ""}.
                          </p>
                        </div>
                        {analysisStartedAt ? (
                          <div className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                            <Clock3 className="h-3.5 w-3.5" />
                            {analysisStartedAt}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                {hasTransitHistory ? (
                  transitSteps.map((dispatch, index) => {
                    const isLast = index === transitSteps.length - 1;
                    const isCurrentTransit = isLast && !isFinalProcessStatus;
                    return (
                      <div key={dispatch.id} className="relative flex gap-4 pb-5">
                        <div className={`z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-4 border-white shadow-sm ${
                          isCurrentTransit ? "bg-sky-700 text-white" : "bg-emerald-600 text-white"
                        }`}>
                          {isCurrentTransit ? <Building2 className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                        </div>

                        <div className={`min-w-0 flex-1 rounded-2xl border p-4 ${
                          isCurrentTransit ? "border-sky-200 bg-sky-50/70" : "border-slate-200 bg-white"
                        }`}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                {isCurrentTransit ? "Unidade atual" : "Encaminhado para"}
                              </p>
                              <p className="mt-1 font-semibold text-slate-950">
                                {getOrganizationPath(dispatch.to)}
                              </p>
                              <p className="mt-2 text-sm text-slate-600">
                                Origem: <span className="font-medium text-slate-800">{getOrganizationPath(dispatch.from)}</span>
                              </p>
                              {dispatch.subject ? (
                                <p className="mt-1 text-sm text-slate-500">{dispatch.subject}</p>
                              ) : null}
                            </div>

                            <div className="flex flex-col items-end gap-2">
                              {dispatch.createdAt ? (
                                <div className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                                  <Clock3 className="h-3.5 w-3.5" />
                                  {dispatch.createdAt}
                                </div>
                              ) : null}
                              <Badge
                                variant="outline"
                                className={`rounded-full ${
                                  isCurrentTransit
                                    ? "border-sky-200 bg-white text-sky-800"
                                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                }`}
                              >
                                {isCurrentTransit ? "Atual" : "Concluído"}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="relative flex gap-4 pb-5">
                    <div className="z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-4 border-white bg-sky-700 text-white shadow-sm">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
                      <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                        isFinalProcessStatus ? "text-emerald-700" : "text-sky-700"
                      }`}>
                        {isFinalProcessStatus ? "Etapa final" : "Unidade atual"}
                      </p>
                      <p className="mt-1 font-semibold text-slate-950">
                        {isFinalProcessStatus ? "Processo concluído" : currentOrganizationPath}
                      </p>
                      <p className="mt-2 text-sm text-slate-600">
                        {isFinalProcessStatus
                          ? process.processControl?.checkpoint || "A conclusão administrativa foi registrada no processo."
                          : showAnalysisMilestone && /financ/.test(normalizedCurrentFolder)
                            ? "Encaminhado ao Financeiro após a conclusão da etapa técnica e emissão da Guia de ISSQN / Projeto."
                            : "A unidade atual é a última etapa registrada para este processo."}
                      </p>
                    </div>
                  </div>
                )}
              </div>

                            {isFinalProcessStatus ? (
                <div data-process-final-milestone="true" className="relative mt-1 flex gap-4">
                  <div className="z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-4 border-white bg-emerald-600 text-white shadow-sm">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                          Conclusão
                        </p>
                        <p className="mt-1 font-semibold text-slate-950">
                          {isHabiteSeProcess ? "Habite-se concluído" : "Processo concluído"}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {process.processControl?.checkpoint ||
                            "A decisão final foi registrada e permanece preservada no histórico oficial."}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="rounded-full border-emerald-200 bg-white text-emerald-800"
                      >
                        {statusLabel(process.status)}
                      </Badge>
                    </div>
                  </div>
                </div>
              ) : null}

{isInternalRole(session.role) && ownsCurrentProcessStage && !isProtocolTrackingOnly ? (
                <form
                  id="despacho"
                  data-dispatch-panel="true"
                  onSubmit={handleDispatchSubmit}
                  className="overflow-hidden rounded-[22px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f7fafc_100%)] shadow-[0_12px_30px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-[linear-gradient(180deg,#111f31_0%,#0b1725_100%)]"
                >
                  <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 dark:border-slate-700 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700 shadow-sm dark:border-sky-500/30 dark:bg-sky-950/50 dark:text-sky-200">
                        <Workflow className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-950 dark:text-white">Encaminhar processo</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                          Escolha a unidade no organograma, informe o assunto e defina o prazo.
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="max-w-full rounded-full border-slate-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
                      Origem: {currentOrganizationPath}
                    </Badge>
                  </div>

                  <div className="p-4">
                    {organizationStatus ? (
                      <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200">
                        {organizationStatus}
                      </div>
                    ) : null}

                    <div
                      data-dispatch-organogram="true"
                      className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.07)] dark:border-slate-700 dark:bg-slate-950/55"
                    >
                      <div data-dispatch-organogram-header="true" className="flex flex-col gap-3 border-b border-slate-200 bg-[linear-gradient(135deg,#f8fbff_0%,#eef6fb_100%)] px-4 py-4 dark:border-slate-700 dark:bg-[linear-gradient(135deg,#132338_0%,#0d1b2b_100%)] sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-700 dark:text-slate-100">
                            Organograma para despacho
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                            Selecione o destino pela hierarquia oficial da Prefeitura. Unidades superiores e subordinadas permanecem agrupadas e clicáveis.
                          </p>
                        </div>
                        <span className="inline-flex h-8 items-center rounded-full border border-sky-200 bg-sky-50 px-3 text-[10px] font-bold text-sky-800 shadow-sm dark:border-sky-500/30 dark:bg-sky-950/60 dark:text-sky-100">
                          {organizationDestinations.length} unidades oficiais
                        </span>
                      </div>

                      <div
                        data-dispatch-organogram-grid="true"
                        data-dispatch-organogram-hierarchy="true"
                        className="grid gap-3 p-3 lg:grid-cols-2 2xl:grid-cols-3"
                      >
                        {organizationDestinations
                          .filter(
                            (department) =>
                              !department.parentDepartmentId ||
                              !organizationDestinations.some(
                                (candidate) => candidate.id === department.parentDepartmentId,
                              ),
                          )
                          .sort(
                            (a, b) =>
                              a.sortOrder - b.sortOrder ||
                              a.name.localeCompare(b.name, "pt-BR"),
                          )
                          .map((rootDepartment) => {
                            const branch: Array<{
                              department: (typeof organizationDestinations)[number];
                              depth: number;
                            }> = [];

                            const collectChildren = (
                              parentId: string,
                              depth: number,
                            ): void => {
                              organizationDestinations
                                .filter(
                                  (candidate) =>
                                    candidate.parentDepartmentId === parentId,
                                )
                                .sort(
                                  (a, b) =>
                                    a.sortOrder - b.sortOrder ||
                                    a.name.localeCompare(b.name, "pt-BR"),
                                )
                                .forEach((child) => {
                                  branch.push({ department: child, depth });
                                  collectChildren(child.id, depth + 1);
                                });
                            };

                            collectChildren(rootDepartment.id, 1);

                            const branchRows = [
                              { department: rootDepartment, depth: 0 },
                              ...branch,
                            ];

                            return (
                              <section
                                key={`org-branch-${rootDepartment.id}`}
                                data-organogram-branch="true"
                                className="overflow-hidden rounded-[20px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfe_100%)] shadow-[0_9px_24px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-[linear-gradient(180deg,#101f31_0%,#0b1725_100%)]"
                              >
                                <div className="border-b border-slate-100 bg-slate-50/80 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/70">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                                        Estrutura institucional
                                      </p>
                                      <p className="mt-0.5 truncate text-[11px] font-bold text-slate-800 dark:text-slate-100">
                                        {getOrganizationPath(rootDepartment.name)}
                                      </p>
                                    </div>
                                    <span className="inline-flex min-w-7 items-center justify-center rounded-full border border-slate-200 bg-white px-2 py-1 text-[9px] font-bold text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                                      {branchRows.length}
                                    </span>
                                  </div>
                                </div>

                                <div className="space-y-2 p-2.5">
                                  {branchRows.map(({ department, depth }) => {
                                    const selected = dispatchTo === department.id;
                                    const hierarchy =
                                      getOrganizationPathRecords(department.name);
                                    const hierarchyLabel = hierarchy
                                      .map((item) =>
                                        item.code?.trim()
                                          ? `${item.code.trim()} — ${item.name}`
                                          : item.name,
                                      )
                                      .join(" › ");
                                    const isCurrentUnit =
                                      department.name === currentFolder ||
                                      hierarchyLabel === currentOrganizationPath;
                                    const isInitialAnalysisTarget =
                                      department.id === initialUrbanAnalysisDestination?.id;
                                    const routeRestricted =
                                      requiresInitialUrbanAnalysisDispatch && !isInitialAnalysisTarget;

                                    return (
                                      <div
                                        key={`org-destination-row-${department.id}`}
                                        className="relative"
                                        style={{
                                          marginLeft: `${Math.min(depth, 3) * 18}px`,
                                        }}
                                      >
                                        {depth > 0 ? (
                                          <>
                                            <span
                                              aria-hidden="true"
                                              className="absolute -left-[11px] top-0 h-1/2 w-px bg-slate-200 dark:bg-slate-700"
                                            />
                                            <span
                                              aria-hidden="true"
                                              className="absolute -left-[11px] top-1/2 h-px w-[9px] bg-slate-200 dark:bg-slate-700"
                                            />
                                          </>
                                        ) : null}

                                        <button
                                          type="button"
                                          data-organogram-destination="true"
                                          data-organogram-depth={depth}
                                          data-selected={selected ? "true" : "false"}
                                          data-selected-organogram-card={
                                            selected ? "true" : "false"
                                          }
                                          data-current-organogram-unit={
                                            isCurrentUnit ? "true" : "false"
                                          }
                                          data-contrast-surface={selected ? "dark" : undefined}
                                          disabled={isCurrentUnit || routeRestricted}
                                          onClick={() => setDispatchTo(department.id)}
                                          className={`sig-dispatch-destination-card group relative w-full min-w-0 rounded-[15px] border px-3 py-2.5 text-left transition-all duration-200 ${
                                            selected
                                              ? "border-sky-500 bg-[linear-gradient(135deg,#0b3554_0%,#075985_58%,#0f78b8_100%)] shadow-[0_10px_24px_rgba(7,89,133,0.25)] ring-2 ring-sky-200/70 dark:ring-sky-500/25"
                                              : isCurrentUnit
                                                ? "cursor-default border-emerald-200 bg-emerald-50/85 shadow-[0_5px_14px_rgba(16,185,129,0.07)] dark:border-emerald-500/30 dark:bg-emerald-950/20"
                                                : "border-slate-200 bg-white shadow-[0_5px_14px_rgba(15,23,42,0.05)] hover:-translate-y-px hover:border-sky-300 hover:bg-sky-50/70 hover:shadow-[0_10px_22px_rgba(15,23,42,0.08)] dark:border-slate-700 dark:bg-slate-900 dark:hover:border-sky-500/50 dark:hover:bg-sky-950/30"
                                          }`}
                                          title={
                                            isCurrentUnit
                                              ? `Unidade atual: ${getOrganizationPath(department.name)}`
                                              : routeRestricted
                                                ? "Fluxo inicial do Habite-se: encaminhe para Análise Urbanística."
                                                : getOrganizationPath(department.name)
                                          }
                                        >
                                          <div className="flex min-w-0 items-center gap-2.5">
                                            <span
                                              data-organogram-code="true"
                                              data-organogram-code-surface="blue"
                                              data-contrast-surface="dark"
                                              data-ui="badge"
                                              className={`sig-dispatch-code-badge sig-organogram-code-badge inline-flex h-8 min-w-[44px] shrink-0 items-center justify-center rounded-[10px] border px-2 text-[9px] font-black tracking-[0.10em] shadow-sm ${
                                                selected
                                                  ? "border-white/20 bg-white/15"
                                                  : isCurrentUnit
                                                    ? "border-emerald-400/30 bg-[linear-gradient(135deg,#047857_0%,#059669_100%)]"
                                                    : "border-sky-200 bg-[linear-gradient(135deg,#075985_0%,#0f78b8_100%)] dark:border-sky-500/30"
                                              }`}
                                            >
                                              <strong
                                                data-organogram-code-text="true"
                                                style={{
                                                  color: "#ffffff",
                                                  WebkitTextFillColor: "#ffffff",
                                                  opacity: 1,
                                                  fontWeight: 800,
                                                }}
                                                className="sig-dispatch-code-text block whitespace-nowrap text-[10px] font-extrabold leading-none tracking-[0.055em] !text-white"
                                              >
                                                {department.code?.trim() || "UNID"}
                                              </strong>
                                            </span>

                                            <span className="min-w-0 flex-1">
                                              <span
                                                data-organogram-destination-title="true"
                                                className={`sig-dispatch-title block truncate text-[12px] font-extrabold ${
                                                  selected
                                                    ? "!text-white"
                                                    : "text-slate-950 dark:text-white"
                                                }`}
                                              >
                                                {department.name}
                                              </span>
                                              <span
                                                data-organogram-destination-path="true"
                                                className={`sig-dispatch-path mt-0.5 block truncate text-[9px] leading-4 ${
                                                  selected
                                                    ? "!text-white/90"
                                                    : "text-slate-500 dark:text-slate-400"
                                                }`}
                                              >
                                                {hierarchyLabel || department.name}
                                              </span>
                                            </span>

                                            {isCurrentUnit ? (
                                              <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-1 text-[8px] font-extrabold uppercase tracking-[0.08em] text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/50 dark:text-emerald-200">
                                                Origem atual
                                              </span>
                                            ) : selected ? (
                                              <span className="sig-dispatch-selected-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/15 text-white shadow-sm">
                                                <CheckCircle2 className="h-4 w-4 !text-white" />
                                              </span>
                                            ) : (
                                              <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover:text-sky-600 dark:text-slate-600 dark:group-hover:text-sky-300" />
                                            )}
                                          </div>

                                          {selected ? (
                                            <span className="sig-dispatch-selected-label mt-2 inline-flex rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[8px] font-extrabold uppercase tracking-[0.12em] !text-white">
                                              Destino selecionado
                                            </span>
                                          ) : null}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              </section>
                            );
                          })}
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(250px,1fr)_minmax(320px,1.25fr)_180px_auto] xl:items-center">
                      <Select value={dispatchTo} onValueChange={setDispatchTo}>
                        <SelectTrigger className="min-h-11 rounded-xl bg-white dark:bg-slate-950">
                          <SelectValue placeholder="Selecionar unidade de destino" />
                        </SelectTrigger>
                        <SelectContent>
                          {organizationDestinations
                            .filter((department) => department.name !== currentFolder)
                            .filter(
                              (department) =>
                                !requiresInitialUrbanAnalysisDispatch ||
                                department.id === initialUrbanAnalysisDestination?.id,
                            )
                            .map((department) => (
                              <SelectItem key={department.id} value={department.id}>
                                {getOrganizationPath(department.name)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>

                      <Input
                        value={dispatchSubject}
                        onChange={(event) => setDispatchSubject(event.target.value)}
                        placeholder="Motivo ou assunto do encaminhamento"
                        className="min-h-11 rounded-xl bg-white dark:bg-slate-950"
                      />

                      <Input
                        type="date"
                        value={dispatchDueDate}
                        onChange={(event) => setDispatchDueDate(event.target.value)}
                        aria-label="Data do encaminhamento"
                        title="Data preenchida automaticamente com o dia atual"
                        className="min-h-11 rounded-xl bg-white font-semibold text-slate-800 dark:bg-slate-950 dark:text-slate-100"
                      />

                      <Button
                        type="submit"
                        data-premium-dark-action="true"
                        className="min-h-11 rounded-xl bg-[linear-gradient(135deg,#075985_0%,#0284c7_100%)] px-5 font-bold !text-white shadow-[0_10px_22px_rgba(7,89,133,0.22)] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-65 [&_*]:!text-white"
                        disabled={
                          processActionBusy === "dispatch" ||
                          !dispatchTo ||
                          !dispatchSubject.trim() ||
                          !dispatchDueDate ||
                          organizationDestinations.length === 0
                        }
                      >
                        <Workflow className="mr-2 h-4 w-4" />
                        {processActionBusy === "dispatch" ? "Encaminhando..." : "Encaminhar"}
                      </Button>
                    </div>

                    {processActionStatus &&
                    /encaminh|despach|destino|organograma|tramita/i.test(processActionStatus) ? (
                      <div
                        data-dispatch-feedback="true"
                        className={`mt-3 rounded-xl border px-3 py-2.5 text-sm font-semibold ${
                          /não|erro|falha|sem acesso|obrigat|pendente/i.test(processActionStatus)
                            ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-950/30 dark:text-rose-200"
                            : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-200"
                        }`}
                      >
                        {processActionStatus}
                      </div>
                    ) : null}
                  </div>
                </form>
              ) : null}
            </CardContent>
          </Card>
          )}
        </div>
        ) : null}
      </div>
      ) : null}

      <Dialog open={!!viewerDocument} onOpenChange={(open) => !open && setViewerDocumentId(null)}>
        <DialogContent className="max-h-[96vh] max-w-[96vw] overflow-hidden border-slate-200 p-0">
          <DialogHeader className="border-b border-slate-200 px-6 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <DialogTitle className="text-left text-lg text-slate-950">{viewerDocument?.label}</DialogTitle>
                <p className="mt-1 text-sm text-slate-500">{viewerDocument?.fileName || "Documento técnico"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setViewerZoom((value) => Math.max(0.6, Number((value - 0.2).toFixed(2))))}>
                  <ZoomOut className="mr-2 h-4 w-4" />
                  Zoom -
                </Button>
                <Button type="button" variant="outline" className="rounded-full" onClick={() => setViewerZoom((value) => Math.min(2.4, Number((value + 0.2).toFixed(2))))}>
                  <ZoomIn className="mr-2 h-4 w-4" />
                  Zoom +
                </Button>
                {viewerDocument ? (
                  <a
                    href={getDocumentFallbackUrl(viewerDocument)}
                    download={viewerDocument.fileName || `${viewerDocument.label}.pdf`}
                    className="inline-flex items-center rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </a>
                ) : null}
              </div>
            </div>
          </DialogHeader>

          <div className="grid h-[82vh] gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="relative overflow-auto bg-slate-950/95 p-6">
              <div
                ref={viewerAreaRef}
                className="relative mx-auto min-h-[720px] w-full max-w-[980px] cursor-crosshair overflow-hidden rounded-[24px] bg-white shadow-2xl"
                onClick={handleViewerClick}
              >
                <div style={{ transform: `scale(${viewerZoom})`, transformOrigin: "top center" }} className="min-h-[720px] w-full">
                  {viewerDocument?.filePath && !documentAccessUrls[viewerDocument.id] ? (
                    <div className="flex min-h-[720px] items-center justify-center p-8 text-center">
                      <p className={documentAccessErrors[viewerDocument.id] ? "text-sm text-red-600" : "text-sm text-slate-500"}>
                        {documentAccessErrors[viewerDocument.id]
                          ? "Não foi possível abrir o arquivo armazenado com segurança."
                          : "Gerando acesso seguro ao documento..."}
                      </p>
                    </div>
                  ) : viewerDocument?.mimeType?.startsWith("image/") ? (
                    <img src={viewerDocument ? getDocumentFallbackUrl(viewerDocument) : undefined} alt={viewerDocument?.fileName || viewerDocument?.label} className="min-h-[720px] w-full object-contain" />
                  ) : (
                    <iframe
                      src={viewerDocument ? getDocumentFallbackUrl(viewerDocument) : undefined}
                      title={viewerDocument?.fileName || viewerDocument?.label}
                      className="h-[720px] w-full"
                    />
                  )}
                </div>

                {(viewerDocument?.annotations ?? []).map((annotation) => (
                  <button
                    key={annotation.id}
                    type="button"
                    className="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-amber-500 text-xs font-bold text-slate-950 shadow-lg"
                    style={{ left: `${annotation.x}%`, top: `${annotation.y}%` }}
                    title={`${annotation.note} • ${annotation.author}`}
                  >
                    !
                  </button>
                ))}

                {annotationPoint ? (
                  <div
                    className="absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-sky-600 text-xs font-bold text-white shadow-lg"
                    style={{ left: `${annotationPoint.x}%`, top: `${annotationPoint.y}%` }}
                  >
                    +
                  </div>
                ) : null}
              </div>
            </div>

            <div className="border-l border-slate-200 bg-white p-5">
              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-normal uppercase tracking-[0.1em] text-slate-400">Controles</p>
                <p className="mt-3 text-sm text-slate-600">Use zoom para ampliar o documento. Clique no desenho para registrar marcacoes tecnicas quando o arquivo for projeto arquitetonico ou memorial.</p>
                <p className="mt-3 text-sm font-normal text-slate-700">Zoom atual: {Math.round(viewerZoom * 100)}%</p>
              </div>

              {canAnnotateViewer ? (
                <div className="mt-4 rounded-[20px] border border-slate-200 p-4">
                  <p className="text-sm font-medium text-slate-900">Marcadores de desenho</p>
                  <p className="mt-2 text-sm text-slate-500">Clique no documento para definir o ponto e descreva a observacao tecnica.</p>
                  <Input value={annotationDraft} onChange={(event) => setAnnotationDraft(event.target.value)} placeholder="Ex.: ajustar cota do recuo frontal" className="mt-4" />
                  <Button type="button" className="mt-3 w-full rounded-full bg-[#143b63] hover:bg-[#102f50]" onClick={handleSaveAnnotation} disabled={!annotationPoint || !annotationDraft.trim()}>
                    Salvar marcador
                  </Button>
                </div>
              ) : null}

              <div className="mt-4 rounded-[20px] border border-slate-200 p-4">
                <p className="text-sm font-medium text-slate-900">Anotacoes registradas</p>
                <div className="mt-3 space-y-3">
                  {(viewerDocument?.annotations ?? []).length === 0 ? (
                    <p className="text-sm text-slate-500">Nenhuma anotacao registrada neste documento.</p>
                  ) : (
                    viewerDocument?.annotations?.map((annotation, index) => (
                      <div key={annotation.id} className="rounded-2xl bg-slate-50 p-3">
                        <p className="text-sm font-normal text-slate-900">Marcador {index + 1}</p>
                        <p className="mt-1 text-sm text-slate-600">{annotation.note}</p>
                        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">{annotation.author} • {annotation.createdAt}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </PageShell>
    </PortalFrame>
  );
}



