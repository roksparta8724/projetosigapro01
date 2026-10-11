import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Highlighter,
  MessageSquareText,
  MousePointer2,
  XCircle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { getSignedUrlForObjectStrict } from "@/integrations/r2/client";
import {
  canAccessProcess,
  formatOfficialProcessNumber,
  getProcessById,
  isInternalRole,
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

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

export function DocumentAnalysisPage() {
  const { processId, documentId } = useParams();
  const { session } = usePlatformSession();
  const { municipality, scopeId } = useMunicipality();
  const { processes, addDocumentAnnotation, reviewProcessDocument } = usePlatformData();
  const process = processId ? getProcessById(processId, processes) : undefined;
  const document = process?.documents.find((item) => item.id === documentId);
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const [accessUrl, setAccessUrl] = useState("");
  const [accessError, setAccessError] = useState("");
  const [tool, setTool] = useState<AnalysisTool>("navigate");
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [draft, setDraft] = useState<DraftAnnotation | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);

  const canUseAnalysis =
    !!process &&
    !!document &&
    isInternalRole(session.role) &&
    canAccessProcess(session, process, effectiveScopeId);

  useEffect(() => {
    let cancelled = false;
    setAccessUrl("");
    setAccessError("");

    if (!canUseAnalysis || !document?.filePath) return () => {
      cancelled = true;
    };

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
  }, [canUseAnalysis, document?.filePath]);

  const isPdf =
    document?.mimeType === "application/pdf" ||
    document?.fileName?.toLowerCase().endsWith(".pdf");

  const previewUrl = useMemo(() => {
    if (!accessUrl) return "";
    if (!isPdf) return accessUrl;
    const separator = accessUrl.includes("#") ? "&" : "#";
    return `${accessUrl}${separator}page=${page}&zoom=${Math.round(zoom * 100)}&toolbar=0&navpanes=0`;
  }, [accessUrl, isPdf, page, zoom]);

  const pageAnnotations = useMemo(
    () =>
      (document?.annotations ?? []).filter(
        (annotation) => Number(annotation.page ?? 1) === page,
      ),
    [document?.annotations, page],
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

    setBusy("annotation");
    setStatus("");
    try {
      await addDocumentAnnotation(process.id, document.id, {
        kind: draft.kind,
        page: draft.page,
        x: draft.x,
        y: draft.y,
        width: draft.width,
        height: draft.height,
        note: note.trim(),
        author: session.name,
      });
      setDraft(null);
      setNote("");
      setStatus(
        draft.kind === "highlight"
          ? "Marca-texto salvo no processo."
          : "Observação textual salva no processo.",
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a anotação.",
      );
    } finally {
      setBusy("");
    }
  };

  const review = async (reviewStatus: "aprovado" | "rejeitado") => {
    if (!process || !document) return;
    setBusy(`review-${reviewStatus}`);
    setStatus("");
    try {
      await reviewProcessDocument(
        process.id,
        document.id,
        reviewStatus,
        session.name,
      );
      setStatus(
        reviewStatus === "aprovado"
          ? "Documento aprovado."
          : "Documento marcado como rejeitado.",
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Não foi possível registrar a análise.",
      );
    } finally {
      setBusy("");
    }
  };

  if (!process || !document) {
    return (
      <div className="min-h-screen bg-slate-950 p-8 text-white">
        Documento não encontrado no processo.
      </div>
    );
  }

  if (!canUseAnalysis) {
    return (
      <div className="min-h-screen bg-slate-950 p-8 text-white">
        Esta área é exclusiva da equipe interna responsável pela análise.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07111f] text-slate-100">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#07111f]/95 backdrop-blur">
        <div className="flex min-h-[74px] flex-wrap items-center justify-between gap-4 px-5 py-3 lg:px-7">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-sky-200/70">
              <FileText className="h-4 w-4" />
              Análise documental
            </div>
            <h1 className="mt-1 truncate text-lg font-semibold text-white">
              {document.label}
            </h1>
            <p className="mt-1 text-xs text-slate-400">
              Processo nº {formatOfficialProcessNumber(process)}
              {document.fileName ? ` • ${document.fileName}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-full border-white/15 bg-white/5 text-slate-100">
              {document.reviewStatus || "pendente"}
            </Badge>
            {accessUrl ? (
              <a
                href={accessUrl}
                download={document.fileName || document.label}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 text-sm font-medium text-slate-100 hover:bg-white/10"
              >
                <Download className="h-4 w-4" />
                Baixar original
              </a>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-3 lg:px-7">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className={`rounded-full border-white/15 bg-transparent text-slate-100 hover:bg-white/10 ${
                tool === "navigate" ? "ring-2 ring-sky-400/70" : ""
              }`}
              onClick={() => {
                setTool("navigate");
                setDraft(null);
                setDragStart(null);
              }}
            >
              <MousePointer2 className="mr-2 h-4 w-4" />
              Navegar
            </Button>
            <Button
              type="button"
              variant="outline"
              className={`rounded-full border-white/15 bg-transparent text-slate-100 hover:bg-white/10 ${
                tool === "highlight" ? "ring-2 ring-amber-300/80" : ""
              }`}
              onClick={() => {
                setTool("highlight");
                setDraft(null);
                setDragStart(null);
              }}
            >
              <Highlighter className="mr-2 h-4 w-4" />
              Marca-texto
            </Button>
            <Button
              type="button"
              variant="outline"
              className={`rounded-full border-white/15 bg-transparent text-slate-100 hover:bg-white/10 ${
                tool === "text" ? "ring-2 ring-sky-400/70" : ""
              }`}
              onClick={() => {
                setTool("text");
                setDraft(null);
                setDragStart(null);
              }}
            >
              <MessageSquareText className="mr-2 h-4 w-4" />
              Texto
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {isPdf ? (
              <>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="rounded-full border-white/15 bg-transparent text-white hover:bg-white/10"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm">
                  <span className="text-slate-400">Página</span>
                  <Input
                    type="number"
                    min={1}
                    value={page}
                    onChange={(event) => setPage(Math.max(1, Number(event.target.value) || 1))}
                    className="h-7 w-16 border-white/10 bg-black/20 px-2 text-center text-white"
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="rounded-full border-white/15 bg-transparent text-white hover:bg-white/10"
                  onClick={() => setPage((current) => current + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="rounded-full border-white/15 bg-transparent text-white hover:bg-white/10"
              onClick={() => setZoom((current) => Math.max(0.6, Number((current - 0.1).toFixed(2))))}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="min-w-[54px] text-center text-sm text-slate-300">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="rounded-full border-white/15 bg-transparent text-white hover:bg-white/10"
              onClick={() => setZoom((current) => Math.min(2.5, Number((current + 0.1).toFixed(2))))}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="grid min-h-[calc(100vh-132px)] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 bg-[#0a1625] p-4 lg:p-6">
          <div
            ref={surfaceRef}
            className={`relative mx-auto min-h-[760px] max-w-[1280px] overflow-hidden rounded-[22px] border border-white/10 bg-slate-900 shadow-2xl ${
              tool === "navigate" ? "cursor-default" : tool === "highlight" ? "cursor-crosshair" : "cursor-cell"
            }`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            {!accessUrl ? (
              <div className="flex min-h-[760px] items-center justify-center p-8 text-center text-slate-400">
                {accessError || "Gerando acesso seguro ao documento..."}
              </div>
            ) : isPdf ? (
              <iframe
                key={previewUrl}
                src={previewUrl}
                title={document.fileName || document.label}
                className="h-[calc(100vh-180px)] min-h-[760px] w-full bg-white"
                style={{ pointerEvents: tool === "navigate" ? "auto" : "none" }}
              />
            ) : (
              <div className="flex min-h-[760px] items-start justify-center overflow-auto bg-[#111827] p-6">
                <img
                  src={previewUrl}
                  alt={document.fileName || document.label}
                  draggable={false}
                  className="max-w-none select-none bg-white shadow-2xl"
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
              if (kind === "highlight") {
                return (
                  <div
                    key={annotation.id}
                    className="pointer-events-none absolute z-20 rounded-sm border border-amber-500/60 bg-amber-300/35 shadow-[0_0_0_1px_rgba(251,191,36,0.12)]"
                    style={{
                      left: `${annotation.x}%`,
                      top: `${annotation.y}%`,
                      width: `${annotation.width ?? 3}%`,
                      height: `${annotation.height ?? 2}%`,
                    }}
                    title={`${annotation.note} • ${annotation.author}`}
                  />
                );
              }

              return (
                <div
                  key={annotation.id}
                  className="pointer-events-none absolute z-30 max-w-[240px] -translate-y-1/2 rounded-xl border border-sky-300/50 bg-sky-950/95 px-3 py-2 text-xs text-white shadow-xl"
                  style={{ left: `${annotation.x}%`, top: `${annotation.y}%` }}
                  title={`${annotation.note} • ${annotation.author}`}
                >
                  <span className="mr-1 font-bold text-sky-300">{index + 1}.</span>
                  {annotation.note}
                </div>
              );
            })}

            {draft?.page === page && draft.kind === "highlight" ? (
              <div
                className="pointer-events-none absolute z-40 rounded-sm border-2 border-amber-300 bg-amber-300/35"
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
                className="pointer-events-none absolute z-40 -translate-y-1/2 rounded-full border-2 border-white bg-sky-500 px-3 py-1 text-xs font-bold text-white shadow-xl"
                style={{ left: `${draft.x}%`, top: `${draft.y}%` }}
              >
                Texto
              </div>
            ) : null}
          </div>
        </section>

        <aside className="border-l border-white/10 bg-[#091522] p-5">
          <div className="rounded-[22px] border border-white/10 bg-white/[0.045] p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
              Como analisar
            </p>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              Use <strong>Marca-texto</strong> e arraste sobre a área incorreta.
              Use <strong>Texto</strong> e clique no ponto onde deseja registrar
              uma observação. As marcações ficam gravadas no processo.
            </p>
            {isPdf ? (
              <p className="mt-3 text-xs leading-5 text-amber-200/80">
                Em PDF, informe a página correta antes de marcar. As anotações são
                vinculadas à página selecionada.
              </p>
            ) : null}
          </div>

          {draft ? (
            <div className="mt-4 rounded-[22px] border border-sky-400/20 bg-sky-400/[0.06] p-4">
              <p className="text-sm font-semibold text-white">
                {draft.kind === "highlight" ? "Comentário do marca-texto" : "Texto da observação"}
              </p>
              <p className="mt-1 text-xs text-slate-400">Página {draft.page}</p>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Descreva exatamente o que está errado e o que deve ser corrigido."
                rows={5}
                className="mt-3 w-full resize-y rounded-2xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400/50"
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full border-white/15 bg-transparent text-slate-200 hover:bg-white/10"
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
                  className="rounded-full bg-sky-600 text-white hover:bg-sky-500"
                  disabled={!note.trim() || busy === "annotation"}
                  onClick={() => void saveAnnotation()}
                >
                  {busy === "annotation" ? "Salvando..." : "Salvar marcação"}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.045] p-4">
            <p className="text-sm font-semibold text-white">Anotações da página {page}</p>
            <div className="mt-3 space-y-3">
              {pageAnnotations.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhuma marcação nesta página.</p>
              ) : (
                pageAnnotations.map((annotation, index) => (
                  <div key={annotation.id} className="rounded-2xl border border-white/8 bg-black/15 p-3">
                    <div className="flex items-center gap-2">
                      {annotation.kind === "highlight" ? (
                        <Highlighter className="h-4 w-4 text-amber-300" />
                      ) : (
                        <MessageSquareText className="h-4 w-4 text-sky-300" />
                      )}
                      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">
                        Marcação {index + 1}
                      </p>
                    </div>
                    <p className="mt-2 text-sm leading-5 text-slate-200">{annotation.note}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {annotation.author} • {annotation.createdAt}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 rounded-[22px] border border-white/10 bg-white/[0.045] p-4">
            <p className="text-sm font-semibold text-white">Resultado da análise</p>
            <div className="mt-3 grid gap-2">
              <Button
                type="button"
                className="rounded-full bg-emerald-600 text-white hover:bg-emerald-500"
                disabled={busy.startsWith("review-")}
                onClick={() => void review("aprovado")}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Aprovar documento
              </Button>
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
                disabled={busy.startsWith("review-")}
                onClick={() => void review("rejeitado")}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Rejeitar documento
              </Button>
            </div>
          </div>

          {status ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm text-slate-200">
              {status}
            </div>
          ) : null}
        </aside>
      </main>
    </div>
  );
}
