import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, FileText, Link2, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ProcessRecord } from "@/lib/platform";
import { buildProcessPath } from "@/lib/platform";
import { buildUrbanTextEvidence, isUploadedPdfDocument, suggestUrbanTextSignals } from "@/lib/urbanTextEvidence";
import type { UrbanMetric } from "@/lib/urbanPrecheck";

type Props = {
  process: ProcessRecord;
  readOnly: boolean;
  allowedMetrics: Array<{ key: UrbanMetric; label: string }>;
  onUseEvidence: (metric: UrbanMetric, evidence: string) => void;
};

/**
 * No PDF bytes are sent to an LLM. In this phase the reviewer opens the
 * process's existing protected document viewer and records a verified excerpt.
 * This is a traceability desk, not PDF parsing/OCR or proof of compliance.
 */
export function UrbanDocumentEvidenceDesk({ process, readOnly, allowedMetrics, onUseEvidence }: Props) {
  const pdfs = useMemo(
    () => process.documents.filter(isUploadedPdfDocument),
    [process.documents],
  );
  const [documentId, setDocumentId] = useState("");
  const [pageText, setPageText] = useState("1");
  const [excerpt, setExcerpt] = useState("");
  const [metric, setMetric] = useState<UrbanMetric | "">("");
  const [notice, setNotice] = useState("");

  const selected = pdfs.find((doc) => doc.id === documentId) || null;
  const signals = useMemo(() => suggestUrbanTextSignals(excerpt), [excerpt]);
  const allowed = new Set(allowedMetrics.map((item) => item.key));
  const knownSignals = signals.filter((item) => allowed.has(item.metric));

  useEffect(() => {
    setDocumentId("");
    setPageText("1");
    setExcerpt("");
    setMetric("");
    setNotice("");
  }, [process.id]);

  const addEvidence = () => {
    if (!selected || !metric || !allowed.has(metric) || readOnly) {
      setNotice("Selecione o PDF, o parâmetro normativo e a página antes de registrar a origem.");
      return;
    }
    try {
      const evidence = buildUrbanTextEvidence({
        documentId: selected.id,
        fileName: selected.fileName || selected.label,
        documentVersion: selected.version || 1,
        page: Number(pageText),
        excerpt,
      });
      onUseEvidence(metric, evidence);
      setNotice("Origem da medida preenchida. Confirme manualmente o valor no campo do parâmetro e registre a pré-conferência quando pronto.");
    } catch (error) {
      setNotice(String((error as Error)?.message || error));
    }
  };

  return (
    <section data-urban-document-evidence="true"
      className="mt-4 overflow-hidden rounded-[22px] border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="rounded-xl border border-sky-200 bg-sky-50 p-2 dark:border-sky-700 dark:bg-sky-950">
            <BookOpenCheck className="h-5 w-5 text-sky-800 dark:text-sky-200" />
          </span>
          <div>
            <h4 className="text-sm font-extrabold text-slate-950 dark:text-white">
              Evidências dos PDFs do processo
            </h4>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600 dark:text-slate-300">
              Abra a planta no visualizador oficial, confira a página e transcreva um trecho curto
              que permita localizar a medida. O documento continua protegido pelo acesso do processo.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
          Verificação humana
        </span>
      </div>
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
        <ShieldAlert className="mr-1 inline h-4 w-4" />
        Nesta fase a ferramenta ainda não extrai texto ou cotas dos PDFs automaticamente.
        Os termos destacados são apenas sugestões de classificação do trecho digitado,
        não interpretação definitiva da legislação nem aprovação técnica.
      </div>
      {pdfs.length === 0 ? (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-950 dark:text-slate-300">
          Nenhum PDF enviado foi encontrado neste processo.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(200px,1.7fr)_minmax(100px,0.35fr)]">
          <label className="min-w-0 text-xs font-bold text-slate-800 dark:text-slate-100">
            Documento PDF apresentado
            <select aria-label="Documento PDF apresentado" className="mt-1 block h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
              value={documentId} onChange={(event) => { setDocumentId(event.target.value); setNotice(""); }}>
              <option value="">Selecione o PDF para consultar</option>
              {pdfs.map((doc) => (
                <option key={doc.id} value={doc.id}>{doc.fileName || doc.label} · versão {doc.version || 1}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-800 dark:text-slate-100">
            Página conferida
            <Input aria-label="Página conferida" className="mt-1" type="number" min={1} max={10000}
              value={pageText} onChange={(event) => setPageText(event.target.value)} />
          </label>
        </div>
      )}

      {selected ? (
        <Link to={buildProcessPath(process) + "/documentos/" + encodeURIComponent(selected.id) + "/visualizar"}
          target="_blank" rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-900 underline-offset-2 hover:underline dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100">
          <FileText className="h-4 w-4" />
          Abrir PDF original no visualizador do SIGAPRO
        </Link>
      ) : null}
      <label className="mt-4 block text-xs font-bold text-slate-800 dark:text-slate-100">
        Trecho conferido na página original
        <Textarea className="mt-1 min-h-24 text-sm" value={excerpt} maxLength={280}
          disabled={readOnly || !selected} placeholder="Transcreva uma cota, item da prancha ou trecho normativo após conferir o PDF original..."
          onChange={(event) => setExcerpt(event.target.value)} />
      </label>
      {knownSignals.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-600 dark:text-slate-300">Assuntos encontrados no trecho:</span>
          {knownSignals.map((s) => (
            <button type="button" key={s.metric} disabled={readOnly}
              onClick={() => setMetric(s.metric)}
              className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-900 hover:bg-sky-100 disabled:opacity-60 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100">
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <label className="min-w-[210px] flex-1 text-xs font-bold text-slate-800 dark:text-slate-100">
          Campo que receberá a referência documental
          <select aria-label="Parâmetro ao qual anexar a referência" className="mt-1 block h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
            value={metric} disabled={readOnly} onChange={(event) => setMetric(event.target.value as UrbanMetric | "")}>
            <option value="">Selecione um parâmetro da norma</option>
            {allowedMetrics.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}
          </select>
        </label>
        <Button type="button" onClick={addEvidence} disabled={!selected || readOnly || !metric || excerpt.trim().length < 10}
          className="rounded-xl bg-sky-700 text-white hover:bg-sky-800">
          <Link2 className="mr-2 h-4 w-4" />
          Vincular origem ao parâmetro
        </Button>
      </div>
      {notice ? (
        <p role="status" className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
