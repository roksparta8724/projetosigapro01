import { ArrowLeft, Download, ExternalLink, FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useMunicipality } from "@/hooks/useMunicipality";
import { usePlatformData } from "@/hooks/usePlatformData";
import { usePlatformSession } from "@/hooks/usePlatformSession";
import { getSignedUrlForObjectStrict } from "@/integrations/r2/client";
import { canAccessProcess, getProcessById } from "@/lib/platform";

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

export function DocumentViewerPage() {
  const navigate = useNavigate();
  const { processId, documentId } = useParams();
  const { processes } = usePlatformData();
  const { session } = usePlatformSession();
  const { municipality, scopeId } = useMunicipality();
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

    if (!allowed || !document) return () => {
      cancelled = true;
    };

    if (!document.filePath) {
      setAccessUrl(document.previewUrl || "");
      if (!document.previewUrl) setError("Este documento não possui arquivo disponível para visualização.");
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
  }, [allowed, document]);

  if (!process || !document) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <div className="max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-8 text-center shadow-2xl">
          <FileText className="mx-auto h-10 w-10 text-slate-300" />
          <h1 className="mt-4 text-xl font-bold">Documento não encontrado</h1>
          <Button type="button" variant="outline" className="mt-6 rounded-full" onClick={() => window.close()}>
            Fechar guia
          </Button>
        </div>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-white">
        <div className="max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-8 text-center shadow-2xl">
          <FileText className="mx-auto h-10 w-10 text-slate-300" />
          <h1 className="mt-4 text-xl font-bold">Acesso protegido</h1>
          <p className="mt-2 text-sm text-slate-300">Seu perfil não pode visualizar este documento.</p>
          <Button type="button" variant="outline" className="mt-6 rounded-full" onClick={() => window.close()}>
            Fechar guia
          </Button>
        </div>
      </main>
    );
  }

  const mimeType = inferMimeType(document.fileName, document.mimeType);
  const isImage = mimeType.startsWith("image/");

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-slate-950">
      <header className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-slate-900 px-5 py-3 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="shrink-0 rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            onClick={() => {
              if (window.history.length > 1) navigate(-1);
              else window.close();
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{document.label}</p>
            <p className="truncate text-xs text-slate-300">
              {document.fileName || "Documento técnico"} · {process.protocol}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {accessUrl ? (
            <>
              <a
                href={accessUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 text-sm font-medium text-white hover:bg-white/10"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Abrir original
              </a>
              <a
                href={accessUrl}
                download={document.fileName || document.label}
                className="inline-flex h-10 items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 text-sm font-medium text-white hover:bg-white/10"
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </a>
            </>
          ) : null}
        </div>
      </header>

      <section className="min-h-0 flex-1 bg-slate-800">
        {error ? (
          <div className="flex h-full items-center justify-center p-8">
            <div className="max-w-xl rounded-3xl border border-red-400/20 bg-slate-900 p-7 text-center text-white shadow-2xl">
              <p className="text-base font-semibold">Não foi possível abrir o documento.</p>
              <p className="mt-2 text-sm text-slate-300">{error}</p>
            </div>
          </div>
        ) : !accessUrl ? (
          <div className="flex h-full items-center justify-center text-sm font-medium text-slate-200">
            Carregando documento com acesso seguro...
          </div>
        ) : isImage ? (
          <div className="h-full w-full overflow-auto p-4">
            <img
              src={accessUrl}
              alt={document.fileName || document.label}
              className="mx-auto min-h-full max-w-full object-contain"
            />
          </div>
        ) : (
          <iframe
            src={accessUrl}
            title={document.fileName || document.label}
            className="h-full w-full border-0 bg-white"
          />
        )}
      </section>
    </main>
  );
}
