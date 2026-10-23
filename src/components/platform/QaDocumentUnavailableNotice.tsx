import { ExternalLink, FileWarning, ShieldCheck } from "lucide-react";

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

/** QA-only guidance. Never copies files, accesses production R2 or reuses signed URLs. */
export function QaDocumentUnavailableNotice({
  processRoute, documentId,
}: { processRoute: string; documentId: string }) {
  const officialUrl = officialDocumentHref(processRoute, documentId);
  return (
    <div data-qa-document-missing="true" className="mx-auto w-full max-w-xl rounded-[22px] border border-amber-200 bg-white p-6 text-center shadow-xl">
      <FileWarning className="mx-auto h-9 w-9 text-amber-600" aria-hidden="true" />
      <h2 className="mt-3 text-base font-bold text-slate-950">
        Documento ainda não disponível nesta homologação
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-700">
        O cadastro do anexo está presente, mas o arquivo não foi localizado no armazenamento
        isolado do QA. Isso não significa que o documento tenha sido apagado do sistema oficial.
      </p>
      <p className="mt-3 text-xs leading-5 text-slate-600">
        Para conferir o original, abra o SIGAPRO oficial em uma nova aba.
        Será necessário estar autenticado e ter autorização para este processo.
        Nenhum documento será copiado automaticamente para a homologação.
      </p>
      {officialUrl ? (
        <a href={officialUrl} target="_blank" rel="noopener noreferrer"
          className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-800 px-4 py-2 text-sm font-bold text-white transition hover:bg-sky-900">
          <ExternalLink className="h-4 w-4" /> Abrir no SIGAPRO oficial
        </a>
      ) : null}
      <p className="mt-4 flex items-center justify-center gap-1.5 text-xs font-semibold text-emerald-800">
        <ShieldCheck className="h-4 w-4" /> Dados e documentos oficiais permanecem separados do QA
      </p>
    </div>
  );
}
