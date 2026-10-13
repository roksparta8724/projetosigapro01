import { FormEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, Download, Eye, FileCheck2, FileKey2, FileStack, Landmark, Maximize2, MessageSquareMore, Printer, ShieldAlert, Signature, UserRound, Workflow, ZoomIn, ZoomOut } from "lucide-react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
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
} from "@/lib/platform";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = usePlatformSession();
  const planEntitlements = usePlanEntitlements();
  const { municipality, scopeId, institutionSettingsCompat, name: municipalityName } = useMunicipality();
  const { processes, institutions, sessionUsers, sendProcessMessage, getInstitutionSettings, getUserProfile, reviewProcessDocument, addDocumentAnnotation, createRequirement, respondRequirement, completeRequirement, reopenProcess, dispatchProcess, setProcessTransitVisibility, markGuideAsPaid, appendProcessDocuments } = usePlatformData();
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
  const [reopenReason, setReopenReason] = useState("");
  const [dispatchFrom, setDispatchFrom] = useState(session.department || session.title || "Unidade atual");
  const [dispatchTo, setDispatchTo] = useState("");
  const [dispatchSubject, setDispatchSubject] = useState("");
  const [dispatchDueDate, setDispatchDueDate] = useState("");
  const [dispatchVisibility, setDispatchVisibility] = useState<"interno" | "externo" | "misto">("interno");
  type ProcessTab = "resumo" | "imovel" | "documentos" | "analise" | "financeiro" | "historico";
  const validProcessTabs: ProcessTab[] = ["resumo", "imovel", "documentos", "analise", "financeiro", "historico"];
  const initialTab = searchParams.get("aba") as ProcessTab | null;
  const [activeTab, setActiveTab] = useState<ProcessTab>(
    initialTab && validProcessTabs.includes(initialTab) ? initialTab : "imovel",
  );
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
  const viewerAreaRef = useRef<HTMLDivElement | null>(null);
  const setProcessTab = (tab: ProcessTab) => {
    if (tab === "analise" && (!planEntitlements.canUseModule("Analise tecnica") || !canAnalysisOperate)) return;
    if (tab === "financeiro" && (!planEntitlements.canUseModule("Financeiro") || !canFinanceOperate)) return;
    setActiveTab(tab);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("aba", tab);
    setSearchParams(nextParams, { replace: true });
  };

  useEffect(() => {
    const requested = searchParams.get("aba") as ProcessTab | null;
    if (!requested || !validProcessTabs.includes(requested)) return;

    const allowed =
      (requested !== "analise" || (planEntitlements.canUseModule("Analise tecnica") && canAnalysisOperate)) &&
      (requested !== "financeiro" || (planEntitlements.canUseModule("Financeiro") && canFinanceOperate));

    if (!allowed) {
      const fallbackTab: ProcessTab = "imovel";
      if (activeTab !== fallbackTab) setActiveTab(fallbackTab);
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("aba", fallbackTab);
      setSearchParams(nextParams, { replace: true });
      return;
    }

    if (requested !== activeTab) setActiveTab(requested);
  }, [activeTab, canAnalysisOperate, canFinanceOperate, planEntitlements, searchParams, setSearchParams]);


  const process = resolveProcessFromRoute(processes, processId);
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
    if (!isProtocolTrackingOnly) return;
    if (activeTab === "historico" || activeTab === "resumo") return;
    setActiveTab("historico");
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("aba", "historico");
    setSearchParams(nextParams, { replace: true });
  }, [activeTab, isProtocolTrackingOnly, searchParams, setSearchParams]);

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
  const pendingExternalDocumentCount = process.documents.filter((document) => !document.uploaded).length;
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
  const flowSteps = [
    { key: "dados", label: "Dados da obra", done: true },
    { key: "responsaveis", label: "Responsaveis", done: true },
    { key: "documentos", label: "Documentacao", done: uploadedCount > 0 },
    { key: "analise", label: URBAN_ANALYSIS_DEPARTMENT, done: ["analise_tecnica", "deferido"].includes(process.status) },
    { key: "confirmacao", label: "Confirmacao", done: protocolGuide?.status === "compensada" || process.status === "deferido" },
  ];
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

  useEffect(() => {
    if (!ownsCurrentProcessStage) return;
    setDispatchFrom(currentFolder || session.department || session.title || "Unidade atual");
  }, [currentFolder, ownsCurrentProcessStage, session.department, session.title]);
  const constructionStandardLabel =
    process.property.constructionStandard === "luxo"
      ? "Luxo"
      : process.property.constructionStandard === "primeira"
        ? "Primeira"
        : process.property.constructionStandard === "economico"
          ? "Econômico"
          : "Médio";
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
  const visibleAuditTrail = process.auditTrail.filter((item) =>
    isProtocolTrackingOnly
      ? item.category === "status" || item.category === "despacho" || item.visibleToExternal
      : item.visibleToExternal || canViewCompleteTransit,
  );
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

  const showPrimaryDetailColumn = ["imovel", "documentos", "historico"].includes(activeTab);
  const showSecondaryDetailColumn = ["analise", "financeiro", "historico"].includes(activeTab);
  const useSplitDetailLayout = activeTab === "historico";
  const cardShell = "min-w-0 rounded-[8px] border border-[#E5E7EB] bg-white shadow-sm";
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
        funcionarioResponsavel: session.name,
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
    if (!dispatchFrom.trim() || !dispatchTo.trim() || !dispatchSubject.trim() || !dispatchDueDate) return;

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
          from: dispatchFrom.trim(),
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
        <StatCard label="Status atual" value={statusLabel(process.status)} description="Etapa atual do fluxo municipal" icon={Workflow} tone="blue" valueClassName="text-xl md:text-2xl" />
        <StatCard label="Documentos enviados" value={String(uploadedCount)} description="Arquivos presentes no processo" icon={FileStack} tone="emerald" />
        <StatCard label="Exigências visíveis" value={String(visibleRequirements.length)} description="Pendências e devolutivas desta vista" icon={ShieldAlert} tone="amber" />
        <StatCard label="Guia inicial" value={protocolGuide ? formatCurrency(protocolGuide.amount) : "Não emitida"} description="Controle financeiro do protocolo" icon={FileKey2} tone="default" valueClassName="text-xl md:text-2xl" />
      </PageStatsRow>
      <Card className={cardShell}>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-lg font-medium text-slate-900">{formatOfficialProcessNumber(process.protocol)}</p>
            <Badge variant="outline" className={statusTone(process.status)}>
              {statusLabel(process.status)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">Etapa atual: {statusLabel(process.status)} • Entrada: {process.timeline[0]?.at || protocolGuide?.issuedAt || "sem data"}</p>

          <div className="mt-6 rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-5">
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,130px),1fr))]">
              {flowSteps.map((step, index) => (
                <div key={step.key} className="relative">
                  {index < flowSteps.length - 1 ? <div className="absolute left-[52%] top-5 hidden h-px w-full bg-slate-300 md:block" /> : null}
                  <div className="relative z-10 flex flex-col items-center text-center">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-medium ${step.done ? "border-[#214c73] bg-[#214c73] text-white" : "border-slate-300 bg-white text-slate-500"}`}>
                      {step.done ? "•" : index + 1}
                    </div>
                    <p className="mt-3 text-[11px] font-medium text-slate-500">{step.label}</p>
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

      <div className="mt-6 grid items-stretch gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
        <Card className={`${cardShell} h-full`}>
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
            <p className="mt-2 text-sm leading-6 text-slate-500" title={`Protocolo oficial ${process.externalProtocol} - Prefeitura ${tenant?.name || ""}`}>
              Protocolo oficial {process.externalProtocol} - Prefeitura {tenant?.name}
            </p>
          </CardContent>
        </Card>
        <Card className={`${cardShell} h-full`}>
          <CardContent className="p-5">
            <p className="sig-label">Guia</p>
            <p className="sig-fit-title mt-3 text-lg font-medium leading-7 text-slate-900" title={protocolGuide?.code || "Sem guia"}>{protocolGuide?.code || "Sem guia"}</p>
            <p className="mt-2 text-base font-medium leading-6 text-slate-700">{formatCurrency(protocolGuide?.amount || 0)}</p>
            <p className="sig-field-help sig-fit-copy mt-1" title={tenantSettings?.beneficiarioArrecadacao || tenant?.name || ""}>{tenantSettings?.beneficiarioArrecadacao || tenant?.name}</p>
          </CardContent>
        </Card>
        <Card className={`${cardShell} h-full`}>
          <CardContent className="p-5">
            <p className="sig-label">Documentos</p>
            <p className="mt-3 text-lg font-medium leading-7 text-slate-900">
              {uploadedCount}/{process.documents.length}
            </p>
            <p className="sig-field-help mt-2">Checklist com versão, nome do arquivo e assinatura</p>
          </CardContent>
        </Card>
        <Card className={`${cardShell} h-full`}>
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
          <Card className={cardShell}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <Landmark className="h-5 w-5" />
                Dados do Imóvel e do Protocolo
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))]">
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600" title={`Proprietário: ${process.ownerName}`}>Proprietário: <span className="sig-fit-copy mt-1 block text-slate-800">{process.ownerName}</span></div>
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600" title={`Documento mascarado: ${process.ownerDocument}`}>Documento mascarado: <span className="sig-fit-copy mt-1 block text-slate-800">{process.ownerDocument}</span></div>
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600" title={`Responsável Técnico: ${process.technicalLead}`}>Responsável Técnico: <span className="sig-fit-copy mt-1 block text-slate-800">{process.technicalLead}</span></div>
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">IPTU: <span className="sig-fit-copy mt-1 block text-slate-800">{process.property.iptu}</span></div>
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">Matrícula: <span className="sig-fit-copy mt-1 block text-slate-800">{process.property.registration}</span></div>
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">Lote/Quadra: <span className="sig-fit-copy mt-1 block text-slate-800">{process.property.lot} / {process.property.block}</span></div>
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">Área: <span className="sig-fit-copy mt-1 block text-slate-800">{process.property.area} m²</span></div>
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600" title={`Uso: ${process.property.usage}`}>Uso: <span className="sig-fit-copy mt-1 block text-slate-800">{process.property.usage}</span></div>
              <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600" title={`Padrão construtivo: ${constructionStandardLabel}`}>Padrão construtivo: <span className="sig-fit-copy mt-1 block text-slate-800">{constructionStandardLabel}</span></div>
            </CardContent>
          </Card>
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

              {visibleDocumentRows.map((document) => (
                <div
                  key={document.id}
                  data-process-document-card="true"
                  className="rounded-2xl border border-slate-200 p-4 [contain:layout_style]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      {document.uploaded ? (
                        <button
                          type="button"
                          onClick={() => openViewer(document.id)}
                          className="block max-w-full text-left font-medium text-slate-950 hover:text-sky-700 hover:underline"
                          title="Abrir documento em nova guia"
                        >
                          {document.label}
                        </button>
                      ) : (
                        <p className="font-medium text-slate-950">{document.label}</p>
                      )}
                      <button
                        type="button"
                        disabled={!document.uploaded}
                        onClick={() => document.uploaded && openViewer(document.id)}
                        className="mt-1 block max-w-full truncate text-left text-sm text-slate-500 enabled:hover:text-sky-700 enabled:hover:underline disabled:cursor-default"
                        title={document.uploaded ? "Abrir documento em nova guia" : undefined}
                      >
                        {document.fileName || "Arquivo ainda não enviado"}
                        {document.mimeType ? ` • ${document.mimeType}` : ""}
                        {document.sizeLabel ? ` • ${document.sizeLabel}` : ""}
                      </button>
                      {document.uploaded ? (
                        <p className="mt-1 text-xs font-medium uppercase tracking-[0.12em] text-slate-400">
                          Origem: {document.source === "profissional" ? "Profissional responsável" : document.source}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="rounded-full">
                        {document.required ? "Obrigatório" : "Opcional"}
                      </Badge>
                      <Badge variant="outline" className="rounded-full">
                        {document.uploaded ? "Enviado" : "Pendente"}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`rounded-full ${
                          document.reviewStatus === "aprovado"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : document.reviewStatus === "rejeitado"
                              ? "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400"
                              : "border-amber-200 bg-amber-50 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {document.reviewStatus || "pendente"}
                      </Badge>

                      {canReviewDocuments && document.uploaded ? (
                        <button
                          type="button"
                          onClick={() => openAnalysisViewer(document.id)}
                          className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100"
                        >
                          <Maximize2 className="h-3.5 w-3.5" />
                          Abrir para análise
                        </button>
                      ) : (document.previewUrl || document.uploaded) ? (
                        <button
                          type="button"
                          onClick={() => openViewer(document.id)}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"
                        >
                          <Maximize2 className="h-3.5 w-3.5" />
                          Abrir documento
                        </button>
                      ) : null}

                    </div>
                  </div>

                  {canRecoverStoredDocuments && !document.uploaded ? (
                    <div data-pending-document-card="true" className="mt-4 rounded-2xl border p-4">
                      <p className="text-sm font-semibold text-amber-900">
                        {canUploadProcessDocuments ? "Documento pendente de envio" : "Upload do profissional aguardando vínculo"}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-amber-800">
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
                            className="mt-3 rounded-full bg-slate-950 px-5 text-white hover:bg-slate-900"
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
                    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                      <p className="mr-auto text-sm text-slate-500">
                        A decisão documental é feita somente na tela de análise. Pendências devem ser formalizadas por Comunique-se ao profissional.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full border-sky-200 text-sky-700"
                        onClick={() => openAnalysisViewer(document.id)}
                      >
                        <Maximize2 className="mr-2 h-4 w-4" />
                        Abrir análise
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
          )}

          {activeTab === "historico" && (
          <Card className={cardShell}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <Workflow className="h-5 w-5" />
                {isProtocolTrackingOnly ? "Acompanhamento pelo organograma" : "Histórico do processo"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isProtocolTrackingOnly ? (
                <>
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                    <p className="sig-label">Unidade responsável agora</p>
                    <p className="mt-2 text-sm font-semibold text-sky-950">{currentOrganizationPath}</p>
                    <p className="mt-1 text-sm text-sky-800">
                      O Protocolo acompanha somente o caminho institucional do processo. Conteúdo técnico, documentos internos e decisões do setor responsável permanecem restritos.
                    </p>
                  </div>

                  {process.dispatches.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                      Ainda não há encaminhamento entre unidades registrado para este processo.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {[...process.dispatches].reverse().map((dispatch, index) => (
                        <div key={dispatch.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-sm font-semibold text-sky-800">
                              {index + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-semibold text-slate-950">{dispatch.subject || "Encaminhamento interno"}</p>
                                <Badge variant="outline" className="rounded-full capitalize">{dispatch.status}</Badge>
                              </div>
                              <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                  <p className="sig-label">Saiu de</p>
                                  <p className="mt-1 text-sm font-medium text-slate-900">{getOrganizationPath(dispatch.from)}</p>
                                </div>
                                <ArrowRightLeft className="mx-auto h-4 w-4 text-slate-400" />
                                <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
                                  <p className="sig-label">Foi para</p>
                                  <p className="mt-1 text-sm font-medium text-sky-950">{getOrganizationPath(dispatch.to)}</p>
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                                <span>Prazo: {dispatch.dueDate || "não informado"}</span>
                                {dispatch.assignedTo ? <span>Responsável: {dispatch.assignedTo}</span> : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                process.timeline.map((entry) => (
                  <div key={entry.id} data-process-history-entry="true" className="rounded-2xl bg-slate-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold text-slate-950">{entry.title}</p>
                      <p className="text-sm text-slate-500">{entry.at}</p>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{entry.detail}</p>
                    <div className="mt-3 flex min-w-0 items-center gap-2.5 text-xs uppercase tracking-[0.16em] text-slate-400">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-600/50 bg-slate-800 text-sky-300 shadow-sm">
                        <UserRound className="h-4 w-4" />
                      </span>
                      <span className="sig-fit-title font-medium text-slate-300" title={entry.actor}>{entry.actor}</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          )}

          {activeTab === "historico" && (
          <Card className={cardShell}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <ArrowRightLeft className="h-5 w-5" />
                Tramitação entre pastas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isInternalRole(session.role) && ownsCurrentProcessStage && !isProtocolTrackingOnly ? (
                <form onSubmit={handleDispatchSubmit} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="sig-label">Encaminhar pelo organograma</p>
                      <p className="mt-1 text-sm text-slate-500">
                        O destino deve ser uma unidade ativa cadastrada no organograma municipal.
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

                  <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                      <p className="sig-label">Unidade de origem</p>
                      <p className="mt-2 text-sm font-medium text-slate-900">{currentOrganizationPath}</p>
                    </div>

                    <Select value={dispatchTo} onValueChange={setDispatchTo}>
                      <SelectTrigger className="min-h-14 rounded-2xl">
                        <SelectValue placeholder="Escolher destino no organograma" />
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
                  </div>

                  <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr))]">
                    <Input
                      value={dispatchSubject}
                      onChange={(event) => setDispatchSubject(event.target.value)}
                      placeholder="Assunto do encaminhamento"
                    />
                    <Input
                      type="date"
                      value={dispatchDueDate}
                      onChange={(event) => setDispatchDueDate(event.target.value)}
                    />
                    <Select
                      value={dispatchVisibility}
                      onValueChange={(value) => setDispatchVisibility(value as "interno" | "externo" | "misto")}
                    >
                      <SelectTrigger className="rounded-2xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="interno">Interno</SelectItem>
                        <SelectItem value="misto">Misto</SelectItem>
                        <SelectItem value="externo">Externo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <Button
                      type="submit"
                      className="rounded-full bg-slate-950 hover:bg-slate-900"
                      disabled={!dispatchTo || organizationDestinations.length === 0}
                    >
                      Encaminhar para unidade selecionada
                    </Button>
                  </div>
                </form>
              ) : isProtocolTrackingOnly ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  Este processo está sob responsabilidade de outra unidade. O Protocolo acompanha a tramitação, mas somente o setor responsável atual pode encaminhá-lo novamente pelo organograma.
                </div>
              ) : null}

              {visibleDispatches.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">Sem encaminhamentos abertos.</div>
              ) : (
                <div className="space-y-3">
                  {visibleDispatches.map((dispatch) => (
                    <div key={dispatch.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">{dispatch.subject}</p>
                          <p className="mt-2 text-sm text-slate-600">
                            {getOrganizationPath(dispatch.from)} <span className="px-1 text-slate-400">→</span> {getOrganizationPath(dispatch.to)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="rounded-full capitalize">
                            {dispatch.status}
                          </Badge>
                          <Badge variant="outline" className="rounded-full capitalize">
                            {dispatch.visibility || "interno"}
                          </Badge>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))]">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <p className="sig-label">Origem</p>
                          <p className="mt-2 text-sm font-medium text-slate-900">{getOrganizationPath(dispatch.from)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <p className="sig-label">Destino</p>
                          <p className="mt-2 text-sm font-medium text-slate-900">{getOrganizationPath(dispatch.to)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <p className="sig-label">Prazo</p>
                          <p className="mt-2 text-sm font-medium text-slate-900">{dispatch.dueDate}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {activeTab === "historico" && (
          <Card className={cardShell}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <Workflow className="h-5 w-5" />
                Auditoria e Reabertura
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isInternalRole(session.role) && ownsCurrentProcessStage && !isProtocolTrackingOnly ? (
                <div className="rounded-2xl border border-slate-200 p-4">
                  <Input value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} placeholder="Motivo para reabrir o processo" />
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 rounded-full"
                    onClick={() => {
                      void (async () => {
                        const ok = await runProcessAction(
                          "reopen",
                          () => reopenProcess({ processId: process.id, actor: session.name, reason: reopenReason }),
                          "Processo reaberto com sucesso.",
                        );
                        if (ok) setReopenReason("");
                      })();
                    }}
                  >
                    Reabrir processo
                  </Button>
                </div>
              ) : null}

              {process.reopenHistory.length > 0 ? (
                <div className="space-y-3">
                  {process.reopenHistory.map((entry) => (
                    <div key={entry.id} className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-600 dark:text-amber-400">
                      <p className="font-medium">Reabertura registrada</p>
                      <p className="mt-2">{entry.reason}</p>
                      <p className="mt-2 text-xs uppercase tracking-[0.18em] text-amber-600 dark:text-amber-400">{entry.actor} - {entry.at}</p>
                    </div>
                  ))}
                </div>
              ) : null}

              {visibleAuditTrail.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-slate-900">{entry.title}</p>
                    <Badge variant="outline" className="rounded-full capitalize">{entry.category}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{entry.detail}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">{entry.actor} - {entry.at}</p>
                </div>
              ))}
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



