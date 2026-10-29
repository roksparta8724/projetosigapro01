import { AlertTriangle, BookOpen, ClipboardList, FileCheck2, FileSearch, ShieldCheck } from "lucide-react";
import type { ProcessDocument } from "@/lib/platform";
import { inspectUrbanDossier } from "@/lib/urbanDossierReadiness";

export function UrbanDossierReadinessPanel({
  documents, hasApplicableRegulation, legalCatalogState, legalEvidenceCount,
}:{
  documents:readonly ProcessDocument[] | null | undefined;
  hasApplicableRegulation:boolean;
  legalCatalogState:"loading"|"failed"|"ready";
  legalEvidenceCount:number;
}) {
  const report=inspectUrbanDossier({
    documents,hasApplicableRegulation,legalCatalogState,legalEvidenceCount,
  });
  return <section data-urban-dossier-readiness="true" aria-label="Preparação documental para a pré-análise"
    className="mt-4 rounded-[20px] border border-sky-200 bg-slate-50 p-4 text-slate-900 shadow-sm dark:border-sky-700/60 dark:bg-slate-900 dark:text-white">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h4 className="flex items-center gap-2 text-sm font-extrabold">
          <ClipboardList className="h-4 w-4 text-sky-700 dark:text-sky-300"/>
          Preparação do dossiê para análise assistida
        </h4>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-700 dark:text-slate-300">
          Conferência dos registros e anexos disponíveis, sem declarar conformidade urbanística.
          Nenhum PDF é enviado à IA externa nesta etapa.
        </p>
      </div>
      <span className={report.completeForHumanReview
        ? "rounded-full border border-sky-300 bg-sky-100 px-3 py-1 text-xs font-bold text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100"
        : "rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"}>
        {report.completeForHumanReview?"Documentação básica disponível — conferir":"Conferências pendentes"}
      </span>
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300"><FileCheck2 className="h-4 w-4"/> Documentos obrigatórios</p>
        <p className="mt-1 text-lg font-bold tabular-nums">{report.requiredAvailable} / {report.requiredTotal}</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300"><FileSearch className="h-4 w-4"/> PDFs com original</p>
        <p className="mt-1 text-lg font-bold tabular-nums">{report.pdfWithOriginal}</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300"><BookOpen className="h-4 w-4"/> Referências legais catalogadas</p>
        <p className="mt-1 text-lg font-bold tabular-nums">{report.legalEvidenceCount}</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300"><ShieldCheck className="h-4 w-4"/> Revisões humanas pendentes</p>
        <p className="mt-1 text-lg font-bold tabular-nums">{report.pendingHumanReview}</p>
      </div>
    </div>
    {report.issues.length ? (
      <div className="mt-4">
        <p className="text-xs font-bold text-slate-900 dark:text-white">Pontos para o analista conferir</p>
        <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto" aria-label="Pendências documentais e legais">
          {report.issues.map((issue,i)=><li key={issue.code+"-"+(issue.documentId||i)}
            className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-xs leading-5 text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
            <AlertTriangle className={issue.severity==="attention"
              ? "mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
              : "mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300"}/>
            <span>{issue.message}</span>
          </li>)}
        </ul>
      </div>
    ) : null}
    <p className="mt-3 text-[11px] leading-5 text-slate-600 dark:text-slate-300">
      Leitura técnica: PDF com texto selecionável até 20 MB e 24 páginas por pré-leitura.
      PDF escaneado exige OCR local disponível ou dupla transcrição conferida.
      DWG/DXF/IFC/RVT não são interpretados nativamente.
      Um documento presente não é automaticamente válido nem aprova a obra.
    </p>
  </section>;
}
