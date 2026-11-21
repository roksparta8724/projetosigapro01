import { BookOpenCheck, ExternalLink, FileWarning, ShieldAlert } from "lucide-react";
import { getMunicipalOfficialUrbanSources } from "@/lib/urbanOfficialLegalSources";
import { CampoLimpoQuadroIOriginalPanel } from "@/components/platform/CampoLimpoQuadroIOriginalPanel";

const kindLabel = {
  base: "Base normativa",
  alteracao: "Alteração da lei",
  revogacao: "Revogação expressa",
  historica_revogada: "Lei revogada — histórico",
  restauracao_vigencia: "Restabelecimento de vigência",
  procedimento_especial: "Procedimento especial",
  proposta_sem_vigencia: "Sem validade normativa",
} as const;

/** Public-source references, not database legal evidence and never AI-ready rules. */
export function UrbanOfficialLegalSourcesPanel({
  municipalityId,
}: { municipalityId: string | null | undefined }) {
  const documents = getMunicipalOfficialUrbanSources(municipalityId);
  if (!documents.length) return null;
  const pdfCount = documents.filter((item) => Boolean(item.pdfUrl)).length;

  return (
    <details data-sigapro-urban-official-sources="true"
      className="mt-5 min-w-0 overflow-hidden rounded-2xl border border-sky-200 bg-white shadow-sm dark:border-sky-700 dark:bg-slate-950">
      <summary className="cursor-pointer select-none px-4 py-4 text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:text-white md:px-5">
        <span className="flex flex-wrap items-start justify-between gap-2">
          <span className="flex min-w-0 items-start gap-2">
            <BookOpenCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-700 dark:text-sky-300" />
            <span className="min-w-0">
              <strong className="block text-sm font-extrabold">Fontes oficiais para leitura — Campo Limpo Paulista</strong>
              <span className="mt-1 block text-xs leading-5 text-slate-600 dark:text-slate-300">
                {pdfCount} fontes com acesso ao PDF oficial · LC 507/2017 revoga LC 473/2014 · minuta de 2026 ainda sem vigência
              </span>
            </span>
          </span>
          <span className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-950">
            Conferência jurídica pendente
          </span>
        </span>
      </summary>
      <div className="border-t border-slate-200 p-4 dark:border-slate-800 md:p-5">
        <div className="min-w-0 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
          <ShieldAlert className="mr-1 inline h-4 w-4" />
          Estes são links externos para PDFs publicados pelos órgãos oficiais.
          O catálogo NÃO transfere os arquivos para o R2, não extrai os quadros para o Neon
          e não libera parâmetros para análise por IA. Para isso é obrigatório importar
          o documento no acervo legal da prefeitura, comprovar sua integridade e
          conferir artigo, página, vigência, zona e exceções.
        </div>
        <div className="mt-3 grid min-w-0 gap-2 lg:grid-cols-2">
          {documents.map((item) => (
            <article key={item.id} data-urban-law-source={item.id}
              className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <strong className="min-w-0 flex-1 text-sm leading-5 text-slate-950 dark:text-white">
                  {item.title}
                </strong>
                <span className={item.kind === "proposta_sem_vigencia" || item.kind === "historica_revogada"
                  ? "shrink-0 rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-900"
                  : item.kind === "procedimento_especial"
                    ? "shrink-0 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-950"
                    : "shrink-0 rounded-md bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-900"}>
                  {kindLabel[item.kind]}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-700 dark:text-slate-200">
                {item.scopeNote}
              </p>
              <p className="mt-1 text-xs leading-5 font-medium text-slate-600 dark:text-slate-300">
                {item.readingNote}
              </p>
              <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                {item.documentLabel}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {item.pdfUrl ? (
                  <a href={item.pdfUrl} target="_blank" rel="noopener noreferrer"
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-900 bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Abrir PDF oficial
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-800">
                    <FileWarning className="h-4 w-4" /> Não é lei vigente
                  </span>
                )}
                <a href={item.officialPageUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:border-sky-300 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">
                  Conferir publicação
                </a>
              </div>
            </article>
          ))}
        </div>
        <CampoLimpoQuadroIOriginalPanel />
        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-950">
          <strong>Critério de homologação:</strong> aprovação de obra nova exige norma consolidada,
          mapa oficial, unidade correta e evidência por índice. Direito real de laje e
          regularização extraordinária só se aplicam quando a modalidade e os requisitos do
          processo forem comprovados. Minutas, OCR duvidoso e regras fictícias de QA ficam bloqueados.
        </div>
      </div>
    </details>
  );
}
