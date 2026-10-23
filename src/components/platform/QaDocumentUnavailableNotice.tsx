import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ExternalLink, FileWarning, FileUp, ShieldCheck, X } from "lucide-react";
import { validateQaLocalPdf } from "@/lib/qaLocalPdfPreview";

export const QA_DOCUMENT_MISSING_MESSAGE = "Documento de homologação não encontrado no armazenamento isolado.";

export function isQaDocumentMissingError(error: string): boolean {
  return typeof error === "string" &&
    (error.includes(QA_DOCUMENT_MISSING_MESSAGE) ||
     error.includes("Anexo QA não encontrado."));
}

export function officialDocumentHref(processRoute: string, documentId: string): string {
  if (!processRoute.startsWith("/") ||
      processRoute.startsWith("//") ||
      processRoute.includes("..") ||
      !/^[a-z0-9-]{12,64}$/i.test(documentId)) {
    return "";
  }
  return "https://sigapromunicipal.com.br" +
    processRoute.replace(/\/$/, "") +
    "/documentos/" + encodeURIComponent(documentId) + "/visualizar";
}

/**
 * QA-only fallback. A user-selected PDF is displayed from an ephemeral blob:
 * it is not the official attachment, cannot prove document identity and never
 * triggers a file upload, an object-store write, or a process review action.
 */
export function QaDocumentUnavailableNotice({
  processRoute, documentId,
}: { processRoute: string; documentId: string }) {
  const officialUrl = officialDocumentHref(processRoute, documentId);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const activeObjectUrl = useRef<string | null>(null);
  const selection = useRef(0);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);

  useEffect(() => () => {
    selection.current += 1;
    if (activeObjectUrl.current) URL.revokeObjectURL(activeObjectUrl.current);
    activeObjectUrl.current = null;
  }, []);

  const closePreview = () => {
    selection.current += 1;
    if (activeObjectUrl.current) URL.revokeObjectURL(activeObjectUrl.current);
    activeObjectUrl.current = null;
    setPreview(null);
    setError("");
    setReading(false);
  };

  const selectLocalFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const request = ++selection.current;
    setReading(true);
    setError("");
    try {
      await validateQaLocalPdf(file);
      if (request !== selection.current) return;
      if (activeObjectUrl.current) URL.revokeObjectURL(activeObjectUrl.current);
      const url = URL.createObjectURL(file);
      activeObjectUrl.current = url;
      setPreview({ url, name: file.name });
    } catch (reason) {
      if (request === selection.current) {
        setError(reason instanceof Error ? reason.message : "Não foi possível verificar o PDF.");
      }
    } finally {
      if (request === selection.current) setReading(false);
    }
  };

  return (
    <div data-qa-document-missing="true"
      className={`mx-auto max-h-full w-full overflow-y-auto rounded-[22px] border border-amber-200 bg-white p-5 text-center shadow-xl ${preview ? "max-w-5xl" : "max-w-xl"}`}>
      {preview ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3 text-left">
            <div className="min-w-0">
              <p className="text-base font-bold text-slate-950">Consulta local do PDF</p>
              <p className="mt-1 break-words text-xs text-slate-600">{preview.name}</p>
            </div>
            <button type="button" onClick={closePreview}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800 hover:bg-slate-100">
              <X className="h-4 w-4" aria-hidden="true" /> Fechar consulta
            </button>
          </div>
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-xs leading-5 text-amber-950">
            Cópia escolhida por você, exibida somente neste navegador. Não foi comparada com o
            arquivo oficial, não substitui o anexo do processo e não autoriza aprovação,
            despacho ou envio de exigências.
          </p>
          <iframe
            data-qa-local-pdf-preview="true"
            src={preview.url + "#toolbar=0&navpanes=0&view=FitH"}
            title={`Pré-visualização local de ${preview.name}`}
            className="mt-3 h-[min(66vh,780px)] min-h-[360px] w-full rounded-xl border border-slate-200 bg-[#2b3037]"
          />
        </>
      ) : (
        <>
          <FileWarning className="mx-auto h-9 w-9 text-amber-600" aria-hidden="true" />
          <h2 className="mt-3 text-base font-bold text-slate-950">
            Documento ainda não disponível nesta homologação
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            O cadastro do anexo está presente, mas o PDF não foi localizado no armazenamento
            isolado do QA. Isso não significa que tenha sido apagado do SIGAPRO oficial.
          </p>
          <p className="mt-3 text-xs leading-5 text-slate-600">
            Você pode escolher uma cópia PDF do seu computador para visualizar aqui, sem
            transferi-la para o banco ou para o R2. Essa cópia não substitui o anexo oficial.
          </p>
          <input ref={fileInput} type="file" accept="application/pdf,.pdf"
            className="sr-only" aria-label="Selecionar PDF do computador para consulta local"
            onChange={(event) => void selectLocalFile(event)} />
          <button type="button" disabled={reading}
            onClick={() => fileInput.current?.click()}
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-800 px-4 py-2 text-sm font-bold text-white hover:bg-sky-900 disabled:opacity-50">
            <FileUp className="h-4 w-4" aria-hidden="true" />
            {reading ? "Verificando PDF..." : "Abrir PDF do computador aqui"}
          </button>
          {error ? (
            <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-800">{error}</p>
          ) : null}
        </>
      )}

      {officialUrl ? (
        <a href={officialUrl} target="_blank" rel="noopener noreferrer"
          className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-4 py-2 text-sm font-bold text-sky-800 transition hover:bg-sky-50">
          <ExternalLink className="h-4 w-4" /> Abrir documento no SIGAPRO oficial
        </a>
      ) : null}
      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-800">
        <ShieldCheck className="h-4 w-4" /> Armazenamento e autenticação do QA separados do sistema oficial
      </p>
    </div>
  );
}
