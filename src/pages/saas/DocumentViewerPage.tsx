import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  Info,
  Maximize2,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
  const { processId, documentId } = useParams();
  const {
    processes,
    loading: platformDataLoading,
    dataReadyForCurrentUser,
  } = usePlatformData();
  const { session } = usePlatformSession();
  const { municipality, scopeId } = useMunicipality();
  const documentMarkers = useDocumentMarkerAssignments();
  const effectiveScopeId = municipality?.id ?? scopeId ?? session.tenantId ?? null;
  const [accessUrl, setAccessUrl] = useState("");
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

  useEffect(() => {
    let cancelled = false;
    setAccessUrl("");
    setError("");

    if (!allowed || !document) {
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
  ]);

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
          {accessUrl ? (
            <a
              href={accessUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-9 items-center justify-center rounded-full border border-white/15 bg-white/5 px-3 text-[12px] font-semibold text-white transition hover:bg-white/10 sm:inline-flex"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Original
            </a>
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
              if (window.history.length > 1) navigate(-1);
              else window.close();
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao processo
          </Button>

          <span className="hidden h-8 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 text-[11px] font-semibold text-emerald-800 md:inline-flex">
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
            Acesso seguro
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {accessUrl ? (
            <>
              <a
                href={accessUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-3 text-[12px] font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                <Maximize2 className="mr-2 h-4 w-4" />
                Abrir original
              </a>
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

            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-sky-800">Visualização protegida</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                O arquivo é exibido por acesso temporário assinado. Para marcações técnicas, abra a tela de análise do documento.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
