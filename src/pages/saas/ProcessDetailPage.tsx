import { FormEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, Building2, CheckCircle2, Clock3, Download, Eye, FileCheck2, FileKey2, FileStack, Landmark, Maximize2, MessageSquareMore, Printer, Route, ShieldAlert, Signature, UserRound, Workflow, ZoomIn, ZoomOut } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GuiaRecolhimentoOficialProps, openGuiaRecolhimentoOficialWindow } from "@/components/GuiaRecolhimentoOficial";
import { FileDropZone, type UploadedFileItem } from "@/components/platform/FileDropZone";
import { PageHero } from "@/components/platform/PageHero";
import { PageShell, PageStatsRow } from "@/components/platform/PageShell";
import { PixQrCode } from "@/components/platform/PixQrCode";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { StatCard } from "@/components/platform/StatCard";
import { UserAvatar } from "@/components/platform/UserAvatar";
import { ProcessIdentityPanel } from "@/components/platform/ProcessIdentityPanel";
import { usePlatformData } from "@/hooks/usePlatformData";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { usePlanEntitlements } from "@/hooks/usePlanEntitlements";
import {
  listRecoverableProcessFiles,
  type RecoverableProcessFile,
} from "@/integrations/r2/client";
import { uploadFileToStorage } from "@/integrations/r2/storage";
import {
  listRemoteMunicipalDepartments,
  type MunicipalDepartmentRecord,
} from "@/integrations/backend/platform";
import {
  calculateIssGuideAmount,
  canAccessMunicipalArea,
  canTrackProcess,
  isProcessOwnedBySessionDepartment,
  formatCurrency,
  formatOfficialProcessLabel,
  formatOfficialProcessNumber,
  formatOfficialProcessTitle,
  formatProfessionalProcessType,
  getGuideObservation,
  getGuideReference,
  getProcessById,
  getProcessPaymentGuides,
  isInternalRole,
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

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "tamanho não informado";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function toProcessRouteKey(protocol: string) {
  return protocol
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/\s]+/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function resolveProcessFromRoute(processes: ProcessRecord[], routeValue?: string) {
  if (!routeValue) return undefined;
  const decoded = decodeURIComponent(routeValue).trim();
  const byId = getProcessById(decoded, processes);
  if (byId) return byId;
  const normalized = decoded.toLowerCase();
  return processes.find((item) => {
    const protocol = String(item.protocol || "");
    return protocol.toLowerCase() === normalized || toProcessRouteKey(protocol).toLowerCase() === normalized;
  });
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

function buildProtocolGuideHtml(input: {
  protocol: string;
  guideCode: string;
  tenantName: string;
  secretariat: string;
  address: string;
  email: string;
  phone: string;
  title: string;
  ownerName: string;
  technicalLead: string;
  amount: number;
  dueDate: string;
  pixPayload: string;
}) {
  return `
    <html>
      <head>
        <title>${input.guideCode}</title>
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          body { margin: 0; font-family: Arial, sans-serif; background: #eef4fb; color: #0f172a; }
          .page { width: 190mm; max-width: 190mm; margin: 0 auto; padding: 8mm 0; }
          .sheet { background: white; border: 1px solid #d8e4f1; border-radius: 18px; overflow: hidden; }
          .top { background: linear-gradient(135deg,#123a58 0%,#1b4f73 58%,#1e5a80 100%); color: white; padding: 18px 22px; }
          .title { font-size: 28px; font-weight: 800; }
          .sub { margin-top: 4px; font-size: 12px; line-height: 1.6; color: #dceaf5; }
          .row { display: grid; grid-template-columns: repeat(4,1fr); gap: 12px; padding: 16px 20px 0; }
          .box { border: 1px solid #dde7f2; border-radius: 12px; background: #fbfdff; padding: 12px; }
          .label { font-size: 10px; text-transform: uppercase; letter-spacing: .18em; color: #64748b; }
          .value { margin-top: 6px; font-size: 14px; font-weight: 700; color: #12253d; }
          .section { margin: 16px 20px 20px; border: 1px solid #dde7f2; border-radius: 14px; padding: 16px; background: #fbfdff; }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="sheet">
            <div class="top">
              <div class="title">SIGAPRO - DAM Municipal</div>
              <div class="sub">${input.tenantName}</div>
              <div class="sub">${input.secretariat}</div>
              <div class="sub">${input.phone} • ${input.address}</div>
              <div class="sub">${input.email}</div>
            </div>
            <div class="row">
              <div class="box"><div class="label">Protocolo</div><div class="value">${input.protocol}</div></div>
              <div class="box"><div class="label">Guia</div><div class="value">${input.guideCode}</div></div>
              <div class="box"><div class="label">Valor</div><div class="value">R$ ${input.amount.toFixed(2).replace(".", ",")}</div></div>
              <div class="box"><div class="label">Vencimento</div><div class="value">${input.dueDate}</div></div>
            </div>
            <div class="section">
              <div class="label">Dados do Projeto</div>
              <div class="value">${input.title}</div>
              <div class="sub" style="color:#475569;margin-top:10px;">Proprietário: ${input.ownerName}</div>
              <div class="sub" style="color:#475569;">Responsável técnico: ${input.technicalLead}</div>
            </div>
            <div class="section">
              <div class="label">Pix Copia e Cola</div>
              <div class="value" style="font-size:12px;word-break:break-all;">${input.pixPayload}</div>
            </div>
          </div>
        </div>
        <script>window.print();</script>
      </body>
    </html>
  `;
}

export function ProcessDetailPage() {
  const { processId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = usePlatformSession();
  const planEntitlements = usePlanEntitlements();
  const { municipality, scopeId, institutionSettingsCompat, name: municipalityName } = useMunicipality();
  const { processes, institutions, sessionUsers, sendProcessMessage, getInstitutionSettings, getUserProfile, addDocumentAnnotation, createRequirement, respondRequirement, completeRequirement, dispatchProcess, setProcessTransitVisibility, markGuideAsPaid, appendProcessDocuments, requestConstructionPaymentGuide, updateIssProjectGuideData, issuePaymentGuide } = usePlatformData();
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const [organizationDepartments, setOrganizationDepartments] = useState<MunicipalDepartmentRecord[]>([]);
  const [organizationStatus, setOrganizationStatus] = useState("");

  useEffect(() => {
    let active = true;
    if (!effectiveScopeId || !isInternalRole(session.role)) {
      setOrganizationDepartments([]);
      setOrganizationStatus("");
      return () => {
        active = false;
      };
    }

    setOrganizationStatus("Carregando organograma...");
    void listRemoteMunicipalDepartments(effectiveScopeId)
      .then((rows) => {
        if (!active) return;
        setOrganizationDepartments(
          rows
            .filter((item) => item.isActive)
            .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR")),
        );
        setOrganizationStatus("");
      })
      .catch((error) => {
        if (!active) return;
        setOrganizationDepartments([]);
        setOrganizationStatus(
          error instanceof Error ? error.message : "Não foi possível carregar o organograma municipal.",
        );
      });

    return () => {
      active = false;
    };
  }, [effectiveScopeId, session.role]);
  const isMasterOrMunicipalAdmin =
    session.role === "master_admin" ||
    session.role === "master_ops" ||
    session.role === "prefeitura_admin";
  const canProtocolOperate =
    isMasterOrMunicipalAdmin || canAccessMunicipalArea(session, "protocolos");
  const canAnalysisOperate =
    isMasterOrMunicipalAdmin || canAccessMunicipalArea(session, "analise");
  const canFinanceOperate =
    isMasterOrMunicipalAdmin || canAccessMunicipalArea(session, "financeiro");
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
  const [dispatchDueDate, setDispatchDueDate] = useState("");
  const [dispatchVisibility, setDispatchVisibility] = useState<"interno" | "externo" | "misto">("interno");
  type ProcessTab = "resumo" | "imovel" | "documentos" | "analise" | "financeiro" | "historico";
  const [activeTab, setActiveTab] = useState<ProcessTab>(() => {
    const requested = new URLSearchParams(location.search).get("aba");
    return requested && ["resumo", "imovel", "documentos", "analise", "financeiro", "historico"].includes(requested)
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
  const [annotationDraft, setAnnotationDraft] = useState("");
  const [annotationPoint, setAnnotationPoint] = useState<{ x: number; y: number } | null>(null);
  const [processActionStatus, setProcessActionStatus] = useState("");
  const [processActionBusy, setProcessActionBusy] = useState("");
  const [constructionAreaInput, setConstructionAreaInput] = useState("");
  const [constructionUsageInput, setConstructionUsageInput] = useState("");
  const [workTypeInput, setWorkTypeInput] = useState("");
  const viewerAreaRef = useRef<HTMLDivElement | null>(null);
  const setProcessTab = (tab: ProcessTab) => {
    if (tab === "analise" && (!planEntitlements.canUseModule("Analise tecnica") || !canAnalysisOperate)) return;
    if (tab === "financeiro" && (!planEntitlements.canUseModule("Financeiro") || !canFinanceOperate)) return;
    const nextParams = new URLSearchParams(location.search);
    nextParams.set("aba", tab);
    navigate({ pathname: location.pathname, search: nextParams.toString() }, { replace: true, preventScrollReset: true });
    setActiveTab(tab);
  };

  const process = resolveProcessFromRoute(processes, processId);

  useEffect(() => {
    if (!process) return;
    setConstructionAreaInput(process.property.area > 0 ? String(process.property.area) : "");
    setConstructionUsageInput(process.property.usage || "");
    setWorkTypeInput(process.property.workType || "");
  }, [process?.id]);

  const ownsCurrentProcessStage =
    !!process && isProcessOwnedBySessionDepartment(session, process);
  const isProtocolTrackingOnly =
    !!process &&
    canProtocolOperate &&
    !ownsCurrentProcessStage &&
    session.role !== "prefeitura_admin" &&
    session.role !== "master_admin" &&
    session.role !== "master_ops";

  useEffect(() => {
    if (!processId || openedProcessRef.current === processId) return;
    openedProcessRef.current = processId;
    const requested = new URLSearchParams(location.search).get("aba");
    const preferredTab: ProcessTab = requested && ["resumo", "imovel", "documentos", "analise", "financeiro", "historico"].includes(requested)
      ? requested as ProcessTab
      : "imovel";
    setActiveTab(isProtocolTrackingOnly && preferredTab !== "resumo" ? "historico" : preferredTab);
  }, [isProtocolTrackingOnly, processId, location.search]);

  useEffect(() => {
    if (!processId) return;
    const requested = new URLSearchParams(location.search).get("aba");
    if (!requested || !["resumo", "imovel", "documentos", "analise", "financeiro", "historico"].includes(requested)) return;
    setActiveTab(isProtocolTrackingOnly && requested !== "resumo" ? "historico" : requested as ProcessTab);
  }, [location.search, isProtocolTrackingOnly, processId]);

  useEffect(() => {
    if (!isProtocolTrackingOnly) return;
    if (activeTab === "historico" || activeTab === "resumo") return;
    setActiveTab("historico");
  }, [activeTab, isProtocolTrackingOnly]);

  useEffect(() => {
    if (!process || !processId) return;
    const canonicalKey = toProcessRouteKey(process.protocol);
    if (!canonicalKey || processId === canonicalKey) return;
    navigate(`/processos/${encodeURIComponent(canonicalKey)}${location.search}`, { replace: true });
  }, [location.search, navigate, process, processId]);
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
  const canAttachToRequirement = (item: typeof process.requirements[number]) =>
    item.status === "aberta" &&
    (isInternalRole(session.role) || session.role === "profissional_externo" || session.role === "proprietario_consulta");

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
  }, [activeTab, canRecoverStoredDocuments, process]);

  // A listagem do processo não carrega PDFs/imagens reais em segundo plano.
  // O acesso assinado é gerado somente na rota dedicada de visualização/análise.
  // Isso elimina reloads de iframe quando o processo recebe atualizações.
  useEffect(() => {
    setDocumentAccessUrls({});
    setDocumentAccessErrors({});
  }, [process?.id]);

  if (!process) {
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
  const paymentGuides = getProcessPaymentGuides(process, tenantSettings);
  const isExternalProcessViewer =
    session.role === "profissional_externo" ||
    session.role === "property_owner" ||
    session.role === "proprietario_consulta";
  const visiblePaymentGuides = isExternalProcessViewer
    ? paymentGuides.filter((guide) => guide.kind === "protocolo" || Boolean(guide.issuedAt && guide.code?.trim()))
    : paymentGuides;
  const uploadedCount = process.documents.filter((document) => document.uploaded).length;
  const protocolGuide = visiblePaymentGuides.find((guide) => guide.kind === "protocolo");
  const canProtocolConfirmPayment =
    protocolGuide?.status === "pendente" &&
    process.status === "pagamento_pendente" &&
    canProtocolOperate;
  const pixPayload = `000201|${tenantSettings?.beneficiarioArrecadacao}|${tenantSettings?.chavePix}|${protocolGuide?.code}|${process.protocol}|${process.ownerName}|${protocolGuide?.amount ?? 0}`;
  const canReviewDocuments =
    ownsCurrentProcessStage &&
    canAnalysisOperate &&
    (
      session.role === "prefeitura_admin" ||
      session.role === "prefeitura_supervisor" ||
      session.role === "analista" ||
      session.role === "master_admin" ||
      session.role === "master_ops"
    );
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
  const constructionGuideRequest = process.dispatches.find(
    (dispatch) =>
      /(issqn|iss|projeto).*guia|guia.*(issqn|iss|projeto)/i.test(dispatch.subject) &&
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
  const displayGuide = constructionGuide ?? protocolGuide;

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
  const organizationById = new Map(
    organizationDepartments.map((department) => [department.id, department]),
  );

  const getOrganizationPath = (departmentName: string) => {
    const normalized = departmentName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLocaleLowerCase("pt-BR");

    const matched = organizationDepartments.find((department) => {
      const name = department.name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLocaleLowerCase("pt-BR");
      const code = department.code.trim().toLocaleLowerCase("pt-BR");
      return name === normalized || (code && code === normalized);
    });

    if (!matched) return departmentName;

    const chain: MunicipalDepartmentRecord[] = [];
    let current: MunicipalDepartmentRecord | undefined = matched;
    const visited = new Set<string>();

    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      chain.unshift(current);
      current = current.parentDepartmentId
        ? organizationById.get(current.parentDepartmentId)
        : undefined;
    }

    return chain
      .map((item) => item.code?.trim() ? `${item.code.trim()} — ${item.name}` : item.name)
      .join(" › ");
  };

  const organizationDestinations = organizationDepartments.filter(
    (department) => department.isActive,
  );

  const rawCurrentFolder = process.processControl?.currentFolder || process.dispatches[0]?.to || process.sla.currentStage;
  const currentFolder =
    process.status === "analise_tecnica" && /^(protocolo|an[aá]lise t[eé]cnica)$/i.test(rawCurrentFolder.trim())
      ? URBAN_ANALYSIS_DEPARTMENT
      : rawCurrentFolder;
  const currentOrganizationPath = getOrganizationPath(currentFolder);

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

  const isFinalProcessStatus = ["deferido", "indeferido", "arquivado"].includes(process.status);
  let currentFlowIndex = 0;
  if (isFinalProcessStatus) {
    currentFlowIndex = 4;
  } else if (constructionGuide || /financ|tesour|arrecad|tribut/.test(normalizedCurrentFolder)) {
    currentFlowIndex = 3;
  } else if (
    /analise|urban|obra|engenharia|fiscal/.test(normalizedCurrentFolder) ||
    ["pagamento_confirmado", "distribuicao", "analise_tecnica", "despacho_intersetorial", "exigencia", "reapresentacao"].includes(process.status)
  ) {
    currentFlowIndex = 2;
  } else if (["guia_emitida", "pagamento_pendente"].includes(process.status)) {
    currentFlowIndex = 1;
  }

  const flowLabels = [
    "Protocolo",
    "Pagamento inicial",
    "Análise Urbanística",
    "Financeiro",
    "Conclusão",
  ];
  const flowSteps = flowLabels.map((label, index) => ({
    key: `municipal-flow-${index}`,
    label,
    state: index < currentFlowIndex ? "done" : index === currentFlowIndex ? "current" : "pending",
  }));
  const currentFlowStatusLabel =
    isFinalProcessStatus
      ? statusLabel(process.status)
      : flowLabels[currentFlowIndex] || statusLabel(process.status);

  const protocolStartedAt =
    process.auditTrail.find((entry) => /processo protocolado|protocolado|abertura/i.test(entry.title))?.at ||
    process.timeline[process.timeline.length - 1]?.at ||
    "";
  const transitSteps = [...process.dispatches].reverse();
  const hasTransitHistory = transitSteps.length > 0;

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
  const canViewCompleteCadastro = !isProtocolTrackingOnly &&
    isInternalRole(session.role) &&
    matchesOperationalScope(effectiveScopeId, process) &&
    (canProtocolOperate || canAnalysisOperate || canFinanceOperate);
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
      label: "Análise Urbanística",
      enabled:
        !isProtocolTrackingOnly &&
        planEntitlements.canUseModule("Analise tecnica") &&
        canAnalysisOperate,
    },
    {
      key: "financeiro" as ProcessTab,
      label: "Financeiro",
      enabled:
        !isProtocolTrackingOnly &&
        planEntitlements.canUseModule("Financeiro") &&
        canFinanceOperate,
    },
    { key: "historico" as ProcessTab, label: "Acompanhamento", enabled: true },
    { key: "resumo" as ProcessTab, label: "Resumo", enabled: true },
  ].filter((item) => item.enabled);

  const showPrimaryDetailColumn = ["imovel", "documentos", "analise", "financeiro", "historico"].includes(activeTab);
  const showSecondaryDetailColumn = ["analise", "financeiro"].includes(activeTab);
  const useSplitDetailLayout = false;
  const cardShell = "min-w-0 rounded-[18px] border border-[#CBD5E1] bg-white shadow-[0_10px_28px_rgba(15,23,42,0.06)]";
  const printGuide = (guideKind: PaymentGuideKind = "protocolo", autoPrint = true) => {
    const selectedGuide = visiblePaymentGuides.find((guide) => guide.kind === guideKind);
    if (!selectedGuide) return;
    const issuedAt = selectedGuide.issuedAt || new Date().toISOString();
    const year = new Date(issuedAt).getFullYear().toString();
    const barcode = `${process.protocol.replace(/\D/g, "")}${selectedGuide.code.replace(/\D/g, "")}${Math.round(selectedGuide.amount * 100)}`
      .padEnd(44, "7")
      .slice(0, 44);
    const guideDocument: GuiaRecolhimentoOficialProps = {
      prefeitura: {
        nome: municipalityName || tenant?.name || tenantSettings?.beneficiarioArrecadacao || "Prefeitura Municipal",
        secretaria: tenantSettings?.secretariaResponsavel || "Secretaria responsável",
        endereco: tenantSettings?.endereco || "Endereço não configurado",
        telefone: tenantSettings?.telefone || "",
        logoUrl: tenantSettings?.logoUrl || tenantSettings?.brasaoUrl || "",
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
        observacao: getGuideObservation(selectedGuide.kind),
        funcionarioResponsavel: selectedGuide.issuedBy || session.name,
        proprietario: selectedGuide.ownerName || process.ownerName,
        profissionalResponsavel: selectedGuide.professionalName || process.technicalLead,
        analistaSolicitante:
          selectedGuide.kind === "iss_obra"
            ? process.analysis?.assignedTo || constructionGuideRequester || session.name
            : undefined,
        funcionarioEmissor:
          selectedGuide.kind === "iss_obra"
            ? constructionGuideIssuer || selectedGuide.issuedBy || session.name
            : selectedGuide.issuedBy,
        areaObra: selectedGuide.areaM2 ?? process.property.area,
        usoObra: selectedGuide.usage || process.property.usage,
        padraoConstrutivo: selectedGuide.kind === "iss_obra"
          ? process.property.workType || workTypeInput || undefined
          : selectedGuide.constructionStandard || constructionStandardLabel,
        codigoBarras: barcode,
        linhaDigitavel: barcode,
        qrCodePixUrl: "",
        valorDocumento: selectedGuide.amount,
        descontos: 0,
        outrosAcrescimos: 0,
        valorCobrado: selectedGuide.amount,
        autenticacaoMecanica: "",
        referencia: getGuideReference(selectedGuide.kind),
      },
      itens: [
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
      ],
    };
    openGuiaRecolhimentoOficialWindow(
      guideDocument,
      {
        title: `Guia ${selectedGuide.code}`,
        autoPrint,
      },
    );
  };
  const runProcessAction = async (
    key: string,
    action: () => Promise<void>,
    successMessage: string,
  ) => {
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

  const handleConfirmProtocolPayment = () => {
    void runProcessAction(
      "confirm-protocol-payment",
      () => markGuideAsPaid(process.id, session.name, "protocolo"),
      "Pagamento da guia de protocolo confirmado. O processo foi liberado para a próxima etapa.",
    );
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

  const handleSendConstructionGuideToProfessional = () => {
    if (!constructionGuide) return;
    void runProcessAction(
      "send-construction-guide",
      () =>
        sendProcessMessage({
          processId: process.id,
          senderName: session.name,
          senderRole: session.role,
          audience: "externo",
          recipientName: process.technicalLead,
          message:
            `Guia de ISSQN / Projeto disponível: ${constructionGuide.code}, valor ${formatCurrency(constructionGuide.amount)}, vencimento ${constructionGuide.dueDate}. Acesse o processo para visualizar a guia.`,
        }),
      "Guia encaminhada ao profissional responsável e registrada no histórico do processo.",
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
      "Despacho registrado no processo.",
    );
    if (ok) {
      setDispatchTo("");
      setDispatchSubject("");
      setDispatchDueDate("");
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
  const openViewer = (documentId: string) => {
    const viewerUrl = `${window.location.origin}/processos/${process.id}/documentos/${documentId}/visualizar`;
    window.open(viewerUrl, "_blank", "noopener,noreferrer");
  };

  const openAnalysisViewer = (documentId: string) => {
    const analysisUrl = `${window.location.origin}/processos/${process.id}/documentos/${documentId}/analisar`;
    window.open(analysisUrl, "_blank", "noopener,noreferrer");
  };
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
      <PageShell className="!max-w-none !px-3 sm:!px-4 lg:!px-5 2xl:!px-6">
      <PageHero
        eyebrow="Painel do processo"
        title={formatOfficialProcessLabel({ protocol: process.protocol, type: process.type })}
        description="Acompanhe situação, documentos, comunicações, análise técnica e financeiro em um único painel institucional."
        icon={Workflow}
        actions={
          protocolGuide ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="rounded-full" onClick={() => printGuide("protocolo", false)}>
                <Eye className="mr-2 h-4 w-4" />
                Preview
              </Button>
              <Button type="button" variant="outline" className="rounded-full" onClick={() => printGuide("protocolo", true)}>
                <Printer className="mr-2 h-4 w-4" />
                Imprimir guia
              </Button>
            </div>
          ) : undefined
        }
      />
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
      <PageStatsRow>
        <StatCard label="Etapa atual" value={currentFlowStatusLabel} description={currentOrganizationPath} icon={Workflow} tone="blue" valueClassName="text-xl md:text-2xl" />
        <StatCard label="Documentos enviados" value={String(uploadedCount)} description="Arquivos presentes no processo" icon={FileStack} tone="emerald" />
        <StatCard label="Exigências visíveis" value={String(visibleRequirements.length)} description="Pendências e devolutivas desta vista" icon={ShieldAlert} tone="amber" />
        <StatCard label="Guia inicial" value={protocolGuide ? formatCurrency(protocolGuide.amount) : "Não emitida"} description="Controle financeiro do protocolo" icon={FileKey2} tone="default" valueClassName="text-xl md:text-2xl" />
      </PageStatsRow>
      <Card className={cardShell}>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-lg font-medium text-slate-900">{formatOfficialProcessNumber(process.protocol)}</p>
            <Badge variant="outline" className={statusTone(process.status)}>
              {currentFlowStatusLabel}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Unidade responsável: <span className="font-medium text-slate-700 dark:text-slate-200">{currentOrganizationPath}</span>
            {" • "}Entrada: {process.timeline[0]?.at || protocolGuide?.issuedAt || "sem data"}
          </p>

          <div className="mt-6 rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-5">
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

          <div className="mt-4 grid gap-2 rounded-xl bg-slate-100 p-1 [grid-template-columns:repeat(auto-fit,minmax(min(100%,118px),1fr))]">
            {tabItems.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setProcessTab(tab.key)}
                className={`rounded-[10px] px-3 py-2 text-sm font-medium transition ${activeTab === tab.key ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 grid items-stretch gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,315px),1fr))]">
        <Card className={`${cardShell} sig-premium-summary-card h-full`}>
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
        <Card className={`${cardShell} sig-premium-summary-card h-full`}>
          <CardContent className="p-5">
            <p className="sig-label">{constructionGuide ? "Guia de ISSQN / Projeto" : "Guia de protocolo"}</p>
            <p className="sig-fit-title mt-3 text-lg font-medium leading-7 text-slate-900" title={displayGuide?.code || "Sem guia"}>{displayGuide?.code || "Sem guia"}</p>
            <p className="mt-2 text-base font-medium leading-6 text-slate-700">{displayGuide ? formatCurrency(displayGuide.amount) : "Não emitida"}</p>
            <p className="sig-field-help sig-fit-copy mt-1" title={tenantSettings?.beneficiarioArrecadacao || tenant?.name || ""}>{tenantSettings?.beneficiarioArrecadacao || tenant?.name}</p>
            {constructionGuide ? (
              <Button type="button" variant="outline" className="mt-3 rounded-full" onClick={() => printGuide("iss_obra", false)}>
                <Eye className="mr-2 h-4 w-4" />
                Visualizar guia
              </Button>
            ) : null}
          </CardContent>
        </Card>
        <Card className={`${cardShell} sig-premium-summary-card h-full`}>
          <CardContent className="p-5">
            <p className="sig-label">Documentos</p>
            <p className="mt-3 text-lg font-medium leading-7 text-slate-900">
              {uploadedCount}/{process.documents.length}
            </p>
            <p className="sig-field-help mt-2">Checklist com versão, nome do arquivo e assinatura</p>
          </CardContent>
        </Card>
        <Card className={`${cardShell} sig-premium-summary-card h-full`}>
          <CardContent className="p-5">
            <p className="sig-label">SLA atual</p>
            <p className="mt-3 text-lg font-medium leading-7 text-slate-900" title={process.sla.currentStage}>{process.sla.currentStage}</p>
            <p className="sig-field-help mt-2" title={`Prazo ${process.sla.dueDate} - ${process.sla.hoursRemaining}h restantes`}>Prazo {process.sla.dueDate} - {process.sla.hoursRemaining}h restantes</p>
            {process.sla.breached ? <p className="mt-2 text-sm font-medium text-rose-600">Prazo estourado</p> : null}
          </CardContent>
        </Card>
      </div>

      {(activeTab === "resumo" || activeTab === "historico") ? (
      <div className="mt-4 grid items-stretch gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,420px),1fr))]">
        <Card className={`${cardShell} h-full`}>
          <CardContent className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="sig-label">Controle de tramitação</p>
                <p className="mt-2 line-clamp-2 text-base font-medium text-slate-900">Processo com tramitação entre setores e pastas institucionais</p>
                <p className="mt-2 text-sm text-slate-500">
                  A unidade atual é <span className="font-medium text-slate-700">{currentFolder}</span>. Os despachos formais mantêm a conversa entre Protocolo, Análise, Financeiro, Setor de IPTU, Fiscalização, Habite-se e demais setores.
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
          </CardContent>
        </Card>
        <Card className={`${cardShell} h-full`}>
          <CardContent className="p-5">
            <p className="sig-label">Acesso externo ao fluxo</p>
            <p className="mt-2 text-base font-medium text-slate-900">
              {processTransitVisibility === "completo" ? "Acompanhamento completo liberado" : "Trâmites internos restritos"}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              No modo completo, o profissional acompanha todo o processo. No modo restrito, os trâmites internos entre pastas ficam ocultos do acesso externo.
            </p>
            {isInternalRole(session.role) ? (
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
            ) : (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                {processTransitVisibility === "completo"
                  ? "Esta visualização acompanha os despachos e trâmites do processo."
                  : "Os trâmites internos entre setores estão ocultos para esta visualização externa."}
              </div>
            )}
          </CardContent>
        </Card>
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
          <Card className={cardShell}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <FileStack className="h-5 w-5" />
                {canUploadProcessDocuments ? "Documentos do protocolo" : "Documentos enviados pelo profissional"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      {uploadedCount}/{process.documents.length} arquivo(s) enviado(s)
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {canUploadProcessDocuments
                        ? "Envie aqui os documentos obrigatórios. O analista municipal recebe os arquivos em modo somente leitura para conferência."
                        : "Esta área é somente para análise. Os arquivos exibidos abaixo foram anexados pelo profissional responsável."}
                    </p>
                    {!canUploadProcessDocuments && pendingExternalDocumentCount > 0 ? (
                      <p className="mt-2 text-sm font-medium text-amber-700">
                        {pendingExternalDocumentCount} item(ns) do checklist ainda aguardam envio do profissional.
                      </p>
                    ) : null}
                    {canRecoverStoredDocuments && recoverableStatus ? (
                      <p className="mt-2 text-sm font-medium text-sky-700">{recoverableStatus}</p>
                    ) : null}
                  </div>
                  {canRecoverStoredDocuments ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full"
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
              </div>

              {canReviewDocuments ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-emerald-300 bg-emerald-50/80 p-4 dark:border-emerald-500/40 dark:bg-emerald-950/25">
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

                  <div className="rounded-2xl border border-amber-300 bg-amber-50/80 p-4 dark:border-amber-500/40 dark:bg-amber-950/25">
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

                  <div className="rounded-2xl border border-sky-300 bg-sky-50/80 p-4 dark:border-sky-500/40 dark:bg-sky-950/25">
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

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/60">
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
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
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

                return (
                  <div
                    key={document.id}
                    data-process-document-card="true"
                    className={`relative overflow-hidden rounded-2xl border p-4 shadow-sm transition-colors [contain:layout_style] ${reviewVisual.card}`}
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
                            title="Abrir documento em nova guia"
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
                          title={document.uploaded ? "Abrir documento em nova guia" : undefined}
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

                        {!canReviewDocuments && (document.previewUrl || document.uploaded) ? (
                          <button
                            type="button"
                            onClick={() => openViewer(document.id)}
                            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-medium text-slate-700 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-sky-500/50 dark:hover:bg-sky-950/40 dark:hover:text-sky-300"
                          >
                            <Maximize2 className="h-3.5 w-3.5" />
                            Abrir documento
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

                    {canReviewDocuments && document.uploaded ? (
                      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-200/80 pt-4 dark:border-slate-700/80">
                        <div className="mr-auto min-w-0">
                          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                            {isApproved
                              ? "Documento conferido e aprovado."
                              : hasCommunique
                                ? "Há Comunique-se registrado para correção pelo profissional."
                                : "Documento aguardando conferência técnica."}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                            {hasCommunique
                              ? "Abra a análise para consultar as marcações e a exigência enviada."
                              : "A decisão e as anotações são feitas exclusivamente na tela de análise."}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className={`rounded-full px-5 font-semibold ${reviewVisual.button}`}
                          onClick={() => openAnalysisViewer(document.id)}
                        >
                          <Maximize2 className="mr-2 h-4 w-4" />
                          {isApproved || hasCommunique ? "Revisar análise" : "Abrir para análise"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </CardContent>
          </Card>
          )}

          {activeTab === "analise" && (
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
                    <Badge variant="outline" className="rounded-full border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-300">
                      Guia já gerada
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
                      disabled={Boolean(constructionGuide)}
                      className="mt-2 h-11 bg-white dark:bg-slate-950"
                      placeholder="Ex.: 250,00"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Uso da edificação</label>
                    <Select
                      value={constructionUsageInput}
                      onValueChange={setConstructionUsageInput}
                      disabled={Boolean(constructionGuide)}
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
                      disabled={Boolean(constructionGuide)}
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
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full"
                        onClick={() => printGuide("iss_obra", false)}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        Visualizar guia
                      </Button>
                      <Button
                        type="button"
                        className="rounded-full bg-sky-700 px-5 !text-white hover:bg-sky-800 dark:bg-sky-500 dark:!text-slate-950 dark:hover:bg-sky-400"
                        disabled={processActionBusy === "send-construction-guide"}
                        onClick={handleSendConstructionGuideToProfessional}
                      >
                        <MessageSquareMore className="mr-2 h-4 w-4" />
                        {processActionBusy === "send-construction-guide" ? "Enviando..." : "Enviar ao profissional"}
                      </Button>
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
                    <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">Disponível no Financeiro para controle</p>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
          )}

          {activeTab === "financeiro" && (
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
                        : "Nesta Prefeitura, a guia é gerada pela Análise Urbanística e o Financeiro recebe automaticamente para controle, pagamento e baixa."}
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
                        <Button type="button" variant="outline" className="rounded-full" onClick={() => printGuide("iss_obra", false)}>
                          <Eye className="mr-2 h-4 w-4" />
                          Visualizar guia
                        </Button>
                        <Button type="button" className="rounded-full bg-slate-950 text-white hover:bg-slate-900 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100" onClick={() => printGuide("iss_obra", true)}>
                          <Printer className="mr-2 h-4 w-4" />
                          Imprimir guia
                        </Button>
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
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800">
                  <span className="h-2 w-2 rounded-full bg-sky-600" />
                  Em andamento
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6 pt-5">
              <div className="rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-50 to-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                      Onde está agora
                    </p>
                    <p className="mt-2 text-base font-bold text-slate-950">
                      {currentOrganizationPath}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {statusLabel(process.status)}
                      {process.analysis?.assignedTo ? ` • Responsável: ${process.analysis.assignedTo}` : ""}
                    </p>
                  </div>
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-sky-200 bg-white text-sky-700">
                    <Building2 className="h-5 w-5" />
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

                {hasTransitHistory ? (
                  transitSteps.map((dispatch, index) => {
                    const isLast = index === transitSteps.length - 1;
                    return (
                      <div key={dispatch.id} className="relative flex gap-4 pb-5">
                        <div className={`z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-4 border-white shadow-sm ${
                          isLast ? "bg-sky-700 text-white" : "bg-slate-200 text-slate-700"
                        }`}>
                          {isLast ? <Building2 className="h-4 w-4" /> : <ArrowRightLeft className="h-4 w-4" />}
                        </div>

                        <div className={`min-w-0 flex-1 rounded-2xl border p-4 ${
                          isLast ? "border-sky-200 bg-sky-50/70" : "border-slate-200 bg-white"
                        }`}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                {isLast ? "Unidade atual" : "Encaminhado para"}
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
                                  isLast
                                    ? "border-sky-200 bg-white text-sky-800"
                                    : "border-slate-200 bg-slate-50 text-slate-600"
                                }`}
                              >
                                {isLast ? "Atual" : "Concluído"}
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
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                        Unidade atual
                      </p>
                      <p className="mt-1 font-semibold text-slate-950">
                        {currentOrganizationPath}
                      </p>
                      <p className="mt-2 text-sm text-slate-600">
                        Ainda não há outra tramitação registrada.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {isInternalRole(session.role) && ownsCurrentProcessStage && !isProtocolTrackingOnly ? (
                <form onSubmit={handleDispatchSubmit} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Encaminhar processo</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Escolha a próxima unidade da Prefeitura.
                      </p>
                    </div>
                    <Badge variant="outline" className="rounded-full">
                      Origem: {currentOrganizationPath}
                    </Badge>
                  </div>

                  {organizationStatus ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      {organizationStatus}
                    </div>
                  ) : null}

                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <Select value={dispatchTo} onValueChange={setDispatchTo}>
                      <SelectTrigger className="min-h-12 rounded-2xl bg-white">
                        <SelectValue placeholder="Selecionar unidade de destino" />
                      </SelectTrigger>
                      <SelectContent>
                        {organizationDestinations
                          .filter((department) => department.name !== currentFolder)
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
                      className="min-h-12 rounded-2xl bg-white"
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <Input
                      type="date"
                      value={dispatchDueDate}
                      onChange={(event) => setDispatchDueDate(event.target.value)}
                      className="w-full rounded-2xl bg-white sm:w-[220px]"
                    />
                    <Button
                      type="submit"
                      className="rounded-full bg-slate-950 px-5 hover:bg-slate-900"
                      disabled={!dispatchTo || !dispatchSubject.trim() || !dispatchDueDate || organizationDestinations.length === 0}
                    >
                      Encaminhar processo
                    </Button>
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



