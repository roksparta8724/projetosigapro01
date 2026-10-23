import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ExternalLink, FileWarning, FileUp, ShieldCheck, X } from "lucide-react";
import { validateQaLocalPdf } from "@/lib/qaLocalPdfPreview";
import { verifyQaExistingDocumentCopy } from "@/lib/qaExistingDocumentRecovery";
import { uploadFile } from "@/integrations/r2/client";

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
  processRoute, documentId, objectKey, expectedFileHash, expectedFileSizeBytes, onRecovered,
}: {
  processRoute: string;
  documentId: string;
  objectKey?: string;
  expectedFileHash?: string;
  expectedFileSizeBytes?: number;
  onRecovered?: () => Promise<void> | void;
}) {
  const officialUrl = officialDocumentHref(processRoute, documentId);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const activeObjectUrl = useRef<string | null>(null);
  const selection = useRef(0);
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);
  const [error, setError] = useState("");
  const [reading, setReading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [saveConsent, setSaveConsent] = useState(false);
  const [savingCopy, setSavingCopy] = useState(false);
  const [retryingRead, setRetryingRead] = useState(false);
  const [storedCopy, setStoredCopy] = useState(false);
  const [verifiedCopy, setVerifiedCopy] = useState(false);
  const [copyCheckMessage, setCopyCheckMessage] = useState("");

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
    setSelectedFile(null);
    setSaveConsent(false);
    setStoredCopy(false);
    setVerifiedCopy(false);
    setCopyCheckMessage("");
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
    setVerifiedCopy(false);
    setCopyCheckMessage("");
    try {
      await validateQaLocalPdf(file);
      let validCopy = false;
      let checkMessage = "Pré-visualização não verificada. Esta cópia não pode ser vinculada ao anexo cadastrado.";
      if (objectKey && /^[a-f0-9]{64}$/i.test(String(expectedFileHash || ""))) {
        try {
          await verifyQaExistingDocumentCopy(file, {
            fileHash: expectedFileHash,
            fileSizeBytes: expectedFileSizeBytes,
          });
          validCopy = true;
          checkMessage = "Integridade confirmada: tamanho e SHA-256 coincidem com o documento cadastrado.";
        } catch (reason) {
          checkMessage = (reason instanceof Error ? reason.message : "Cópia diferente do anexo registrado.") +
            " É possível consultar o PDF local, mas não armazená-lo como anexo oficial no QA.";
        }
      } else {
        checkMessage = "O cadastro não possui SHA-256 verificável. Visualização temporária permitida, importação permanente bloqueada.";
      }
      if (request !== selection.current) return;
      setVerifiedCopy(validCopy);
      setCopyCheckMessage(checkMessage);
      if (activeObjectUrl.current) URL.revokeObjectURL(activeObjectUrl.current);
      const url = URL.createObjectURL(file);
      activeObjectUrl.current = url;
      setPreview({ url, name: file.name });
      setSelectedFile(file);
      setSaveConsent(false);
      setStoredCopy(false);
    } catch (reason) {
      if (request === selection.current) {
        setError(reason instanceof Error ? reason.message : "Não foi possível verificar o PDF.");
      }
    } finally {
      if (request === selection.current) setReading(false);
    }
  };

  const retryQaRead = async () => {
    if (!onRecovered || retryingRead) return;
    setRetryingRead(true);
    setError("");
    try {
      await onRecovered();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "O PDF ainda não está disponível no armazenamento QA.");
    } finally {
      setRetryingRead(false);
    }
  };

  const saveVerifiedCopyInQa = async () => {
    if (!selectedFile || !saveConsent || !objectKey || !verifiedCopy || savingCopy ||
        import.meta.env.VITE_SIGAPRO_NEON_ISOLATED !== "true") return;
    setSavingCopy(true);
    setError("");
    try {
      await verifyQaExistingDocumentCopy(selectedFile, {
        fileHash: expectedFileHash,
        fileSizeBytes: expectedFileSizeBytes,
      });
      // Explicitly authorized import into the isolated QA local file store,
      // never the production R2 bucket. No process metadata is rewritten.
      await uploadFile({ bucket: "process-documents", objectKey, file: selectedFile });
      setStoredCopy(true);
      if (onRecovered) await onRecovered();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível guardar a cópia validada no QA.");
    } finally {
      setSavingCopy(false);
    }
  };

  return (
    <div data-qa-document-missing="true"
      className={`mx-auto max-h-full w-full overflow-y-auto rounded-[22px] border border-sky-500/40 bg-[linear-gradient(160deg,#152d46,#0b1e31)] p-5 text-center text-slate-100 shadow-[0_26px_70px_rgba(0,0,0,0.35)] ${preview ? "max-w-5xl" : "max-w-xl"}`}>
      {preview ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3 text-left">
            <div className="min-w-0">
              <p className="text-base font-bold text-white">Consulta local do PDF</p>
              <p className="mt-1 break-words text-xs text-slate-300">{preview.name}</p>
            </div>
            <button type="button" onClick={closePreview}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-sky-500/50 bg-slate-900 px-3 py-2 text-xs font-bold text-slate-100 hover:bg-slate-800">
              <X className="h-4 w-4" aria-hidden="true" /> Fechar consulta
            </button>
          </div>
          <p data-qa-copy-integrity="true" role="status"
            className="mt-3 rounded-xl border border-amber-500/40 bg-amber-950/35 p-3 text-left text-xs leading-5 text-amber-100">
            {copyCheckMessage} A pré-visualização ocorre somente neste navegador e não aprova,
            despacha nem altera o processo oficial.
          </p>
          {verifiedCopy && objectKey && /^[a-f0-9]{64}$/i.test(String(expectedFileHash || "")) ? (
            <div className="mt-3 rounded-xl border border-sky-500/40 bg-slate-900/70 p-3 text-left">
              <p className="text-xs font-bold text-sky-100">
                Guardar esta cópia no armazenamento isolado de homologação
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-200">
                Somente se o tamanho e o SHA-256 coincidirem com o registro.
                O arquivo passará a abrir aqui nas próximas consultas, sem modificar o documento oficial.
              </p>
              <label className="mt-2 flex items-start gap-2 text-xs text-slate-100">
                <input type="checkbox" checked={saveConsent}
                  disabled={savingCopy || storedCopy}
                  onChange={(event) => setSaveConsent(event.target.checked)}
                  className="mt-0.5" />
                Confirmo que tenho autorização para armazenar esta cópia no ambiente local de testes.
              </label>
              <button type="button" disabled={!saveConsent || savingCopy || storedCopy}
                onClick={() => void saveVerifiedCopyInQa()}
                className="mt-3 min-h-10 rounded-xl bg-sky-800 px-4 py-2 text-xs font-bold text-white hover:bg-sky-900 disabled:opacity-60">
                {storedCopy ? "Cópia validada e armazenada no QA" :
                 savingCopy ? "Conferindo SHA-256 e armazenando..." : "Guardar cópia verificada no QA"}
              </button>
              {storedCopy ? (
                <p role="status" className="mt-2 text-xs text-emerald-300">
                  Cópia conferida e armazenada. O arquivo já pode ser aberto pelo sistema local.
                </p>
              ) : null}
            </div>
          ) : null}
          {error ? <p role="alert" className="mt-2 rounded-xl bg-rose-950/50 p-3 text-xs text-rose-100">{error}</p> : null}
          <iframe
            data-qa-local-pdf-preview="true"
            src={preview.url + "#toolbar=0&navpanes=0&view=FitH"}
            title={`Pré-visualização local de ${preview.name}`}
            className="mt-3 h-[min(66vh,780px)] min-h-[360px] w-full rounded-xl border border-slate-200 bg-[#2b3037]"
          />
        </>
      ) : (
        <>
          <FileWarning className="mx-auto h-9 w-9 text-amber-300" aria-hidden="true" />
          <h2 className="mt-3 text-base font-bold text-white">
            Documento ainda não disponível nesta homologação
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-200">
            O cadastro do anexo está presente, mas o PDF não foi localizado no armazenamento
            isolado do QA. Isso não significa que tenha sido apagado do SIGAPRO oficial.
          </p>
          <p className="mt-3 text-xs leading-5 text-slate-300">
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
          {onRecovered && objectKey ? (
            <button type="button" disabled={retryingRead}
              onClick={() => void retryQaRead()}
              className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-500/50 bg-slate-900 px-4 py-2 text-sm font-bold text-sky-100 hover:bg-slate-800 disabled:opacity-60">
              {retryingRead ? "Conferindo armazenamento QA..." : "Verificar novamente no QA"}
            </button>
          ) : null}
          {error ? (
            <p role="alert" className="mt-3 rounded-xl bg-rose-950/60 p-3 text-xs font-medium text-rose-100">{error}</p>
          ) : null}
        </>
      )}

      {officialUrl ? (
        <a href={officialUrl} target="_blank" rel="noopener noreferrer"
          className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-500/40 bg-slate-900 px-4 py-2 text-sm font-bold text-sky-100 transition hover:bg-slate-800">
          <ExternalLink className="h-4 w-4" /> Abrir documento no SIGAPRO oficial
        </a>
      ) : null}
      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-300">
        <ShieldCheck className="h-4 w-4" /> Armazenamento e autenticação do QA separados do sistema oficial
      </p>
    </div>
  );
}
