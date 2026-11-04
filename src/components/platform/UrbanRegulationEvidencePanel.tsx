import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, CheckCircle2, FileWarning, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  listUrbanMatrixBatches, listUrbanMatrixReadingAudit,
  listUrbanVerifiedEvidenceScopes, saveUrbanScopedLegalEvidence,
  type UrbanMatrixBatchSummary,
} from "@/integrations/backend/urbanPrecheckClient";
import { countCoveredUrbanMetrics, type UrbanLegalEvidenceScope } from "@/lib/urbanEvidenceCoverage";
import { URBAN_METRICS, type UrbanRegulationVersion } from "@/lib/urbanPrecheck";
import { getLegislationOpenUrl } from "@/integrations/r2/client";

/**
 * Municipal-only legal attestation. A saved PDF or a reviewed OCR line is not
 * evidence until the Admin confirms a specific literal excerpt, page and
 * applicable index using the official Neon RPC.
 */
export function UrbanRegulationEvidencePanel({
  version, municipalityId, canEdit, sourceRef, sourceFileName, onActivate,
}: {
  version: UrbanRegulationVersion; municipalityId: string; canEdit: boolean;
  sourceRef?: string; sourceFileName?: string; onActivate: () => void;
}) {
  const [sources, setSources] = useState<UrbanMatrixBatchSummary[]>([]);
  const [evidences, setEvidences] = useState<UrbanLegalEvidenceScope[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [docId, setDocId] = useState("");
  const [metric, setMetric] = useState("");
  const [page, setPage] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [method, setMethod] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setSources([]); setEvidences([]); setError(""); setNotice("");
    setLoading(true);
    void Promise.all([
      listUrbanMatrixBatches(municipalityId),
      listUrbanMatrixReadingAudit(municipalityId),
      listUrbanVerifiedEvidenceScopes(municipalityId),
    ]).then(([all, audit, scopes]) => {
      if (!alive) return;
      setSources(all.filter((batch) =>
        /^[a-f0-9]{64}$/i.test(batch.document_sha256) &&
        !audit.batch_events.some((event) =>
          event.batch_id === batch.id && event.action === "archive")));
      setEvidences(scopes);
    }).catch((reason: unknown) => {
      if (alive) setError("A consulta das evidências falhou. Nenhuma norma pode ser ativada: " +
        String((reason as Error)?.message || reason));
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [municipalityId, version.id, tick]);

  const source = sources.find((item) => item.id === docId);
  const verified = useMemo(() =>
    countCoveredUrbanMetrics(version, evidences), [version, evidences]);
  const complete = version.rules.length > 0 && verified === version.rules.length;
  const pdfHref = source && sourceRef && sourceFileName === source.document_title
    ? getLegislationOpenUrl(sourceRef) : "";
  const valid = Boolean(
    canEdit && source && version.municipality_id === municipalityId &&
    version.status === "draft" && version.rules.some((item) => item.metric === metric) &&
    Number.isInteger(Number(page)) && Number(page) > 0 && Number(page) <= 10000 &&
    excerpt.trim().length >= 15 && excerpt.trim().length <= 500 &&
    (method === "text_layer_verified" || method === "visual_double_transcription") &&
    confirmed && !saving,
  );

  async function save() {
    if (!valid || !source) return;
    setError(""); setNotice(""); setSaving(true);
    try {
      await saveUrbanScopedLegalEvidence({
        versionId: version.id, municipalityId, documentTitle: source.document_title,
        documentSha256: source.document_sha256, metric, pageNumber: Number(page),
        excerpt: excerpt.trim(), verificationMethod: method as
          "text_layer_verified" | "visual_double_transcription",
        effectiveFrom: version.effective_from,
      });
      const next = await listUrbanVerifiedEvidenceScopes(municipalityId);
      if (!next.some((entry) =>
        entry.document_sha256 === source.document_sha256 &&
        entry.metric === metric && entry.page_number === Number(page) &&
        entry.excerpt === excerpt.trim() &&
        entry.zone_code.toUpperCase() === version.zone_code.toUpperCase() &&
        entry.use_code.toUpperCase() === version.use_code.toUpperCase())) {
        throw new Error("O banco não confirmou a leitura posterior da evidência; não considere esta regra validada.");
      }
      setEvidences(next);
      setNotice("Evidência vinculada e confirmada no banco. A versão permanece em rascunho até a ativação humana.");
      setMetric(""); setPage(""); setExcerpt(""); setMethod(""); setConfirmed(false);
    } catch (cause) {
      setError(String((cause as Error)?.message || cause));
    } finally { setSaving(false); }
  }

  return (
    <details data-urban-regulation-evidence="true"
      className="w-full min-w-0 rounded-xl border border-sky-200 bg-white p-3 dark:border-sky-700 dark:bg-slate-950">
      <summary className="cursor-pointer text-xs font-extrabold text-sky-950 dark:text-sky-200">
        Evidências legais individuais — {verified}/{version.rules.length} índice(s) com fonte válida
      </summary>
      <div className="mt-3 space-y-3 text-xs leading-5 text-slate-700 dark:text-slate-200">
        <p>O Admin da Prefeitura deve conferir cada artigo, página e trecho no PDF original.
          A conferência de OCR não comprova vigência, e nenhum índice ativa a IA automaticamente.</p>
        {loading ? <p role="status" className="flex gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Consultando evidências...</p> : null}
        {error ? <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-900 dark:bg-slate-900 dark:text-rose-200">{error}</p> : null}
        <div className="grid gap-2 sm:grid-cols-2">
          {version.rules.map((rule) => {
            const covered = evidences.some((entry) =>
              countCoveredUrbanMetrics({ ...version, rules: [rule] }, [entry]) === 1);
            return <div key={rule.metric} className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900">
              {covered ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" /> :
                <FileWarning className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />}
              <span className="min-w-0 break-words font-semibold">
                {URBAN_METRICS.find((item) => item.key === rule.metric)?.label || rule.metric}
                {" — "}{covered ? "fonte vinculada" : "falta evidência"}
              </span>
            </div>;
          })}
        </div>
        {!sources.length && !loading ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 font-semibold text-amber-950">
            Nenhum lote de PDF com SHA-256 está disponível. Importe o documento no acervo jurídico
            para que os trechos possam ser conferidos e vinculados.
          </p>
        ) : null}
        {canEdit && version.status === "draft" && !loading ? (
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="flex items-center gap-2 font-extrabold text-slate-950 dark:text-white">
              <BookOpenCheck className="h-4 w-4" /> Registrar conferência documental
            </p>
            <label className="block font-semibold">Documento de origem com hash verificado no lote
              <select value={docId} onChange={(e) => {setDocId(e.target.value);setConfirmed(false);}}
                className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 dark:border-slate-600 dark:bg-slate-950 dark:text-white">
                <option value="">Selecione a fonte oficial</option>
                {sources.map((item) => <option key={item.id} value={item.id}>
                  {item.document_title} — SHA {item.document_sha256.slice(0,12)}
                </option>)}
              </select>
            </label>
            {source ? <p className="break-all text-[11px]">SHA-256 do lote: {source.document_sha256}</p> : null}
            {pdfHref ? <a className="font-bold text-sky-800 underline dark:text-sky-300"
              target="_blank" rel="noreferrer" href={pdfHref}>Abrir PDF oficial para conferência</a> : null}
            <label className="block font-semibold">Índice urbanístico
              <select value={metric} onChange={(e)=>{setMetric(e.target.value);setConfirmed(false);}}
                className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 dark:border-slate-600 dark:bg-slate-950 dark:text-white">
                <option value="">Selecione o parâmetro</option>
                {version.rules.map((rule) => <option key={rule.metric} value={rule.metric}>
                  {URBAN_METRICS.find((item)=>item.key===rule.metric)?.label || rule.metric}
                </option>)}
              </select>
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="font-semibold">Página do PDF
                <Input className="mt-1 bg-white dark:bg-slate-950" type="number" min={1} max={10000}
                  value={page} onChange={(e)=>{setPage(e.target.value);setConfirmed(false);}}/>
              </label>
              <label className="font-semibold">Método de conferência
                <select value={method} onChange={(e)=>{setMethod(e.target.value);setConfirmed(false);}}
                  className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 dark:border-slate-600 dark:bg-slate-950 dark:text-white">
                  <option value="">Selecione</option>
                  <option value="text_layer_verified">Texto digital conferido com o original</option>
                  <option value="visual_double_transcription">Dupla conferência visual do original</option>
                </select>
              </label>
            </div>
            <label className="block font-semibold">Trecho literal do PDF (mín. 15 caracteres)
              <Textarea value={excerpt} onChange={(e)=>{setExcerpt(e.target.value);setConfirmed(false);}}
                className="mt-1 bg-white text-slate-950 dark:bg-slate-950 dark:text-white"
                maxLength={500} rows={3}
                placeholder="Transcreva exatamente o índice e sua ressalva conforme o PDF." />
            </label>
            <label className="flex items-start gap-2 rounded-lg border border-sky-200 bg-white p-3 font-semibold text-slate-900 dark:border-sky-700 dark:bg-slate-950 dark:text-white">
              <input type="checkbox" checked={confirmed} onChange={(e)=>setConfirmed(e.target.checked)} />
              Confirmei pessoalmente a página, o valor e as condições de aplicação
              desta regra ao município, zona e uso informados.
            </label>
            <Button type="button" disabled={!valid} onClick={() => void save()}
              className="sig-force-dark-action min-h-10 rounded-xl bg-slate-950 !text-white">
              {saving ? "Gravando..." : "Salvar evidência no Neon"}
            </Button>
          </div>
        ) : null}
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <span className="font-semibold">{complete ? "Todos os índices possuem evidências vinculadas." :
            "Falta conferir cada índice antes da ativação."}</span>
          {canEdit && version.status === "draft" ? (
            <Button type="button" variant="outline" disabled={!complete || loading || saving || !!error}
              onClick={onActivate}>Validar e ativar versão conferida</Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" disabled={loading || saving}
            onClick={()=>setTick((value)=>value+1)}>
            <RefreshCcw className="mr-2 h-4 w-4" /> Atualizar evidências
          </Button>
        </div>
        {notice ? <p role="status" className="rounded-lg border border-sky-200 bg-sky-50 p-2 text-sky-950">{notice}</p> : null}
      </div>
    </details>
  );
}
