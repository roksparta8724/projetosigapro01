import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Highlighter,
  MessageSquareText,
  MousePointer2,
  Maximize2,
  Save,
  Send,
  Undo2,
  XCircle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MarkerSelector } from "@/components/platform/MarkerSelector";
import { DocumentWorkspaceBoot } from "@/components/platform/DocumentWorkspaceBoot";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { useDocumentMarkerAssignments } from "@/hooks/useDocumentMarkerAssignments";
import { getSignedUrlForObjectStrict } from "@/integrations/r2/client";
import {
  canAnalyzeProcessDocument,
  formatOfficialProcessNumber,
  resolveProcessRoute,
} from "@/lib/platform";

type AnalysisTool = "navigate" | "highlight" | "text";
type DraftAnnotation = {
  kind: "text" | "highlight";
  page: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
};

type ReviewDraftAnnotation = DraftAnnotation & {
  id: string;
  note: string;
  author: string;
  createdAt: string;
};

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

export function DocumentAnalysisPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const routeState = (location.state ?? {}) as {
    documentAccessUrl?: string;
    returnTo?: string;
  };
  const prefetchedDocumentAccessUrl =
    typeof routeState.documentAccessUrl === "string"
      ? routeState.documentAccessUrl
      : "";
  const { processId, documentId } = useParams();
  const { session } = usePlatformSession();
  const { municipality, scopeId } = useMunicipality();
  const documentMarkers = useDocumentMarkerAssignments();
  const {
    processes,
    loading: platformDataLoading,
    dataReadyForCurrentUser,
    addDocumentAnnotation,
    reviewProcessDocument,
    createRequirement,
  } = usePlatformData();
  const process = resolveProcessRoute(processes, processId);
  const document = process?.documents.find((item) => item.id === documentId);
  const documentMarkerTags =
    process && document ? documentMarkers.getTags(process.id, document.id) : [];

  useEffect(() => {
    const previousTitle = document.title;
    const fileLabel =
      document?.fileName?.trim() ||
      document?.label?.trim() ||
      "Documento técnico";
    const protocol = process?.protocol?.trim() || "";

    document.title = protocol
      ? `Análise • ${fileLabel} • ${protocol} • SIGAPRO`
      : `Análise • ${fileLabel} • SIGAPRO`;

    return () => {
      document.title = previousTitle;
    };
  }, [document?.fileName, document?.label, process?.protocol]);
  const effectiveScopeId =
    process?.municipalityId ??
    process?.tenantId ??
    municipality?.id ??
    scopeId ??
    session.tenantId ??
    null;
  const [accessUrl, setAccessUrl] = useState(prefetchedDocumentAccessUrl);
  const [accessError, setAccessError] = useState("");
  const [tool, setTool] = useState<AnalysisTool>(() => {
    const requested = searchParams.get("ferramenta");
    return requested === "highlight" || requested === "text" ? requested : "navigate";
  });
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [draft, setDraft] = useState<DraftAnnotation | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [localReviewStatus, setLocalReviewStatus] = useState<"pendente" | "aprovado" | "rejeitado">(
    document?.reviewStatus === "aprovado"
      ? "aprovado"
      : document?.reviewStatus === "rejeitado"
        ? "rejeitado"
        : "pendente",
  );
  const [comuniqueReason, setComuniqueReason] = useState("");
  const [comuniqueDueDate, setComuniqueDueDate] = useState("");
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [draftAnnotations, setDraftAnnotations] = useState<ReviewDraftAnnotation[]>([]);
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [draftHydrated, setDraftHydrated] = useState(false);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  const reviewDraftStorageKey =
    process && document
      ? `sigapro:document-review-draft:${session.id}:${process.id}:${document.id}`
      : "";

  const canUseAnalysis =
    !!process &&
    !!document &&
    canAnalyzeProcessDocument(session, process, effectiveScopeId);

  useEffect(() => {
    setLocalReviewStatus(
      document?.reviewStatus === "aprovado"
        ? "aprovado"
        : document?.reviewStatus === "rejeitado"
          ? "rejeitado"
          : "pendente",
    );
  }, [document?.id, document?.reviewStatus]);

  useEffect(() => {
    setDraftHydrated(false);

    if (!reviewDraftStorageKey || typeof window === "undefined") {
      setDraftAnnotations([]);
      setDraftSavedAt("");
      setDraftHydrated(true);
      return;
    }

    try {
      const raw = window.localStorage.getItem(reviewDraftStorageKey);
      if (!raw) {
        setDraftAnnotations([]);
        setDraftSavedAt("");
        setDraftHydrated(true);
        return;
      }
      const parsed = JSON.parse(raw) as {
        annotations?: ReviewDraftAnnotation[];
        savedAt?: string;
      };
      setDraftAnnotations(Array.isArray(parsed.annotations) ? parsed.annotations : []);
      setDraftSavedAt(typeof parsed.savedAt === "string" ? parsed.savedAt : "");
    } catch {
      setDraftAnnotations([]);
      setDraftSavedAt("");
    } finally {
      setDraftHydrated(true);
    }
  }, [reviewDraftStorageKey]);

  useEffect(() => {
    if (
      !draftHydrated ||
      !reviewDraftStorageKey ||
      typeof window === "undefined"
    ) {
      return;
    }

    const savedAt = new Date().toISOString();
    window.localStorage.setItem(
      reviewDraftStorageKey,
      JSON.stringify({ annotations: draftAnnotations, savedAt }),
    );
    setDraftSavedAt(savedAt);
  }, [draftAnnotations, draftHydrated, reviewDraftStorageKey]);

  useEffect(() => {
    let cancelled = false;
    setAccessError("");

    if (!canUseAnalysis) {
      return () => {
        cancelled = true;
      };
    }

    if (prefetchedDocumentAccessUrl) {
      setAccessUrl(prefetchedDocumentAccessUrl);
      return () => {
        cancelled = true;
      };
    }

    if (!document?.filePath) {
      setAccessUrl(document?.previewUrl || "");
      return () => {
        cancelled = true;
      };
    }

    const bucket =
      (import.meta.env.VITE_R2_BUCKET_DOCUMENTOS as string | undefined) ||
      "sigapro-documentos";

    void getSignedUrlForObjectStrict({
      bucket,
      objectKey: document.filePath,
      expiresIn: 21600,
    })
      .then((url) => {
        if (!cancelled) setAccessUrl(url);
      })
      .catch((error) => {
        if (!cancelled) {
          setAccessError(
            error instanceof Error
              ? error.message
              : "Não foi possível abrir o arquivo armazenado.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    canUseAnalysis,
    document?.filePath,
    document?.previewUrl,
    prefetchedDocumentAccessUrl,
  ]);

  const isPdf =
    document?.mimeType === "application/pdf" ||
    document?.fileName?.toLowerCase().endsWith(".pdf");

  const previewUrl = useMemo(() => {
    if (!accessUrl) return "";
    if (!isPdf) return accessUrl;
    const separator = accessUrl.includes("#") ? "&" : "#";
    return `${accessUrl}${separator}page=${page}&zoom=${Math.round(zoom * 100)}&toolbar=0&navpanes=0`;
  }, [accessUrl, isPdf, page, zoom]);

  const persistedPageAnnotations = useMemo(
    () =>
      (document?.annotations ?? []).filter(
        (annotation) => Number(annotation.page ?? 1) === page,
      ),
    [document?.annotations, page],
  );

  const draftPageAnnotations = useMemo(
    () => draftAnnotations.filter((annotation) => annotation.page === page),
    [draftAnnotations, page],
  );

  const pageAnnotations = useMemo(
    () => [...persistedPageAnnotations, ...draftPageAnnotations],
    [persistedPageAnnotations, draftPageAnnotations],
  );

  const pointFromEvent = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: clampPercent(((event.clientX - rect.left) / rect.width) * 100),
      y: clampPercent(((event.clientY - rect.top) / rect.height) * 100),
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (tool === "navigate") return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointFromEvent(event);
    if (!point) return;

    if (tool === "text") {
      setDraft({ kind: "text", page, x: point.x, y: point.y, width: 0, height: 0 });
      setNote("");
      return;
    }

    setDragStart(point);
    setDraft({
      kind: "highlight",
      page,
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (tool !== "highlight" || !dragStart) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointFromEvent(event);
    if (!point) return;

    const x = Math.min(dragStart.x, point.x);
    const y = Math.min(dragStart.y, point.y);
    const width = Math.abs(point.x - dragStart.x);
    const height = Math.abs(point.y - dragStart.y);

    setDraft({
      kind: "highlight",
      page,
      x,
      y,
      width,
      height,
    });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (tool !== "highlight") return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragStart(null);
  };

  const saveAnnotation = async () => {
    if (!process || !document || !draft || !note.trim()) return;
    if (
      draft.kind === "highlight" &&
      ((draft.width ?? 0) < 0.5 || (draft.height ?? 0) < 0.5)
    ) {
      setStatus("Arraste sobre uma área maior do documento para usar o marca-texto.");
      return;
    }

    const nextAnnotation: ReviewDraftAnnotation = {
      id: `draft-${crypto.randomUUID()}`,
      kind: draft.kind,
      page: draft.page,
      x: draft.x,
      y: draft.y,
      width: draft.width,
      height: draft.height,
      note: note.trim(),
      author: session.name,
      createdAt: new Date().toLocaleString("pt-BR"),
    };

    setDraftAnnotations((current) => [...current, nextAnnotation]);
    setDraft(null);
    setNote("");
    setDragStart(null);
    setStatus(
      draft.kind === "highlight"
        ? "Área marcada adicionada ao rascunho da análise."
        : "Texto adicionado ao rascunho da análise.",
    );
  };

  const saveReviewDraft = () => {
    if (!reviewDraftStorageKey || typeof window === "undefined") return;
    const savedAt = new Date().toISOString();
    window.localStorage.setItem(
      reviewDraftStorageKey,
      JSON.stringify({ annotations: draftAnnotations, savedAt }),
    );
    setDraftSavedAt(savedAt);
    setStatus(
      draftAnnotations.length > 0
        ? `Rascunho salvo com ${draftAnnotations.length} apontamento(s). Nada foi enviado ao profissional.`
        : "Rascunho salvo sem apontamentos.",
    );
  };

  const removeDraftAnnotation = (annotationId: string) => {
    setDraftAnnotations((current) => current.filter((item) => item.id !== annotationId));
    setStatus("Apontamento removido do rascunho.");
  };

  const approveDocument = async () => {
    if (!process || !document) return;
    setBusy("review-aprovado");
    setStatus("");
    try {
      await reviewProcessDocument(
        process.id,
        document.id,
        "aprovado",
        session.name,
      );
      setLocalReviewStatus("aprovado");
      setStatus("Documento aprovado e registrado no processo.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar a aprovação.",
      );
    } finally {
      setBusy("");
    }
  };

  const sendDraftToProfessional = async () => {
    if (!process || !document) return;
    if (draftAnnotations.length === 0) {
      setStatus("Adicione pelo menos um apontamento antes de enviar ao profissional.");
      return;
    }
    if (!comuniqueDueDate) {
      setStatus("Informe o prazo para o profissional corrigir e reenviar o documento.");
      return;
    }

    setBusy("send-draft");
    setStatus("");
    try {
      for (const annotation of draftAnnotations) {
        const alreadyPersisted = (document.annotations ?? []).some(
          (item) =>
            (item.kind || "text") === annotation.kind &&
            Number(item.page ?? 1) === annotation.page &&
            Math.abs(Number(item.x) - annotation.x) < 0.01 &&
            Math.abs(Number(item.y) - annotation.y) < 0.01 &&
            item.note.trim() === annotation.note.trim(),
        );

        if (!alreadyPersisted) {
          await addDocumentAnnotation(process.id, document.id, {
            kind: annotation.kind,
            page: annotation.page,
            x: annotation.x,
            y: annotation.y,
            width: annotation.width,
            height: annotation.height,
            note: annotation.note,
            author: session.name,
          });
        }
      }

      const annotationSummary = draftAnnotations
        .map(
          (annotation, index) =>
            `${index + 1}. Página ${annotation.page} — ${
              annotation.kind === "highlight" ? "área marcada" : "comentário"
            }: ${annotation.note}`,
        )
        .join("\n");

      const description = [
        comuniqueReason.trim(),
        "Apontamentos técnicos registrados no documento:",
        annotationSummary,
      ]
        .filter(Boolean)
        .join("\n\n");

      await createRequirement({
        processId: process.id,
        title: `Correções solicitadas — ${document.label}`,
        description,
        dueDate: comuniqueDueDate,
        actor: session.name,
        targetName: process.technicalLead || process.ownerName,
        visibility: "misto",
      });

      await reviewProcessDocument(
        process.id,
        document.id,
        "rejeitado",
        session.name,
      );

      if (reviewDraftStorageKey && typeof window !== "undefined") {
        window.localStorage.removeItem(reviewDraftStorageKey);
      }
      setDraftAnnotations([]);
      setDraftSavedAt("");
      setLocalReviewStatus("rejeitado");
      setComuniqueReason("");
      setComuniqueDueDate("");
      setStatus(
        "Apontamentos enviados ao profissional. O documento ficou aguardando correção e reenvio.",
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar os apontamentos ao profissional.",
      );
    } finally {
      setBusy("");
    }
  };

  if (!process || !document) {
    if (platformDataLoading || !dataReadyForCurrentUser) {
      return <DocumentWorkspaceBoot mode="analysis" />;
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#dfe5ec] p-6">
        <div className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-[0_24px_70px_rgba(15,23,42,0.14)]">
          <FileText className="mx-auto h-9 w-9 text-slate-500" />
          <h1 className="mt-4 text-xl font-bold text-slate-950">Documento não encontrado</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            O arquivo solicitado não foi localizado neste processo.
          </p>
        </div>
      </main>
    );
  }

  if (!canUseAnalysis) {
    if (platformDataLoading || !dataReadyForCurrentUser || session.id === "unknown") {
      return <DocumentWorkspaceBoot mode="analysis" />;
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#dfe5ec] p-6">
        <div className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-[0_24px_70px_rgba(15,23,42,0.14)]">
          <FileText className="mx-auto h-9 w-9 text-slate-500" />
          <h1 className="mt-4 text-xl font-bold text-slate-950">Análise protegida</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Esta área é exclusiva da equipe interna responsável pela análise deste processo.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-[#e4e9ef] text-slate-950">
      <header className="flex min-h-[68px] shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-[linear-gradient(135deg,#071525_0%,#102a43_55%,#123a58_100%)] px-5 py-3 text-white lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-9 shrink-0 rounded-full border-white/15 bg-white/5 px-3 text-white hover:bg-white/10 hover:text-white"
            onClick={() => {
              if (routeState.returnTo) navigate(routeState.returnTo);
              else if (window.history.length > 1) navigate(-1);
              else navigate("/dashboard/processos");
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao processo
          </Button>

          <div className="hidden h-8 w-px bg-white/10 sm:block" />

          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-200/70">
              <FileText className="h-3.5 w-3.5" />
              Mesa de análise documental
            </div>
            <h1 className="mt-1 truncate text-[15px] font-semibold text-white">
              {document.label}
            </h1>
            <p className="mt-0.5 truncate text-[11px] text-slate-300">
              {formatOfficialProcessNumber(process.protocol)}
              {document.fileName ? ` · ${document.fileName}` : ""}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <MarkerSelector
            tags={documentMarkerTags}
            actor={session.name}
            subjectLabel="documento"
            triggerClassName="h-9 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            onApplyMarker={(label, color) =>
              documentMarkers.addMarker(process.id, document.id, label, color)
            }
            onRemoveMarker={(tag) =>
              documentMarkers.removeMarker(process.id, document.id, tag)
            }
          />
          <Badge
            variant="outline"
            className={`rounded-full px-3 py-1.5 font-semibold ${
              localReviewStatus === "aprovado"
                ? "border-emerald-300/35 bg-emerald-400/15 text-emerald-200"
                : localReviewStatus === "rejeitado"
                  ? "border-amber-300/35 bg-amber-300/15 text-amber-100"
                  : "border-sky-300/30 bg-sky-300/10 text-sky-100"
            }`}
          >
            {localReviewStatus === "aprovado"
              ? "Aprovado"
              : localReviewStatus === "rejeitado"
                ? "Comunique-se"
                : "Em análise"}
          </Badge>
          {accessUrl ? (
            <a
              href={accessUrl}
              download={document.fileName || document.label}
              className="hidden h-9 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 text-[12px] font-semibold text-white transition hover:bg-white/10 sm:inline-flex"
            >
              <Download className="h-4 w-4" />
              Baixar original
            </a>
          ) : null}
        </div>
      </header>

      <div data-analysis-toolbar="true" className="flex min-h-[76px] shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-300 bg-[linear-gradient(180deg,#ffffff_0%,#eef4fa_100%)] px-4 py-2.5 shadow-[0_8px_24px_rgba(15,23,42,0.10)] lg:px-5">
        <div data-pdf-annotation-toolbar="true" className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-300 bg-white p-1.5 shadow-[0_8px_20px_rgba(15,23,42,0.07)]">
          <span className="hidden rounded-xl bg-slate-950 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-white lg:inline">
            Ferramentas PDF
          </span>
          <Button
            type="button"
            variant="outline"
            className={`h-10 rounded-xl px-4 text-[12px] font-semibold text-slate-700 ${
              tool === "navigate"
                ? "border-sky-300 bg-sky-50 text-sky-800 shadow-sm"
                : "border-transparent bg-white hover:border-slate-200 hover:bg-slate-50"
            }`}
            onClick={() => {
              setTool("navigate");
              setDraft(null);
              setDragStart(null);
            }}
          >
            <MousePointer2 className="mr-2 h-4 w-4" />
            Selecionar
          </Button>
          <Button
            type="button"
            variant="outline"
            className={`h-10 rounded-xl px-4 text-[12px] font-bold text-slate-700 ${
              tool === "highlight"
                ? "border-amber-300 bg-amber-50 text-amber-900 shadow-sm"
                : "border-transparent bg-white hover:border-amber-200 hover:bg-amber-50/70"
            }`}
            onClick={() => {
              setTool("highlight");
              setDraft(null);
              setDragStart(null);
            }}
          >
            <Highlighter className="mr-2 h-4 w-4" />
            Marca-texto / Marcar área
          </Button>
          <Button
            type="button"
            variant="outline"
            className={`h-10 rounded-xl px-4 text-[12px] font-bold text-slate-700 ${
              tool === "text"
                ? "border-sky-300 bg-sky-50 text-sky-900 shadow-sm"
                : "border-transparent bg-white hover:border-sky-200 hover:bg-sky-50/70"
            }`}
            onClick={() => {
              setTool("text");
              setDraft(null);
              setDragStart(null);
            }}
          >
            <MessageSquareText className="mr-2 h-4 w-4" />
            Adicionar texto / apontamento
          </Button>
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-1.5 rounded-2xl border border-violet-200 bg-violet-50 p-1.5 shadow-sm">
            <span className="hidden px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-violet-700 md:inline">
              Rascunho {draftAnnotations.length}
            </span>
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-xl border-violet-200 bg-white px-3 text-[11px] font-semibold text-violet-800 hover:bg-violet-100"
              disabled={draftAnnotations.length === 0 || busy === "send-draft"}
              onClick={() => {
                setDraftAnnotations((current) => current.slice(0, -1));
                setStatus("Último apontamento removido do rascunho.");
              }}
            >
              <Undo2 className="mr-1.5 h-3.5 w-3.5" />
              Desfazer
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-xl border-violet-300 bg-violet-100 px-3 text-[11px] font-bold text-violet-900 hover:bg-violet-200"
              disabled={busy === "send-draft"}
              onClick={saveReviewDraft}
            >
              <Save className="mr-1.5 h-3.5 w-3.5" />
              Salvar rascunho
            </Button>
            <Button
              type="button"
              className="h-9 rounded-xl bg-[linear-gradient(135deg,#9a3412_0%,#c65d0e_55%,#e07a12_100%)] px-3 text-[11px] font-bold text-white shadow-[0_8px_18px_rgba(180,83,9,0.22)] hover:brightness-105"
              disabled={busy === "send-draft" || draftAnnotations.length === 0 || !comuniqueDueDate}
              onClick={() => void sendDraftToProfessional()}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              {busy === "send-draft" ? "Enviando..." : "Enviar apontamentos"}
            </Button>
          </div>

          {isPdf ? (
            <>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-9 w-9 rounded-xl border-slate-200 bg-white text-slate-700"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-[12px]">
                <span className="text-slate-500">Página</span>
                <Input
                  type="number"
                  min={1}
                  value={page}
                  onChange={(event) => setPage(Math.max(1, Number(event.target.value) || 1))}
                  className="h-7 w-14 border-0 bg-white px-2 text-center text-slate-900 shadow-none focus-visible:ring-1"
                />
              </div>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-9 w-9 rounded-xl border-slate-200 bg-white text-slate-700"
                onClick={() => setPage((current) => current + 1)}
                aria-label="Próxima página"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          ) : null}

          <div className="mx-1 hidden h-7 w-px bg-slate-200 sm:block" />

          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-9 w-9 rounded-xl border-slate-200 bg-white text-slate-700"
            onClick={() => setZoom((current) => Math.max(0.6, Number((current - 0.1).toFixed(2))))}
            aria-label="Diminuir zoom"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="min-w-[52px] text-center text-[12px] font-semibold text-slate-600">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-9 w-9 rounded-xl border-slate-200 bg-white text-slate-700"
            onClick={() => setZoom((current) => Math.min(2.5, Number((current + 0.1).toFixed(2))))}
            aria-label="Aumentar zoom"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="hidden h-9 rounded-xl border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-700 sm:inline-flex"
            onClick={() => setZoom(1)}
          >
            <Maximize2 className="mr-2 h-4 w-4" />
            100%
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[72px_minmax(0,1fr)_420px]">
        <aside className="hidden border-r border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#eef4f8_100%)] py-4 shadow-[8px_0_26px_rgba(15,23,42,0.04)] xl:flex xl:flex-col xl:items-center xl:gap-3">
          <button
            type="button"
            onClick={() => {
              setTool("navigate");
              setDraft(null);
              setDragStart(null);
            }}
            className={`flex w-[54px] flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-[9px] font-bold uppercase tracking-[0.08em] transition ${
              tool === "navigate"
                ? "border-sky-200 bg-sky-50 text-sky-800 shadow-sm"
                : "border-transparent text-slate-500 hover:bg-white hover:text-slate-800"
            }`}
          >
            <MousePointer2 className="h-5 w-5" />
            Selecionar
          </button>
          <button
            type="button"
            onClick={() => {
              setTool("highlight");
              setDraft(null);
              setDragStart(null);
            }}
            className={`flex w-[54px] flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-[9px] font-bold uppercase tracking-[0.08em] transition ${
              tool === "highlight"
                ? "border-amber-200 bg-amber-50 text-amber-800 shadow-sm"
                : "border-transparent text-slate-500 hover:bg-white hover:text-slate-800"
            }`}
          >
            <Highlighter className="h-5 w-5" />
            Área
          </button>
          <button
            type="button"
            onClick={() => {
              setTool("text");
              setDraft(null);
              setDragStart(null);
            }}
            className={`flex w-[54px] flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-[9px] font-bold uppercase tracking-[0.08em] transition ${
              tool === "text"
                ? "border-sky-200 bg-sky-50 text-sky-800 shadow-sm"
                : "border-transparent text-slate-500 hover:bg-white hover:text-slate-800"
            }`}
          >
            <MessageSquareText className="h-5 w-5" />
            Texto
          </button>
        </aside>

        <section className="min-h-0 overflow-auto bg-[radial-gradient(circle_at_top,#eef2f6_0%,#d8dee6_48%,#cdd5de_100%)] p-4 lg:p-5">
          <div className="mx-auto flex min-h-full max-w-[1440px] items-start justify-center">
            <div
              ref={surfaceRef}
              className={`relative w-full overflow-hidden rounded-[16px] border border-slate-400/70 bg-[#2f343b] shadow-[0_28px_80px_rgba(15,23,42,0.24)] ring-1 ring-white/50 ${
                tool === "navigate"
                  ? "cursor-default"
                  : tool === "highlight"
                    ? "cursor-crosshair"
                    : "cursor-cell"
              }`}
            >
              {tool !== "navigate" ? (
                <div
                  data-annotation-capture-layer="true"
                  className="absolute inset-0 z-10 touch-none select-none"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  aria-label={
                    tool === "highlight"
                      ? "Camada de marcação por área"
                      : "Camada de inserção de texto"
                  }
                />
              ) : null}

              {tool !== "navigate" ? (
                <div className="pointer-events-none absolute left-4 top-4 z-50 flex items-center gap-2 rounded-full border border-white/80 bg-white/95 px-3 py-2 text-[11px] font-semibold text-slate-800 shadow-[0_12px_30px_rgba(15,23,42,0.18)] backdrop-blur">
                  {tool === "highlight" ? (
                    <>
                      <Highlighter className="h-4 w-4 text-amber-600" />
                      Arraste sobre o ponto incorreto para destacar a área e registrar a observação
                    </>
                  ) : (
                    <>
                      <MessageSquareText className="h-4 w-4 text-sky-700" />
                      Clique no ponto exato do documento para fixar um texto numerado
                    </>
                  )}
                </div>
              ) : null}

              {!accessUrl ? (
                <div className="flex min-h-[calc(100vh-164px)] items-center justify-center bg-[#d8dee6] p-6">
                  {accessError ? (
                    <div className="max-w-xl rounded-[24px] border border-rose-200 bg-white p-6 text-center shadow-xl">
                      <p className="font-semibold text-slate-950">Não foi possível abrir o arquivo.</p>
                      <p className="mt-2 text-sm leading-6 text-slate-500">{accessError}</p>
                    </div>
                  ) : (
                    <div className="h-[82vh] max-h-[980px] min-h-[620px] w-[min(780px,86%)] rounded-[10px] border border-slate-300 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.16)]">
                      <div className="mx-auto mt-16 w-[62%] space-y-4">
                        <div className="h-3 w-2/3 animate-pulse rounded-full bg-slate-200" />
                        <div className="h-2.5 w-full animate-pulse rounded-full bg-slate-100" />
                        <div className="h-2.5 w-11/12 animate-pulse rounded-full bg-slate-100" />
                        <div className="h-2.5 w-5/6 animate-pulse rounded-full bg-slate-100" />
                        <div className="mt-8 h-32 animate-pulse rounded-xl bg-slate-50" />
                      </div>
                    </div>
                  )}
                </div>
              ) : isPdf ? (
                <iframe
                  key={previewUrl}
                  src={`${previewUrl}${previewUrl.includes("#") ? "&" : "#"}toolbar=0&navpanes=0&view=FitH`}
                  title={document.fileName || document.label}
                  className="h-[calc(100vh-164px)] min-h-[700px] w-full border-0 bg-[#2f343b]"
                  style={{ pointerEvents: tool === "navigate" ? "auto" : "none" }}
                />
              ) : (
                <div className="flex min-h-[calc(100vh-164px)] items-start justify-center overflow-auto bg-[#d8dee6] p-6">
                  <img
                    src={previewUrl}
                    alt={document.fileName || document.label}
                    draggable={false}
                    className="max-w-none select-none rounded-lg bg-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
                    style={{
                      width: `${zoom * 100}%`,
                      minWidth: "640px",
                      pointerEvents: tool === "navigate" ? "auto" : "none",
                    }}
                  />
                </div>
              )}

              {pageAnnotations.map((annotation, index) => {
                const kind = annotation.kind || "text";
                const isDraftAnnotation = annotation.id.startsWith("draft-");
                if (kind === "highlight") {
                  return (
                    <div
                      key={annotation.id}
                      className={`pointer-events-none absolute z-20 rounded-[4px] border ${
                        isDraftAnnotation
                          ? "border-dashed border-violet-500 bg-violet-300/35 shadow-[0_0_0_2px_rgba(139,92,246,0.18)]"
                          : "border-amber-500/70 bg-amber-300/38 shadow-[0_0_0_1px_rgba(251,191,36,0.18)]"
                      }`}
                      style={{
                        left: `${annotation.x}%`,
                        top: `${annotation.y}%`,
                        width: `${annotation.width ?? 3}%`,
                        height: `${annotation.height ?? 2}%`,
                      }}
                      title={`${annotation.note} · ${annotation.author}`}
                    >
                      <span
                        className={`absolute -right-2 -top-3 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white px-1 text-[9px] font-black text-white shadow-lg ${
                          isDraftAnnotation ? "bg-violet-600" : "bg-amber-600"
                        }`}
                      >
                        {index + 1}
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={annotation.id}
                    className="pointer-events-none absolute z-30 flex max-w-[280px] -translate-y-1/2 items-start gap-2"
                    style={{ left: `${annotation.x}%`, top: `${annotation.y}%` }}
                    title={`${annotation.note} · ${annotation.author}`}
                  >
                    <span className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full border-2 border-white text-[11px] font-black text-white shadow-[0_8px_22px_rgba(2,132,199,0.40)] ring-2 ${
                      isDraftAnnotation
                        ? "bg-violet-600 ring-violet-300/40"
                        : "bg-sky-600 ring-sky-300/40"
                    }`}>
                      {index + 1}
                    </span>
                    <span
                      className={`max-w-[210px] break-words rounded-xl border bg-white/95 px-3 py-2 text-[11px] font-semibold leading-4 text-slate-800 shadow-[0_12px_28px_rgba(15,23,42,0.20)] backdrop-blur ${
                        isDraftAnnotation ? "border-violet-200" : "border-sky-200"
                      }`}
                    >
                      {annotation.note}
                    </span>
                  </div>
                );
              })}

              {draft?.page === page && draft.kind === "highlight" ? (
                <div
                  className="pointer-events-none absolute z-40 rounded-[3px] border-2 border-amber-400 bg-amber-300/40"
                  style={{
                    left: `${draft.x}%`,
                    top: `${draft.y}%`,
                    width: `${draft.width ?? 0}%`,
                    height: `${draft.height ?? 0}%`,
                  }}
                />
              ) : null}

              {draft?.page === page && draft.kind === "text" ? (
                <div
                  className="pointer-events-none absolute z-40 flex -translate-y-1/2 items-center gap-2"
                  style={{ left: `${draft.x}%`, top: `${draft.y}%` }}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-sky-600 text-xs font-black text-white shadow-[0_10px_26px_rgba(2,132,199,0.45)] ring-4 ring-sky-300/30">
                    +
                  </span>
                  <span className="rounded-xl border border-sky-200 bg-white/95 px-3 py-2 text-[11px] font-semibold text-slate-700 shadow-lg">
                    Digite o apontamento no painel
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <aside data-analysis-inspector="true" className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto border-l border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-[-10px_0_28px_rgba(15,23,42,0.04)]">
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Painel técnico
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-950">
                  Anotações e decisão
                </p>
              </div>
              <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-slate-100 px-2 text-[11px] font-bold text-slate-600">
                {pageAnnotations.length}
              </span>
            </div>
          </div>

          <div className="space-y-4 p-5">
            <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-800">
                Ferramenta ativa
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {tool === "highlight"
                  ? "Marcar área com apontamento"
                  : tool === "text"
                    ? "Adicionar texto numerado"
                    : "Navegação"}
              </p>
              <p className="mt-1 break-words text-xs leading-5 text-slate-500">
                {tool === "highlight"
                  ? "Arraste sobre a área que precisa ser corrigida e registre a observação."
                  : tool === "text"
                    ? "Clique no ponto do documento onde deseja inserir o comentário."
                    : "Use o PDF normalmente para leitura, rolagem e conferência."}
              </p>
            </div>

            {draft ? (
              <div className="rounded-[20px] border border-sky-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.07)]">
                <p className="text-sm font-semibold text-slate-950">
                  {draft.kind === "highlight"
                    ? "Observação da área marcada"
                    : "Texto fixado no documento"}
                </p>
                <p className="mt-1 text-xs text-slate-500">Página {draft.page}</p>
                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Descreva exatamente o problema e a correção necessária."
                  className="mt-3 min-h-[120px] resize-y rounded-xl border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
                />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full border-slate-200"
                    onClick={() => {
                      setDraft(null);
                      setNote("");
                      setDragStart(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    className="rounded-full bg-sky-700 text-white hover:bg-sky-600"
                    disabled={!note.trim() || busy === "annotation"}
                    onClick={() => void saveAnnotation()}
                  >
                    Adicionar ao rascunho
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="rounded-[20px] border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-950">
                  Anotações · página {page}
                </p>
                <span className="text-[11px] font-semibold text-slate-400">
                  {pageAnnotations.length}
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {pageAnnotations.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-xs leading-5 text-slate-500">
                    Nenhuma anotação nesta página.
                  </div>
                ) : (
                  pageAnnotations.map((annotation, index) => (
                    <div
                      key={annotation.id}
                      className={`rounded-xl border bg-white p-3 shadow-sm ${
                        annotation.id.startsWith("draft-")
                          ? "border-violet-200 ring-1 ring-violet-100"
                          : "border-slate-200"
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                            annotation.kind === "highlight"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-sky-50 text-sky-700"
                          }`}
                        >
                          {annotation.kind === "highlight" ? (
                            <Highlighter className="h-4 w-4" />
                          ) : (
                            <MessageSquareText className="h-4 w-4" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                              Marcação {index + 1}
                            </p>
                            {annotation.id.startsWith("draft-") ? (
                              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-violet-700">
                                Rascunho
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-emerald-700">
                                Enviado
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm leading-5 text-slate-700">{annotation.note}</p>
                          {annotation.id.startsWith("draft-") ? (
                            <button
                              type="button"
                              className="mt-2 text-[10px] font-semibold text-rose-600 hover:text-rose-700 hover:underline"
                              onClick={() => removeDraftAnnotation(annotation.id)}
                            >
                              Remover do rascunho
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <p className="mt-2 text-[10px] text-slate-400">
                        {annotation.author} · {annotation.createdAt}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="min-w-0 overflow-hidden rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    Rascunho técnico
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-950">
                    {draftAnnotations.length} apontamento(s) ainda não enviado(s)
                  </p>
                  <p className="mt-1 break-words text-xs leading-5 text-slate-500">
                    Marque todos os pontos necessários, salve o rascunho e somente depois envie ao profissional.
                  </p>
                </div>
                <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-xl bg-violet-50 px-2 text-xs font-bold text-violet-700">
                  {draftAnnotations.length}
                </span>
              </div>

              {draftSavedAt ? (
                <p className="mt-3 rounded-xl border border-violet-100 bg-violet-50/70 px-3 py-2 text-[11px] font-medium text-violet-700">
                  Último rascunho salvo em {new Date(draftSavedAt).toLocaleString("pt-BR")}.
                </p>
              ) : null}

              <div className="mt-4">
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                  Mensagem complementar ao profissional
                </label>
                <Textarea
                  value={comuniqueReason}
                  onChange={(event) => setComuniqueReason(event.target.value)}
                  placeholder="Opcional: inclua uma orientação geral além dos apontamentos feitos no documento."
                  className="min-h-[88px] rounded-xl border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400"
                />
              </div>

              <div className="mt-3">
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                  Prazo para correção
                </label>
                <Input
                  type="date"
                  value={comuniqueDueDate}
                  onChange={(event) => setComuniqueDueDate(event.target.value)}
                  className="h-10 rounded-xl border-slate-200 bg-white text-slate-900"
                />
              </div>

              <div className="mt-4 grid min-w-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full min-w-0 rounded-xl border-violet-200 bg-violet-50 px-3 text-violet-800 hover:bg-violet-100"
                  disabled={busy === "send-draft"}
                  onClick={saveReviewDraft}
                >
                  <Save className="mr-2 h-4 w-4" />
                  Salvar rascunho
                </Button>
                <Button
                  type="button"
                  className="h-11 w-full min-w-0 rounded-xl bg-[linear-gradient(135deg,#7c2d12_0%,#b45309_58%,#d97706_100%)] px-3 font-bold text-white shadow-[0_10px_24px_rgba(180,83,9,0.22)] hover:brightness-105"
                  disabled={busy === "send-draft" || draftAnnotations.length === 0}
                  onClick={() => void sendDraftToProfessional()}
                >
                  <Send className="mr-2 h-4 w-4" />
                  {busy === "send-draft" ? "Enviando..." : "Enviar apontamentos"}
                </Button>
              </div>

              <p className="mt-3 text-[11px] leading-5 text-slate-500">
                Salvar rascunho não comunica o profissional. “Enviar apontamentos” registra as marcações, cria a exigência e coloca o documento aguardando correção.
              </p>
            </div>

            <div className="min-w-0 overflow-hidden rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Resultado da análise
              </p>

              {localReviewStatus === "aprovado" ? (
                <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-emerald-900">Documento aprovado</p>
                      <p className="mt-1 text-xs leading-5 text-emerald-700">
                        A decisão foi registrada no processo.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  className="mt-3 w-full rounded-full bg-emerald-600 text-white hover:bg-emerald-500"
                  disabled={busy.startsWith("review-") || busy === "send-draft"}
                  onClick={() => void approveDocument()}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {busy === "review-aprovado" ? "Aprovando..." : "Aprovar documento"}
                </Button>
              )}

              {localReviewStatus === "rejeitado" ? (
                <div className="mt-3 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-medium text-amber-800">
                  <XCircle className="h-4 w-4" />
                  Apontamentos enviados — aguardando correção e reenvio
                </div>
              ) : null}
            </div>

            {status ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700">
                {status}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}
