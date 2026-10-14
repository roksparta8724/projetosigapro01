import {
  ArrowLeft,
  Download,
  FileText,
  Highlighter,
  Info,
  MessageSquareText,
  PenTool,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MarkerSelector } from "@/components/platform/MarkerSelector";
import { DocumentWorkspaceBoot } from "@/components/platform/DocumentWorkspaceBoot";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { useDocumentMarkerAssignments } from "@/hooks/useDocumentMarkerAssignments";
import { getSignedUrlForObjectStrict } from "@/integrations/r2/client";
import {
  canAccessProcess,
  formatOfficialProcessNumber,
  getProcessById,
} from "@/lib/platform";

function inferMimeType(fileName?: string, mimeType?: string) {
  if (mimeType?.trim()) return mimeType;
  const value = (fileName || "").toLowerCase();
  if (value.endsWith(".pdf")) return "application/pdf";
  if (value.endsWith(".png")) return "image/png";
  if (value.endsWith(".jpg") || value.endsWith(".jpeg")) return "image/jpeg";
  if (value.endsWith(".webp")) return "image/webp";
  if (value.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

function formatFileSize(value?: number) {
  if (!value || value <= 0) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentViewerPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { processId, documentId } = useParams();
  const routeState = (location.state ?? {}) as {
    documentAccessUrl?: string;
    returnTo?: string;
  };
  const prefetchedDocumentAccessUrl =
    typeof routeState.documentAccessUrl === "string"
      ? routeState.documentAccessUrl
      : "";
  const {
    processes,
    loading: platformDataLoading,
    dataReadyForCurrentUser,
  } = usePlatformData();
  const { session } = usePlatformSession();
  const { municipality, scopeId } = useMunicipality();
  const documentMarkers = useDocumentMarkerAssignments();
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const [accessUrl, setAccessUrl] = useState(prefetchedDocumentAccessUrl);
  const [error, setError] = useState("");

  const process = useMemo(
    () => (processId ? getProcessById(processId, processes) : undefined),
    [processId, processes],
  );
  const document = useMemo(
    () => process?.documents.find((item) => item.id === documentId),
    [documentId, process],
  );
  const documentMarkerTags =
    process && document ? documentMarkers.getTags(process.id, document.id) : [];

  const allowed = Boolean(
    process &&
      document &&
      document.uploaded &&
      canAccessProcess(session, process, effectiveScopeId),
  );

  const canAnalyzeDocument = Boolean(
    process &&
      document &&
      document.uploaded &&
      canAccessProcess(session, process, effectiveScopeId) &&
      session.role !== "prefeitura_admin" &&
      (
        session.role === "master_admin" ||
        session.role === "master_ops" ||
        session.role === "prefeitura_supervisor" ||
        session.role === "analista"
      ),
  );

  const openAnalysisWorkspace = (tool?: "highlight" | "text") => {
    if (!process || !document || !canAnalyzeDocument) return;
    const query = tool ? `?ferramenta=${tool}` : "";
    navigate(
      `/processos/${process.id}/documentos/${document.id}/analisar${query}`,
      {
        state: {
          documentAccessUrl: accessUrl || prefetchedDocumentAccessUrl,
          returnTo:
            routeState.returnTo ||
            `/processos/${process.id}?aba=documentos`,
        },
      },
    );
  };

  const replaceAnalystViewerWithAnalysis = canAnalyzeDocument && Boolean(process && document);

  useEffect(() => {
    if (!replaceAnalystViewerWithAnalysis || !process || !document) return;
    navigate(
      `/processos/${process.id}/documentos/${document.id}/analisar?ferramenta=highlight`,
      {
        replace: true,
        state: {
          documentAccessUrl: accessUrl || prefetchedDocumentAccessUrl,
          returnTo:
            routeState.returnTo ||
            `/processos/${process.id}?aba=documentos`,
        },
      },
    );
  }, [
    accessUrl,
    document?.id,
    navigate,
    prefetchedDocumentAccessUrl,
    process?.id,
    replaceAnalystViewerWithAnalysis,
    routeState.returnTo,
  ]);

  useEffect(() => {
    let cancelled = false;
    setError("");

    if (!allowed || !document) {
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

    if (!document.filePath) {
      setAccessUrl(document.previewUrl || "");
      if (!document.previewUrl) {
        setError("Este documento não possui arquivo disponível para visualização.");
      }
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
        if (!cancelled) {
          if (url) setAccessUrl(url);
          else setError("Não foi possível gerar o acesso seguro ao documento.");
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Não foi possível abrir o documento armazenado.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    allowed,
    document?.id,
    document?.filePath,
    document?.previewUrl,
    prefetchedDocumentAccessUrl,
  ]);

  if (replaceAnalystViewerWithAnalysis) {
    return <DocumentWorkspaceBoot mode="analysis" />;
  }

  if (!process || !document) {
    if (platformDataLoading || !dataReadyForCurrentUser) {
      return <DocumentWorkspaceBoot mode="viewer" />;
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#dfe5ec] p-6">
        <div className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-[0_24px_70px_rgba(15,23,42,0.14)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
            <FileText className="h-6 w-6" />
          </div>
          <h1 className="mt-5 text-xl font-bold text-slate-950">Documento não encontrado</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            O arquivo solicitado não está disponível neste processo.
          </p>
          <Button type="button" variant="outline" className="mt-6 rounded-full" onClick={() => window.close()}>
            Fechar guia
          </Button>
        </div>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#dfe5ec] p-6">
        <div className="w-full max-w-lg rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-[0_24px_70px_rgba(15,23,42,0.14)]">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="mt-5 text-xl font-bold text-slate-950">Acesso protegido</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Seu perfil não pode visualizar este documento.
          </p>
          <Button type="button" variant="outline" className="mt-6 rounded-full" onClick={() => window.close()}>
            Fechar guia
          </Button>
        </div>
      </main>
    );
  }

  const mimeType = inferMimeType(document.fileName, document.mimeType);
  const isImage = mimeType.startsWith("image/");
  const isPdf = mimeType === "application/pdf";
  const embeddedUrl =
    isPdf && accessUrl
      ? `${accessUrl}${accessUrl.includes("#") ? "&" : "#"}toolbar=0&navpanes=0&view=FitH`
      : accessUrl;
  const fileSize = document.sizeLabel || formatFileSize(document.fileSizeBytes);

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-[#dfe5ec] text-slate-950">
      <header className="flex min-h-[66px] shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-[linear-gradient(135deg,#071525_0%,#102a43_55%,#123a58_100%)] px-5 py-3 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/10 shadow-inner">
            <FileText className="h-5 w-5 text-sky-200" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-200/70">
              Visualizador documental
            </p>
            <p className="mt-1 truncate text-[15px] font-semibold text-white">{document.label}</p>
            <p className="mt-0.5 truncate text-[11px] text-slate-300">
              {document.fileName || "Documento técnico"} · {formatOfficialProcessNumber(process.protocol)}
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
          {canAnalyzeDocument ? (
            <Button
              type="button"
              onClick={() => openAnalysisWorkspace()}
              className="h-9 rounded-full border border-amber-300/40 bg-amber-300/15 px-4 text-[12px] font-semibold text-amber-100 hover:bg-amber-300/25 hover:text-white"
            >
              <PenTool className="mr-2 h-4 w-4" />
              Analisar / marcar PDF
            </Button>
          ) : null}

        </div>
      </header>

      <div className="flex min-h-[52px] shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 shadow-[0_4px_18px_rgba(15,23,42,0.05)]">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-full border-slate-200 bg-white px-4 text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={() => {
              if (routeState.returnTo) navigate(routeState.returnTo);
              else if (window.history.length > 1) navigate(-1);
              else navigate("/dashboard/processos");
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao processo
          </Button>

          <span className="hidden h-8 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[11px] font-semibold text-emerald-800 md:inline-flex">
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
            Acesso seguro
          </span>

          {canAnalyzeDocument ? (
            <div className="ml-1 hidden items-center gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1 shadow-sm lg:flex">
              <span className="px-2 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
                Ferramentas
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-xl border-amber-200 bg-amber-50 px-3 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                onClick={() => openAnalysisWorkspace("highlight")}
              >
                <Highlighter className="mr-1.5 h-3.5 w-3.5" />
                Marca-texto
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-xl border-sky-200 bg-sky-50 px-3 text-[11px] font-semibold text-sky-900 hover:bg-sky-100"
                onClick={() => openAnalysisWorkspace("text")}
              >
                <MessageSquareText className="mr-1.5 h-3.5 w-3.5" />
                Adicionar texto
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {accessUrl ? (
            <>

              <a
                href={accessUrl}
                download={document.fileName || document.label}
                className="inline-flex h-9 items-center justify-center rounded-full bg-slate-950 px-3 text-[12px] font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                <Download className="mr-2 h-4 w-4" />
                Baixar
              </a>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-h-0 overflow-hidden bg-[#d7dde5] p-3 lg:p-5">
          <div className="h-full overflow-hidden rounded-[18px] border border-slate-300/80 bg-[#2b3037] shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
            {error ? (
              <div className="flex h-full items-center justify-center p-8">
                <div className="max-w-xl rounded-[24px] border border-rose-200 bg-white p-7 text-center shadow-xl">
                  <p className="text-base font-semibold text-slate-950">Não foi possível abrir o documento.</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{error}</p>
                </div>
              </div>
            ) : !accessUrl ? (
              <div className="flex h-full items-center justify-center bg-[#d7dde5] p-6">
                <div className="h-[88%] w-[min(760px,86%)] rounded-[10px] border border-slate-300 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.16)]">
                  <div className="mx-auto mt-16 w-[62%] space-y-4">
                    <div className="h-3 w-2/3 animate-pulse rounded-full bg-slate-200" />
                    <div className="h-2.5 w-full animate-pulse rounded-full bg-slate-100" />
                    <div className="h-2.5 w-11/12 animate-pulse rounded-full bg-slate-100" />
                    <div className="h-2.5 w-5/6 animate-pulse rounded-full bg-slate-100" />
                    <div className="mt-8 h-32 animate-pulse rounded-xl bg-slate-50" />
                  </div>
                </div>
              </div>
            ) : isImage ? (
              <div className="h-full w-full overflow-auto bg-[#d7dde5] p-5">
                <img
                  src={embeddedUrl}
                  alt={document.fileName || document.label}
                  className="mx-auto max-h-full max-w-full rounded-lg bg-white object-contain shadow-[0_18px_50px_rgba(15,23,42,0.2)]"
                />
              </div>
            ) : (
              <iframe
                src={embeddedUrl}
                title={document.fileName || document.label}
                className="h-full w-full border-0 bg-[#2b3037]"
              />
            )}
          </div>
        </section>

        <aside className="hidden min-h-0 overflow-y-auto border-l border-slate-200 bg-white xl:block">
          <div className="border-b border-slate-200 px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              Documento
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-950">{document.label}</p>
          </div>

          <div className="space-y-4 p-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-sky-700" />
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  Informações
                </p>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Arquivo</dt>
                  <dd className="mt-1 break-words font-medium text-slate-800">{document.fileName || "Não informado"}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Tipo</dt>
                  <dd className="mt-1 font-medium text-slate-800">{mimeType}</dd>
                </div>
                {fileSize ? (
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Tamanho</dt>
                    <dd className="mt-1 font-medium text-slate-800">{fileSize}</dd>
                  </div>
                ) : null}
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Processo</dt>
                  <dd className="mt-1 font-medium text-slate-800">{formatOfficialProcessNumber(process.protocol)}</dd>
                </div>
              </dl>
            </div>

            {canAnalyzeDocument ? (
              <div className="rounded-[20px] border border-slate-200 bg-[linear-gradient(145deg,#f8fafc_0%,#eef6fb_100%)] p-4 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Ferramentas de análise
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-950">
                  Marque diretamente os pontos incorretos
                </p>
                <div className="mt-3 grid gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start rounded-xl border-amber-200 bg-white text-amber-900 hover:bg-amber-50"
                    onClick={() => openAnalysisWorkspace("highlight")}
                  >
                    <Highlighter className="mr-2 h-4 w-4" />
                    Marca-texto por área
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="justify-start rounded-xl border-sky-200 bg-white text-sky-900 hover:bg-sky-50"
                    onClick={() => openAnalysisWorkspace("text")}
                  >
                    <MessageSquareText className="mr-2 h-4 w-4" />
                    Texto / comentário por ponto
                  </Button>
                </div>
              </div>
            ) : null}

            {document.annotations?.length ? (
              <div className="rounded-[20px] border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-800">
                      Apontamentos do analista
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-950">
                      Correções indicadas no documento
                    </p>
                  </div>
                  <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-white px-2 text-[11px] font-bold text-amber-800 shadow-sm">
                    {document.annotations.length}
                  </span>
                </div>

                <div className="mt-3 space-y-2">
                  {document.annotations.map((annotation, index) => (
                    <div key={annotation.id} className="rounded-xl border border-amber-100 bg-white p-3 shadow-sm">
                      <div className="flex items-start gap-2">
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                          annotation.kind === "highlight"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-sky-50 text-sky-700"
                        }`}>
                          {annotation.kind === "highlight" ? (
                            <Highlighter className="h-4 w-4" />
                          ) : (
                            <MessageSquareText className="h-4 w-4" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                            Apontamento {index + 1} · Página {annotation.page || 1}
                          </p>
                          <p className="mt-1 text-sm leading-5 text-slate-700">
                            {annotation.note}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-sky-800">Visualização protegida</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                O arquivo é exibido por acesso temporário assinado nesta mesma guia.
              </p>
              {canAnalyzeDocument ? (
                <Button
                  type="button"
                  onClick={() => openAnalysisWorkspace()}
                  className="mt-4 w-full rounded-full bg-slate-950 text-white hover:bg-slate-800"
                >
                  <PenTool className="mr-2 h-4 w-4" />
                  Abrir mesa de análise
                </Button>
              ) : (
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Quando houver apontamentos enviados pela Prefeitura, eles aparecerão acima com a página e a correção solicitada.
                </p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
