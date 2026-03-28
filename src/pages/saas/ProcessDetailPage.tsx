import { FormEvent, MouseEvent, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, Download, Eye, FileCheck2, FileKey2, FileStack, Landmark, Maximize2, MessageSquareMore, Printer, ShieldAlert, Signature, Workflow, X, ZoomIn, ZoomOut } from "lucide-react";
import { useParams, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GuiaRecolhimentoOficialProps, openGuiaRecolhimentoOficialWindow } from "@/components/GuiaRecolhimentoOficial";
import { PageHero } from "@/components/platform/PageHero";
import { PageShell, PageStatsRow } from "@/components/platform/PageShell";
import { PixQrCode } from "@/components/platform/PixQrCode";
import { PortalFrame } from "@/components/platform/PortalFrame";
import { StatCard } from "@/components/platform/StatCard";
import { UserAvatar } from "@/components/platform/UserAvatar";
import { usePlatformData } from "@/hooks/usePlatformData";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import {
  canAccessProcess,
  formatCurrency,
  getGuideObservation,
  getGuideReference,
  getProcessById,
  getProcessPaymentGuides,
  isInternalRole,
  matchesOperationalScope,
  parseMarker,
  statusLabel,
  statusTone,
  type PaymentGuideKind,
  type ProcessTransitVisibility,
} from "@/lib/platform";

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
            <p><strong>Arquivo:</strong> ${fileName || "Nao informado"}</p>
            <p><strong>Prefeitura:</strong> ${tenantName || "Nao vinculada"}</p>
            <p><strong>Visualizacao:</strong> Documento demonstrativo para conferência no software.</p>
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
  const [searchParams] = useSearchParams();
  const { session } = usePlatformSession();
  const { municipality, scopeId, institutionSettingsCompat, name: municipalityName } = useMunicipality();
  const { processes, institutions, sessionUsers, addProcessMarkerWithColor, removeProcessMarker, sendProcessMessage, getInstitutionSettings, getUserProfile, reviewProcessDocument, addDocumentAnnotation, createRequirement, respondRequirement, completeRequirement, reopenProcess, dispatchProcess, setProcessTransitVisibility, markGuideAsPaid } = usePlatformData();
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const [marker, setMarker] = useState("");
  const [markerColor, setMarkerColor] = useState("#1d4ed8");
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
  const [selectedQuickMarker, setSelectedQuickMarker] = useState("em andamento");
  const [activeTab, setActiveTab] = useState<"resumo" | "imovel" | "documentos" | "analise" | "financeiro" | "historico">(
    (searchParams.get("aba") as "resumo" | "imovel" | "documentos" | "analise" | "financeiro" | "historico") || "resumo",
  );
  const [viewerDocumentId, setViewerDocumentId] = useState<string | null>(null);
  const [viewerZoom, setViewerZoom] = useState(1);
  const [annotationDraft, setAnnotationDraft] = useState("");
  const [annotationPoint, setAnnotationPoint] = useState<{ x: number; y: number } | null>(null);
  const viewerAreaRef = useRef<HTMLDivElement | null>(null);
  const process = processId ? getProcessById(processId, processes) : undefined;

  if (!process) {
    return (
      <PortalFrame eyebrow="Processo" title="Processo Não Encontrado">
        <Card className="rounded-[28px] border-slate-200">
          <CardContent className="p-8 text-sm text-slate-600">O protocolo solicitado não existe na base carregada.</CardContent>
        </Card>
      </PortalFrame>
    );
  }

  if (!canAccessProcess(session, process, effectiveScopeId)) {
    return (
      <PortalFrame eyebrow="Controle de Acesso" title="Conteúdo Protegido">
        <Card className="rounded-[28px] border-rose-200 bg-rose-50">
          <CardContent className="p-8">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <ShieldAlert className="h-5 w-5" />
              <p className="font-semibold">Este perfil não pode visualizar documentos nem dados processuais desta prefeitura.</p>
            </div>
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">
              O administrador geral consegue testar os acessos, mas o conteudo sigiloso permanece bloqueado.
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
  const uploadedCount = process.documents.filter((document) => document.uploaded).length;
  const protocolGuide = paymentGuides[0];
  const pixPayload = `000201|${tenantSettings?.beneficiarioArrecadacao}|${tenantSettings?.chavePix}|${protocolGuide?.code}|${process.protocol}|${process.ownerName}|${protocolGuide?.amount ?? 0}`;
  const canReviewDocuments = session.role === "prefeitura_admin" || session.role === "prefeitura_supervisor" || session.role === "analista";
  const viewerDocument = viewerDocumentId ? process.documents.find((document) => document.id === viewerDocumentId) ?? null : null;
  const canAnnotateViewer =
    !!viewerDocument &&
    (session.role === "prefeitura_admin" || session.role === "prefeitura_supervisor" || session.role === "analista") &&
    /projeto arquitetonico|memorial/i.test(viewerDocument.label);
  const flowSteps = useMemo(
    () => [
      { key: "dados", label: "Dados da obra", done: true },
      { key: "responsaveis", label: "Responsaveis", done: true },
      { key: "documentos", label: "Documentacao", done: uploadedCount > 0 },
      { key: "analise", label: "Análise Técnica", done: ["analise_tecnica", "deferido"].includes(process.status) },
      { key: "confirmacao", label: "Confirmacao", done: protocolGuide?.status === "compensada" || process.status === "deferido" },
    ],
    [process.status, protocolGuide?.status, uploadedCount],
  );
  const externalRecipientName = process.technicalLead || process.ownerName;
  const internalRecipients = sessionUsers.filter((user) => matchesOperationalScope(effectiveScopeId, user) && isInternalRole(user.role));
  const processTransitVisibility = process.processControl?.externalTransitView ?? "completo";
  const canViewCompleteTransit = isInternalRole(session.role) || processTransitVisibility === "completo";
  const sectorOptions = Array.from(
    new Set(
      [
        "Recepção de Protocolo",
        "Triagem",
        "Análise Técnica",
        "Setor Intersetorial",
        "Setor de IPTU",
        "Financeiro",
        "Fiscalização",
        "Habite-se",
        "Arquivo",
        session.department,
        session.title,
        process.processControl?.currentFolder,
        ...internalRecipients.flatMap((user) => [user.department, user.title]),
        ...process.dispatches.flatMap((dispatch) => [dispatch.from, dispatch.to]),
      ]
        .filter(Boolean)
        .map((item) => item!.trim()),
    ),
  );
  const currentFolder = process.processControl?.currentFolder || process.dispatches[0]?.to || process.sla.currentStage;
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
    if (item.visibility === "misto") return true;
    if (item.visibility === "interno") return isInternalRole(session.role);
    return !isInternalRole(session.role);
  });
  const visibleAuditTrail = process.auditTrail.filter((item) => item.visibleToExternal || canViewCompleteTransit);
  const quickMarkers = [
    { label: "em andamento", color: "#2563eb" },
    { label: "concluído", color: "#16a34a" },
    { label: "aguardando retorno", color: "#d97706" },
    { label: "pendência", color: "#dc2626" },
  ];
  const tabItems = [
    { key: "resumo", label: "Resumo" },
    { key: "imovel", label: "Imóvel" },
    { key: "documentos", label: `Documentos (${uploadedCount})` },
    { key: "analise", label: "Análise Técnica" },
    { key: "financeiro", label: "Financeiro" },
    { key: "historico", label: "Histórico" },
  ] as const;
  const financeFocused = activeTab === "financeiro";
  const cardShell = "rounded-[8px] border border-[#E5E7EB] bg-white shadow-sm";
  const printGuide = (guideKind: PaymentGuideKind = "protocolo", autoPrint = true) => {
    const selectedGuide = paymentGuides.find((guide) => guide.kind === guideKind);
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
  const handleAddMarker = (event: FormEvent) => {
    event.preventDefault();
    if (!marker.trim()) return;
    addProcessMarkerWithColor(process.id, marker, markerColor, session.name);
    setMarker("");
  };
  const handleSendMessage = (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim()) return;
    sendProcessMessage({
      processId: process.id,
      senderName: session.name,
      senderRole: session.role,
      audience: messageAudience,
      recipientName: messageRecipient === "todos" ? undefined : messageRecipient,
      message,
    });
    setMessage("");
  };
  const handleCreateRequirement = (event: FormEvent) => {
    event.preventDefault();
    if (!requirementTitle.trim() || !requirementDescription.trim() || !requirementDueDate) return;
    createRequirement({
      processId: process.id,
      title: requirementTitle,
      description: requirementDescription,
      dueDate: requirementDueDate,
      actor: session.name,
      targetName: externalRecipientName,
      visibility: requirementVisibility,
    });
    setRequirementTitle("");
    setRequirementDescription("");
    setRequirementDueDate("");
  };
  const handleDispatchSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!dispatchFrom.trim() || !dispatchTo.trim() || !dispatchSubject.trim() || !dispatchDueDate) return;
    dispatchProcess({
      processId: process.id,
      actor: session.name,
      from: dispatchFrom.trim(),
      to: dispatchTo.trim(),
      subject: dispatchSubject.trim(),
      dueDate: dispatchDueDate,
      visibility: dispatchVisibility,
    });
    setDispatchSubject("");
    setDispatchDueDate("");
    setDispatchVisibility("interno");
  };
  const updateTransitVisibility = (visibility: ProcessTransitVisibility) => {
    setProcessTransitVisibility({
      processId: process.id,
      actor: session.name,
      visibility,
    });
  };
  const openViewer = (documentId: string) => {
    setViewerDocumentId(documentId);
    setViewerZoom(1);
    setAnnotationDraft("");
    setAnnotationPoint(null);
  };
  const handleViewerClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!canAnnotateViewer || !viewerAreaRef.current) return;
    const rect = viewerAreaRef.current.getBoundingClientRect();
    setAnnotationPoint({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    });
  };
  const handleSaveAnnotation = () => {
    if (!viewerDocument || !annotationPoint || !annotationDraft.trim()) return;
    addDocumentAnnotation(process.id, viewerDocument.id, {
      x: annotationPoint.x,
      y: annotationPoint.y,
      note: annotationDraft,
      author: session.name,
    });
    setAnnotationDraft("");
    setAnnotationPoint(null);
  };

  return (
    <PortalFrame eyebrow="Processo administrativo" title={`${process.protocol} - ${process.title}`}>
      <PageShell>
      <PageHero
        eyebrow="Painel do processo"
        title={`${process.protocol} - ${process.title}`}
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
      <PageStatsRow>
        <StatCard label="Status atual" value={statusLabel(process.status)} description="Etapa atual do fluxo municipal" icon={Workflow} tone="blue" valueClassName="text-xl md:text-2xl" />
        <StatCard label="Documentos enviados" value={String(uploadedCount)} description="Arquivos presentes no processo" icon={FileStack} tone="emerald" />
        <StatCard label="Exigências visíveis" value={String(visibleRequirements.length)} description="Pendências e devolutivas desta vista" icon={ShieldAlert} tone="amber" />
        <StatCard label="Guia inicial" value={protocolGuide ? formatCurrency(protocolGuide.amount) : "Não emitida"} description="Controle financeiro do protocolo" icon={FileKey2} tone="default" valueClassName="text-xl md:text-2xl" />
      </PageStatsRow>
      <Card className={cardShell}>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-lg font-medium text-slate-900">Projeto: {process.protocol}</p>
            <Badge variant="outline" className={statusTone(process.status)}>
              {statusLabel(process.status)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">Etapa atual: {statusLabel(process.status)} • Entrada: {process.timeline[0]?.at || protocolGuide?.issuedAt || "sem data"}</p>

          <div className="mt-5 rounded-[8px] border border-[#E5E7EB] bg-[#FBFDFF] p-4 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-normal uppercase tracking-[0.12em] text-slate-400">Marcadores deste processo</p>
                <div className="mt-3 rounded-[8px] border border-[#E5E7EB] bg-white p-3">
                  <div className="flex flex-wrap gap-2">
                  {process.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium"
                      style={{
                        backgroundColor: `${parseMarker(tag).color}18`,
                        color: parseMarker(tag).color,
                      }}
                    >
                      {parseMarker(tag).label}
                      <button type="button" onClick={() => removeProcessMarker(process.id, tag, session.name)} className="rounded-full p-0.5 transition hover:bg-black/10">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  </div>
                </div>
              </div>
              <div className="xl:min-w-[390px]">
                <form className="rounded-[8px] border border-[#E5E7EB] bg-white p-3" onSubmit={handleAddMarker}>
                  <div className="grid gap-3 xl:grid-cols-[1fr_auto_auto]">
                    <Input value={marker} onChange={(event) => setMarker(event.target.value)} placeholder="Criar marcador deste processo" className="rounded-2xl" />
                    <Input type="color" value={markerColor} onChange={(event) => setMarkerColor(event.target.value)} className="h-11 w-16 rounded-2xl p-1" />
                    <Button type="submit" className="rounded-full bg-slate-950 hover:bg-slate-900">
                      Salvar Marcador
                    </Button>
                  </div>
                </form>
              </div>
            </div>
            <div className="mt-4 rounded-[8px] border border-[#E5E7EB] bg-white p-3">
              <div className="grid gap-3 xl:grid-cols-[1fr_auto]">
                <Select value={selectedQuickMarker} onValueChange={setSelectedQuickMarker}>
                  <SelectTrigger className="rounded-2xl">
                    <SelectValue placeholder="Escolha um marcador rápido" />
                  </SelectTrigger>
                  <SelectContent>
                    {quickMarkers.map((item) => (
                      <SelectItem key={item.label} value={item.label}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => {
                    const quickMarker = quickMarkers.find((item) => item.label === selectedQuickMarker);
                    if (!quickMarker) return;
                    addProcessMarkerWithColor(process.id, quickMarker.label, quickMarker.color, session.name);
                  }}
                >
                  Aplicar Marcador
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-[8px] border border-[#E5E7EB] bg-[#F8FAFC] px-4 py-5">
            <div className="grid gap-4 md:grid-cols-5">
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

          <div className="mt-4 grid gap-2 rounded-xl bg-slate-100 p-1 md:grid-cols-6">
            {tabItems.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-[10px] px-3 py-2 text-sm font-medium transition ${activeTab === tab.key ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-4 xl:grid-cols-12">
        <Card className={`${cardShell} xl:col-span-5`}>
          <CardContent className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={statusTone(process.status)}>
                {statusLabel(process.status)}
              </Badge>
              <Badge variant="outline" className="rounded-full">
                {process.type}
              </Badge>
            </div>
            <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-600" title={process.address}>{process.address}</p>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500" title={`Protocolo oficial ${process.externalProtocol} - Prefeitura ${tenant?.name || ""}`}>
              Protocolo oficial {process.externalProtocol} - Prefeitura {tenant?.name}
            </p>
          </CardContent>
        </Card>
        <Card className={`${cardShell} xl:col-span-3`}>
          <CardContent className="p-5">
            <p className="sig-label">Guia</p>
            <p className="sig-fit-title mt-3 text-lg font-medium leading-7 text-slate-900" title={protocolGuide?.code || "Sem guia"}>{protocolGuide?.code || "Sem guia"}</p>
            <p className="mt-2 text-base font-medium leading-6 text-slate-700">{formatCurrency(protocolGuide?.amount || 0)}</p>
            <p className="sig-field-help sig-fit-copy mt-1" title={tenantSettings?.beneficiarioArrecadacao || tenant?.name || ""}>{tenantSettings?.beneficiarioArrecadacao || tenant?.name}</p>
          </CardContent>
        </Card>
        <Card className={`${cardShell} xl:col-span-2`}>
          <CardContent className="p-5">
            <p className="sig-label">Documentos</p>
            <p className="mt-3 text-lg font-medium leading-7 text-slate-900">
              {uploadedCount}/{process.documents.length}
            </p>
            <p className="sig-field-help mt-2">Checklist com versao, nome do arquivo e assinatura</p>
          </CardContent>
        </Card>
        <Card className={`${cardShell} xl:col-span-2`}>
          <CardContent className="p-5">
            <p className="sig-label">SLA atual</p>
            <p className="mt-3 line-clamp-2 text-lg font-medium leading-7 text-slate-900" title={process.sla.currentStage}>{process.sla.currentStage}</p>
            <p className="sig-field-help mt-2 line-clamp-2" title={`Prazo ${process.sla.dueDate} - ${process.sla.hoursRemaining}h restantes`}>Prazo {process.sla.dueDate} - {process.sla.hoursRemaining}h restantes</p>
            {process.sla.breached ? <p className="mt-2 text-sm font-medium text-rose-600">Prazo estourado</p> : null}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <Card className={`${cardShell} xl:col-span-8`}>
          <CardContent className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="sig-label">Controle de tramitação</p>
                <p className="mt-2 line-clamp-2 text-base font-medium text-slate-900">Processo com tramitação entre setores e pastas institucionais</p>
                <p className="mt-2 text-sm text-slate-500">
                  A unidade atual é <span className="font-medium text-slate-700">{currentFolder}</span>. Os despachos formais mantêm a conversa entre Protocolo, Análise, Financeiro, Setor de IPTU, Fiscalização, Habite-se e demais setores.
                </p>
              </div>
              <div className="grid min-w-0 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3 xl:min-w-[320px]">
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
        <Card className={`${cardShell} xl:col-span-4`}>
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

      <div className={`mt-6 grid gap-6 ${financeFocused ? "grid-cols-1" : "xl:grid-cols-[1.18fr,0.92fr]"}`}>
        <div className="grid gap-6">
          {(activeTab === "resumo" || activeTab === "imovel") && (
          <Card className={cardShell}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <Landmark className="h-5 w-5" />
                Dados do Imóvel e do Protocolo
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
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

          {(activeTab === "resumo" || activeTab === "documentos") && (
          <Card className={cardShell}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <FileStack className="h-5 w-5" />
                Checklist documental
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {process.documents.map((document) => (
                <div key={document.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-950">{document.label}</p>
                      <p className="text-sm text-slate-500">
                        Arquivo: {document.fileName || "não informado"} - {document.mimeType || "sem tipo"} - {document.sizeLabel || "sem tamanho"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="rounded-full">
                        {document.required ? "Obrigatorio" : "Opcional"}
                      </Badge>
                      <Badge variant="outline" className="rounded-full">
                        {document.uploaded ? "Enviado" : "Pendente"}
                      </Badge>
                      <Badge variant="outline" className="rounded-full">
                        {document.signed ? "Assinado" : "Sem assinatura"}
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
                      {(document.previewUrl || document.uploaded) ? (
                        <button
                          type="button"
                          onClick={() => openViewer(document.id)}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700"
                        >
                          <Maximize2 className="h-3.5 w-3.5" />
                          Preview
                        </button>
                      ) : null}
                      {(document.previewUrl || document.uploaded) ? (
                        <a
                          href={document.previewUrl || buildDocumentPreview(document.label, document.fileName, tenant?.name ?? tenantSettings?.beneficiarioArrecadacao)}
                          download={document.fileName || `${document.label}.pdf`}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </a>
                      ) : null}
                    </div>
                  </div>
                  {(document.previewUrl || document.uploaded) ? (
                    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                      {(document.mimeType === "application/pdf" || !document.previewUrl) ? (
                        <iframe
                          src={document.previewUrl || buildDocumentPreview(document.label, document.fileName, tenant?.name ?? tenantSettings?.beneficiarioArrecadacao)}
                          title={document.fileName || document.label}
                          className="h-72 w-full"
                        />
                      ) : (
                        <img src={document.previewUrl} alt={document.fileName || document.label} className="max-h-80 w-full object-contain" />
                      )}
                    </div>
                  ) : null}
                  {canReviewDocuments && document.uploaded ? (
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full border-emerald-200 text-emerald-700"
                        onClick={() => reviewProcessDocument(process.id, document.id, "aprovado", session.name)}
                      >
                        Aprovar documento
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400"
                        onClick={() => reviewProcessDocument(process.id, document.id, "rejeitado", session.name)}
                      >
                        Rejeitar documento
                      </Button>
                      {document.reviewedBy ? (
                        <div className="self-center">
                          <div className="flex min-w-0 items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                            <UserAvatar name={document.reviewedBy} imageUrl={getProfileByName(document.reviewedBy)?.avatarUrl} size="sm" />
                            <span className="sig-fit-copy" title={`Ultima revisao por ${document.reviewedBy}`}>Ultima revisao por {document.reviewedBy}</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
          )}

          {(activeTab === "resumo" || activeTab === "historico") && (
          <Card className={cardShell}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <Workflow className="h-5 w-5" />
                Histórico do processo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {process.timeline.map((entry) => (
                <div key={entry.id} className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-slate-950">{entry.title}</p>
                    <p className="text-sm text-slate-500">{entry.at}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{entry.detail}</p>
                  <div className="mt-2 flex min-w-0 items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                    <UserAvatar name={entry.actor} imageUrl={getProfileByName(entry.actor)?.avatarUrl} size="sm" />
                    <span className="sig-fit-title" title={entry.actor}>{entry.actor}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          )}
        </div>

        <div className="grid gap-6">
          {(activeTab === "resumo" || activeTab === "analise") && (
          <Card className={cardShell}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <FileCheck2 className="h-5 w-5" />
                Exigências formais
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isInternalRole(session.role) ? (
                <form className="space-y-3" onSubmit={handleCreateRequirement}>
                  <Input value={requirementTitle} onChange={(event) => setRequirementTitle(event.target.value)} placeholder="Título da exigência" />
                  <Input value={requirementDescription} onChange={(event) => setRequirementDescription(event.target.value)} placeholder="Descreva a exigência formal" />
                  <div className="grid gap-3 md:grid-cols-2">
                    <Input type="date" value={requirementDueDate} onChange={(event) => setRequirementDueDate(event.target.value)} />
                    <Select value={requirementVisibility} onValueChange={(value) => setRequirementVisibility(value as "interno" | "externo" | "misto")}>
                      <SelectTrigger className="rounded-2xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="interno">Interno</SelectItem>
                        <SelectItem value="externo">Externo</SelectItem>
                        <SelectItem value="misto">Misto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full rounded-full bg-slate-950 hover:bg-slate-900">
                    Registrar exigência formal
                  </Button>
                </form>
              ) : null}

              <div className="space-y-3">
                {visibleRequirements.length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">Nenhuma exigência formal registrada.</div>
                ) : (
                  visibleRequirements.map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-slate-950">{item.title}</p>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="rounded-full capitalize">{item.status}</Badge>
                          <Badge variant="outline" className="rounded-full capitalize">{item.visibility}</Badge>
                        </div>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{item.description}</p>
                      <div className="mt-2 flex min-w-0 items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                        <UserAvatar name={item.createdBy} imageUrl={getProfileByName(item.createdBy)?.avatarUrl} size="sm" />
                        <span className="sig-fit-copy" title={`Prazo ${item.dueDate} - criado por ${item.createdBy}`}>Prazo {item.dueDate} - criado por {item.createdBy}</span>
                      </div>
                      {item.response ? <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{item.response}</div> : null}

                      {!isInternalRole(session.role) && item.status === "aberta" ? (
                        <div className="mt-3 flex flex-col gap-3">
                          <Input
                            value={requirementResponse[item.id] || ""}
                            onChange={(event) => setRequirementResponse((current) => ({ ...current, [item.id]: event.target.value }))}
                            placeholder="Responder exigência"
                          />
                          <Button
                            type="button"
                            className="rounded-full bg-slate-950 hover:bg-slate-900"
                            onClick={() => {
                              respondRequirement({
                                processId: process.id,
                                requirementId: item.id,
                                response: requirementResponse[item.id] || "",
                                actor: session.name,
                              });
                              setRequirementResponse((current) => ({ ...current, [item.id]: "" }));
                            }}
                          >
                            Enviar resposta
                          </Button>
                        </div>
                      ) : null}

                      {isInternalRole(session.role) && item.status === "respondida" ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-3 rounded-full border-emerald-200 text-emerald-700"
                          onClick={() => completeRequirement({ processId: process.id, requirementId: item.id, actor: session.name })}
                        >
                          Validar atendimento
                        </Button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
          )}

          {(activeTab === "resumo" || activeTab === "analise") && (
          <Card className={cardShell}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <MessageSquareMore className="h-5 w-5" />
                Comunique-se
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <form className="flex flex-col gap-3" onSubmit={handleSendMessage}>
                <div className="grid gap-3 md:grid-cols-2">
                  <Select value={messageRecipient} onValueChange={setMessageRecipient}>
                    <SelectTrigger className="rounded-2xl">
                      <SelectValue placeholder="Escolha o destinatario" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os envolvidos permitidos</SelectItem>
                      {isInternalRole(session.role) ? (
                        <SelectItem value={externalRecipientName}>{externalRecipientName} - profissional externo</SelectItem>
                      ) : null}
                      {!isInternalRole(session.role)
                        ? internalRecipients.map((user) => (
                            <SelectItem key={user.id} value={user.name}>
                              {user.name} - {user.title || user.role}
                            </SelectItem>
                          ))
                        : internalRecipients.map((user) => (
                            <SelectItem key={user.id} value={user.name}>
                              {user.name} - {user.title || user.role}
                            </SelectItem>
                          ))}
                    </SelectContent>
                  </Select>
                  <Select value={messageAudience} onValueChange={(value) => setMessageAudience(value as "interno" | "externo" | "misto")}>
                    <SelectTrigger className="rounded-2xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="interno">Interno - Só Prefeitura Vê</SelectItem>
                      <SelectItem value="externo">Externo - Só o Profissional Vê</SelectItem>
                      <SelectItem value="misto">Misto - Ambos Veem</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Escreva uma mensagem para o outro lado do processo" />
                <Button type="submit" className="w-full rounded-full bg-slate-950 hover:bg-slate-900">
                  Enviar mensagem
                </Button>
              </form>

              <div className="space-y-3">
                {visibleMessages.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <UserAvatar name={item.senderName} imageUrl={getProfileByName(item.senderName)?.avatarUrl} size="sm" />
                        <p className="sig-fit-copy font-semibold text-slate-950" title={`${item.senderName} - ${item.senderRole}`}>
                          {item.senderName} - {item.senderRole}
                        </p>
                      </div>
                      <Badge variant="outline" className="rounded-full capitalize">
                        {item.audience}
                      </Badge>
                    </div>
                    {item.recipientName ? <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">Destinatario: {item.recipientName}</p> : null}
                    <p className="mt-2 text-sm text-slate-600">{item.message}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">{item.at}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          )}

          {(activeTab === "resumo" || activeTab === "financeiro") && (
          <Card className={cardShell}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <FileKey2 className="h-5 w-5" />
                Guias de Pagamento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-[#d8e4f1] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-4">
                  <p className="text-[11px] font-normal uppercase tracking-[0.12em] text-slate-400">Etapa 1</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">Protocolo e Recolhimento</p>
                  <p className="mt-2 text-sm text-slate-600">A guia inicial nasce junto com o protocolo. Ela é a única guia exibida nesta etapa e libera a entrada na análise técnica.</p>
                </div>
                <div className="rounded-2xl border border-[#d8e4f1] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-4">
                  <p className="text-[11px] font-normal uppercase tracking-[0.12em] text-slate-400">Etapa 2</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">ISSQN da Obra</p>
                  <p className="mt-2 text-sm text-slate-600">Aparece apenas quando a análise despachar para o Setor de IPTU calcular a guia por metro quadrado.</p>
                </div>
                <div className="rounded-2xl border border-[#d8e4f1] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-4">
                  <p className="text-[11px] font-normal uppercase tracking-[0.12em] text-slate-400">Etapa 3</p>
                  <p className="mt-2 text-sm font-medium text-slate-900">Habite-se e aprovação</p>
                  <p className="mt-2 text-sm text-slate-600">Só aparece no fechamento do processo, quando a taxa final de aprovação for solicitada.</p>
                </div>
              </div>
              <div className="grid gap-4 xl:grid-cols-[1.05fr,0.95fr]">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-normal uppercase tracking-[0.12em] text-slate-400">Guia de Recolhimento</p>
                      <p className="mt-2 line-clamp-2 text-lg font-medium leading-tight text-slate-900" title={protocolGuide?.code || "Sem guia gerada"}>{protocolGuide?.code || "Sem guia gerada"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" className="rounded-full" onClick={() => printGuide("protocolo", false)}>
                        <Eye className="mr-2 h-4 w-4" />
                        Preview
                      </Button>
                      <Button type="button" variant="outline" className="rounded-full" onClick={() => printGuide("protocolo", true)}>
                        <Printer className="mr-2 h-4 w-4" />
                        Imprimir DAM
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-[#d8e4f1] bg-white p-4">
                      <p className="text-[10px] font-normal uppercase tracking-[0.1em] text-slate-400">Valor</p>
                      <p className="mt-2 text-lg font-medium text-[#123860]">{formatCurrency(protocolGuide?.amount || 0)}</p>
                    </div>
                    <div className="rounded-2xl border border-[#d8e4f1] bg-white p-4">
                      <p className="text-[10px] font-normal uppercase tracking-[0.1em] text-slate-400">Vencimento</p>
                      <p className="mt-2 text-lg font-bold text-[#123860]">{protocolGuide?.dueDate || "Não informado"}</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl border border-[#d8e4f1] bg-white p-4">
                    <p className={`text-xs font-medium uppercase tracking-[0.1em] ${protocolGuide?.status === "compensada" ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
                      {protocolGuide?.status === "compensada" ? "Pagamento Confirmado" : "Pagamento Pendente"}
                    </p>
                    <p className="mt-2 text-sm text-slate-500">A impressão sai em formato DAM municipal A4 com os dados da prefeitura e do protocolo.</p>
                  </div>
                </div>
              <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                <div className="flex justify-center rounded-2xl border border-slate-200 bg-white p-4">
                  <PixQrCode value={pixPayload} />
                </div>
                <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600">
                  <p className="font-medium text-slate-950">Pix Copia e Cola da Guia de Protocolo</p>
                  <p className="mt-2 break-all text-xs text-slate-500">{pixPayload}</p>
                  <div className="mt-4 grid gap-2">
                    <div className="rounded-xl bg-slate-50 p-3">Taxa de protocolo: {formatCurrency(protocolGuide?.amount || 0)}</div>
                    <div className="rounded-xl bg-slate-50 p-3">As guias de ISSQN e aprovação aparecem somente quando forem solicitadas nas próximas etapas.</div>
                  </div>
                </div>
              </div>
              </div>
            </CardContent>
          </Card>
          )}

          {(activeTab === "resumo" || activeTab === "analise") && (
          <Card className={cardShell}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <Signature className="h-5 w-5" />
                Blocos de assinatura
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {process.signatures.length === 0 ? (
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">Nenhum bloco de assinatura registrado.</div>
              ) : (
                process.signatures.map((block) => (
                  <div key={block.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-slate-900">{block.title}</p>
                      <Badge variant="outline" className="rounded-full capitalize">
                        {block.status}
                      </Badge>
                    </div>
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      {block.signers.map((signer) => (
                        <div key={`${block.id}-${signer.name}`} className="rounded-xl bg-slate-50 p-3">
                          {signer.name} - {signer.role}
                          <span className="block text-xs uppercase tracking-[0.18em] text-slate-400">
                            {signer.signedAt ? `assinado em ${signer.signedAt}` : "aguardando assinatura"}
                          </span>
                        </div>
                      ))}
                    </div>
                    {block.evidence ? (
                      <div className="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                        <div>Hash: {block.evidence.hash}</div>
                        <div>IP: {block.evidence.ip}</div>
                        <div>Agente: {block.evidence.userAgent}</div>
                        <div>Versao assinada: v{block.evidence.signedVersion}</div>
                        <div>Carimbo: {block.evidence.timestampAuthority}</div>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          )}

          {(activeTab === "resumo" || activeTab === "analise" || activeTab === "historico") && (
          <Card className="rounded-[28px] border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <ArrowRightLeft className="h-5 w-5" />
                Tramitação entre pastas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isInternalRole(session.role) ? (
                <form onSubmit={handleDispatchSubmit} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="sig-label">Novo despacho</p>
                      <p className="mt-1 text-sm text-slate-500">Encaminhe o processo entre unidades com prazo, assunto e visibilidade institucional.</p>
                    </div>
                    <Badge variant="outline" className="rounded-full capitalize">
                      Unidade atual: {currentFolder}
                    </Badge>
                  </div>
                  <div className="mt-4 grid gap-3 xl:grid-cols-2">
                    <Select value={dispatchFrom} onValueChange={setDispatchFrom}>
                      <SelectTrigger className="rounded-2xl">
                        <SelectValue placeholder="Origem do despacho" />
                      </SelectTrigger>
                      <SelectContent>
                        {sectorOptions.map((sector) => (
                          <SelectItem key={`from-${sector}`} value={sector}>
                            {sector}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={dispatchTo} onValueChange={setDispatchTo}>
                      <SelectTrigger className="rounded-2xl">
                        <SelectValue placeholder="Destino do despacho" />
                      </SelectTrigger>
                      <SelectContent>
                        {sectorOptions
                          .filter((sector) => sector !== dispatchFrom)
                          .map((sector) => (
                            <SelectItem key={`to-${sector}`} value={sector}>
                              {sector}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_180px]">
                    <Input value={dispatchSubject} onChange={(event) => setDispatchSubject(event.target.value)} placeholder="Assunto do despacho ou encaminhamento" />
                    <Input type="date" value={dispatchDueDate} onChange={(event) => setDispatchDueDate(event.target.value)} />
                    <Select value={dispatchVisibility} onValueChange={(value) => setDispatchVisibility(value as "interno" | "externo" | "misto")}>
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
                    <Button type="submit" className="rounded-full bg-slate-950 hover:bg-slate-900">
                      Registrar despacho
                    </Button>
                  </div>
                </form>
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
                            {dispatch.from} <span className="px-1 text-slate-400">→</span> {dispatch.to}
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
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <p className="sig-label">Origem</p>
                          <p className="mt-2 text-sm font-medium text-slate-900">{dispatch.from}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <p className="sig-label">Destino</p>
                          <p className="mt-2 text-sm font-medium text-slate-900">{dispatch.to}</p>
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

          {(activeTab === "resumo" || activeTab === "historico") && (
          <Card className="rounded-[28px] border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-950">
                <Workflow className="h-5 w-5" />
                Auditoria e Reabertura
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isInternalRole(session.role) ? (
                <div className="rounded-2xl border border-slate-200 p-4">
                  <Input value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} placeholder="Motivo para reabrir o processo" />
                  <Button type="button" variant="outline" className="mt-3 rounded-full" onClick={() => { reopenProcess({ processId: process.id, actor: session.name, reason: reopenReason }); setReopenReason(""); }}>
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
      </div>

      <Dialog open={!!viewerDocument} onOpenChange={(open) => !open && setViewerDocumentId(null)}>
        <DialogContent className="max-h-[96vh] max-w-[96vw] overflow-hidden border-slate-200 p-0">
          <DialogHeader className="border-b border-slate-200 px-6 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <DialogTitle className="text-left text-lg text-slate-950">{viewerDocument?.label}</DialogTitle>
                <p className="mt-1 text-sm text-slate-500">{viewerDocument?.fileName || "Documento tecnico"}</p>
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
                    href={viewerDocument.previewUrl || buildDocumentPreview(viewerDocument.label, viewerDocument.fileName, tenant?.name ?? tenantSettings?.beneficiarioArrecadacao)}
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
                  {viewerDocument?.previewUrl && viewerDocument.mimeType?.startsWith("image/") ? (
                    <img src={viewerDocument.previewUrl} alt={viewerDocument.fileName || viewerDocument.label} className="min-h-[720px] w-full object-contain" />
                  ) : (
                    <iframe
                      src={viewerDocument ? viewerDocument.previewUrl || buildDocumentPreview(viewerDocument.label, viewerDocument.fileName, tenant?.name ?? tenantSettings?.beneficiarioArrecadacao) : undefined}
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



