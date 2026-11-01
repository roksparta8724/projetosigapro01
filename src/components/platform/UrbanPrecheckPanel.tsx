import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BrainCircuit, CheckCircle2, ClipboardCheck, FileClock, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listUrbanLegalEvidence, listUrbanPrecheckHistory, listUrbanRegulations, saveUrbanPrecheckRun,
  type UrbanPrecheckHistoryEntry,
} from "@/integrations/backend/urbanPrecheckClient";
import {
  URBAN_METRICS, evaluateUrbanPrecheck, filterUrbanPrecheckHistoryForContext, formatUrbanHistoryDate, normalizeUrbanCode, selectUrbanRegulation, summarizeUrbanPrecheckHistory,
  type UrbanMetric, type UrbanMeasurements, type UrbanRegulationVersion,
} from "@/lib/urbanPrecheck";
import { municipalCivilDateFromValue } from "@/lib/municipalCivilDate";
import {resolveUrbanLegalCoverage,type UrbanVerifiedLegalSource} from "@/lib/urbanLegalProof";
import type { ProcessRecord } from "@/lib/platform";
import {UrbanProjectReaderPanel} from "./UrbanProjectReaderPanel";
import type {ProjectMeasure} from "@/lib/urbanArchitecturalMeasures";

type Field = { value: string; evidence: string };
type Fields = Partial<Record<UrbanMetric, Field>>;

export function UrbanPrecheckPanel({
  process, municipalityId, readOnly,
}: { process: ProcessRecord; municipalityId: string; readOnly: boolean }) {
  const [versions, setVersions] = useState<UrbanRegulationVersion[]>([]);
  const [history, setHistory] = useState<UrbanPrecheckHistoryEntry[]>([]);
  const [legalEvidence,setLegalEvidence]=useState<UrbanVerifiedLegalSource[]|null>(null);
  const [legalAcknowledged,setLegalAcknowledged]=useState(false);
  const [conditionalDirectivesReviewed,setConditionalDirectivesReviewed]=useState(false);
  const [zone, setZone] = useState("");
  const [usage, setUsage] = useState(process.property.usage || "");
  const [asOf, setAsOf] = useState(() => municipalCivilDateFromValue(process.officializedAt));
  const [fields, setFields] = useState<Fields>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const idempotencyRef=useRef<{snapshot:string;id:string}|null>(null);

  useEffect(() => {
    let active = true;
    setZone("");
    setUsage(process.property.usage || "");
    setAsOf((process.officializedAt || new Date().toISOString()).slice(0, 10));
    setFields({});
    idempotencyRef.current=null;
    setVersions([]);
    setHistory([]);
    setLegalEvidence(null);
    setLegalAcknowledged(false);
    setConditionalDirectivesReviewed(false);
    setNotice("");
    setLoading(true);
    void Promise.all([
      listUrbanRegulations(municipalityId),
      listUrbanPrecheckHistory(process.id),
      listUrbanLegalEvidence(municipalityId),
    ]).then(([rules, past, legal]) => {
      if (active) { setVersions(rules); setHistory(past); setLegalEvidence(legal); }
    }).catch((error: unknown) => {
      if (active) setNotice("Normas ainda indisponíveis: " + String((error as Error)?.message || error));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [municipalityId, process.id, process.property.usage, process.officializedAt]);

  const regulation = useMemo(
    () => selectUrbanRegulation(versions, municipalityId, zone, usage, asOf),
    [versions, municipalityId, zone, usage, asOf],
  );

  const legalCoverage=useMemo(
    ()=>resolveUrbanLegalCoverage(regulation,legalEvidence,municipalityId,asOf),
    [regulation,legalEvidence,municipalityId,asOf],
  );
  const useProjectReading=(item:ProjectMeasure,source:{fileName:string;sha256:string})=>{
    if(readOnly||!regulation||!regulation.rules.some(r=>r.metric===item.metric))return;
    // Limit the evidence to the official writer's 500-char maximum.
    const evidence=`PDF: ${source.fileName} · SHA-256 ${source.sha256} · ${item.excerpt} · pág. ${item.pages.join(",")}`.slice(0,500);
    setFields(previous=>({...previous,[item.metric]:{value:String(item.value),evidence}}));
    setLegalAcknowledged(false);setConditionalDirectivesReviewed(false);
    setNotice("Medida declarada copiada com origem auditável. Verifique as normas antes de registrar qualquer análise.");
  };
  const setField = (metric: UrbanMetric, field: keyof Field, text: string) => {
    setFields((previous) => ({
      ...previous,
      [metric]: {
        value: previous[metric]?.value || "",
        evidence: previous[metric]?.evidence || "",
        [field]: text,
      },
    }));
  };

  const measurements = useMemo<UrbanMeasurements>(() => {
    const collected: UrbanMeasurements = {};
    if (!regulation) return collected;
    for (const rule of regulation.rules) {
      const input = fields[rule.metric];
      if (!input?.value.trim()) continue;
      const parsed = Number(input.value.trim().replace(",", "."));
      if (!Number.isFinite(parsed) || parsed < 0) continue;
      collected[rule.metric] = { value: parsed, evidence: input.evidence.trim() };
    }
    return collected;
  }, [fields, regulation]);

  const findings = useMemo(
    () => regulation ? evaluateUrbanPrecheck(regulation.rules, measurements) : [],
    [regulation, measurements],
  );
  const visibleHistory = useMemo(
    () => filterUrbanPrecheckHistoryForContext(history, municipalityId, process.id),
    [history, municipalityId, process.id],
  );
  const canSave = !!regulation && legalCoverage.status==="ready" && legalAcknowledged &&
    conditionalDirectivesReviewed && !readOnly && !saving && findings.some(
    (finding) => finding.status !== "missing_evidence"
  );

  const save = async () => {
    if (!regulation || readOnly || saving) return;
    if (legalCoverage.status!=="ready" || !legalAcknowledged || !conditionalDirectivesReviewed) {
      setNotice("Confira todas as fontes legais, o Quadro II, os parâmetros complementares e as exceções antes de registrar.");
      return;
    }
    const invalidEntered = regulation.rules.some((rule) => {
      const input = fields[rule.metric];
      if (!input?.value.trim() && !input?.evidence.trim()) return false;
      const parsed = Number(input.value.trim().replace(",", "."));
      return !input.value.trim() || !Number.isFinite(parsed) || parsed < 0 ||
        !input.evidence.trim() || input.evidence.trim().length < 3 ||
        (rule.metric === "floor_count" && !Number.isInteger(parsed));
    });
    if (invalidEntered) {
      setNotice("Corrija as leituras: valor válido e prancha/página de origem são obrigatórios.");
      return;
    }
    const complete: UrbanMeasurements = {};
    for (const finding of findings) {
      if (finding.status !== "missing_evidence") {
        complete[finding.metric] = measurements[finding.metric];
      }
    }
    if (!Object.keys(complete).length) {
      setNotice("Nenhum parâmetro comprovado por documento para registrar.");
      return;
    }
    setSaving(true);
    setNotice("");
    try {
      const legalReview={
        evidenceIds:legalCoverage.evidenceIds,
        documentScopeConfirmed:true,
        note:"Declaração humana: conferi a zona, o uso, a data, as evidências por índice, as condições do Quadro II, os parâmetros complementares e as exceções. Registro consultivo, sem aprovação.",
      };
      const snapshot=JSON.stringify({processId:process.id,municipalityId,
        versionId:regulation.id,referenceDate:asOf,measurements:complete,legalReview});
      const requestId=idempotencyRef.current?.snapshot===snapshot
        ? idempotencyRef.current.id : crypto.randomUUID();
      idempotencyRef.current={snapshot,id:requestId};
      await saveUrbanPrecheckRun(process.id, regulation.id, asOf, complete, requestId, legalReview);
      const updated = await listUrbanPrecheckHistory(process.id);
      setHistory(updated);
      setNotice("Pré-conferência registrada no histórico. Não altera a aprovação nem a ficha oficial.");
    } catch (error) {
      setNotice(String((error as Error)?.message || error));
    } finally { setSaving(false); }
  };

  return (
    <section data-sigapro-urban-precheck="true" className="my-5 min-w-0 overflow-hidden rounded-[26px] border border-sky-200 bg-white p-4 shadow-sm dark:border-sky-700 dark:bg-slate-950 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-950 dark:text-white">
            <BrainCircuit className="h-5 w-5 text-sky-700 dark:text-sky-300" />
            SIGAPRO IA — Pré-conferência urbanística
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Comparação técnica de medições informadas com limites oficialmente cadastrados.
            O resultado é consultivo e depende de validação do analista responsável.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          Nunca aprova automaticamente
        </span>
      </div>
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100">
        O leitor de PDFs agora identifica medidas textualmente declaradas e auxilia cálculos preliminares
        com áreas explicitamente indicadas. Ele não reconhece automaticamente geometria desenhada
        nem PDFs digitalizados sem texto: nesses casos, a leitura visual/OCR continua pendente.
        O resultado requer confirmação do analista e legislação municipal validada.
      </div>
      <div data-sigapro-urban-exceptions-gate="true"
        className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950 dark:border-amber-600 dark:bg-amber-950/30 dark:text-amber-100">
        Escopo parcial: esta calculadora NÃO verifica automaticamente C.A. mínimo e básico, lote mínimo,
        testada, gabarito em função da largura da via, usos condicionados, notas de rodapé,
        exceções, alterações legais e todas as disposições do Quadro II.
        Mesmo um índice numérico dentro do limite NÃO significa aprovação nem conformidade geral.
      </div>

      <UrbanProjectReaderPanel readOnly={readOnly}
        documents={process.documents}
        allowedMetrics={regulation?.rules.map(r=>r.metric)??[]}
        onConfirm={useProjectReading}/>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Zona do imóvel
          <Input className="mt-1" placeholder="Ex.: ZR1" value={zone} maxLength={40}
            onChange={(event) => {setZone(normalizeUrbanCode(event.target.value));setFields({});setLegalAcknowledged(false);setConditionalDirectivesReviewed(false);}} />
        </label>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Categoria de uso
          <Input className="mt-1" value={usage} maxLength={60} placeholder="Ex.: RESIDENCIAL"
            onChange={(event) => {setUsage(normalizeUrbanCode(event.target.value));setFields({});setLegalAcknowledged(false);setConditionalDirectivesReviewed(false);}} />
        </label>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Data de referência legal
          <Input className="mt-1" type="date" value={asOf}
            onChange={(event) => {setAsOf(event.target.value);setFields({});setLegalAcknowledged(false);setConditionalDirectivesReviewed(false);}} />
        </label>
      </div>

      {loading ? <p role="status" className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Consultando cadastro normativo municipal...</p> : null}
      {!loading && !regulation ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          <AlertTriangle className="mr-2 inline h-4 w-4 text-amber-600" />
          Não existe norma ativa correspondente a este município, zona, uso e data.
          Nenhuma verificação será simulada. Solicite o cadastro e a validação da legislação em Configurações.
        </div>
      ) : null}
      {regulation ? (
        <div className="mt-5">
          <div data-sigapro-urban-legal-coverage="true"
            className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-slate-950 dark:border-amber-700 dark:bg-amber-950/50 dark:text-white">
            <p className="text-sm font-extrabold">
              Fundamentação legal por índice: {legalCoverage.matched} de {legalCoverage.required} com fonte vinculada
            </p>
            <p className="mt-1 text-xs leading-5">
              {legalCoverage.status==="ready"
                ?"Referências verificadas encontradas para cada índice deste escopo. Confirme as páginas e a vigência antes de registrar."
                :legalCoverage.status==="incomplete_catalog"
                ?"O catálogo excede o limite da consulta; nenhuma conclusão de cobertura é permitida."
                :"Faltam fontes oficiais vinculadas à zona, ao uso, à métrica e à data informada. O cadastro numérico, sozinho, não comprova vigência."}
            </p>
            {legalCoverage.missing.length>0?<p className="mt-2 text-xs font-semibold">
              Índices sem fundamento vinculado: {legalCoverage.missing.map(key=>URBAN_METRICS.find(x=>x.key===key)?.label||key).join("; ")}
            </p>:null}
            {legalCoverage.status==="ready"?<label className="mt-3 flex items-start gap-2 text-xs font-semibold leading-5">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-sky-700"
                checked={legalAcknowledged} disabled={readOnly}
                onChange={event=>setLegalAcknowledged(event.target.checked)} />
              Conferi as páginas citadas e o escopo legal desta zona, uso e data.
              Esta declaração não aprova o projeto nem substitui o parecer técnico.
            </label>:null}
            {legalCoverage.status==="ready"?<label className="mt-3 flex items-start gap-2 text-xs font-semibold leading-5">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-sky-700"
                data-urban-conditional-directions-confirmation="true"
                checked={conditionalDirectivesReviewed} disabled={readOnly}
                onChange={event=>setConditionalDirectivesReviewed(event.target.checked)} />
              Conferi no documento oficial os itens ainda não calculados pelo SIGAPRO:
              Quadro II, permissões de uso, área e testada mínimas, gabarito especial,
              C.A. mínimo/básico, notas, exceções e eventuais alterações vigentes.
              Esta declaração é uma revisão humana e não uma avaliação automatizada.
            </label>:null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-700 dark:bg-sky-950/40">
            <p className="text-sm font-bold text-sky-950 dark:text-sky-100">
              Norma ativa: {regulation.zone_code} · {regulation.use_code} · Versão {regulation.version}
            </p>
            <span className="text-xs text-sky-800 dark:text-sky-200">Vigência desde {regulation.effective_from}</span>
          </div>
          <div className="mt-3 space-y-3">
            {regulation.rules.map((rule) => {
              const definition = URBAN_METRICS.find((metric) => metric.key === rule.metric)!;
              const result = findings.find((finding) => finding.metric === rule.metric);
              const status = result?.status || "missing_evidence";
              return (
                <div key={rule.metric} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-slate-950 dark:text-white">{definition.label}</p>
                    <span className={"rounded-full px-3 py-1 text-xs font-bold " + (
                      status === "attention" ? "bg-amber-100 text-amber-950 dark:bg-amber-900 dark:text-amber-50" :
                      status === "within_limit" ? "bg-emerald-100 text-emerald-950 dark:bg-emerald-900 dark:text-emerald-50" :
                      "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100"
                    )}>
                      {status === "attention" ? "Requer revisão" :
                        status === "within_limit" ? "Comparação numérica dentro do limite" : "Sem evidência"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                    Limite: {definition.direction === "minimum" ? "mínimo " : "máximo "}{rule.limit}{definition.unit ? " " + definition.unit : ""}
                    {" · "}{rule.reference}
                  </p>
                  {legalCoverage.sources[rule.metric]?<p data-sigapro-urban-cited-metric={rule.metric}
                    className="mt-2 rounded-lg border border-sky-200 bg-sky-50 p-2 text-xs leading-5 text-sky-950 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100">
                    Fonte catalogada: {legalCoverage.sources[rule.metric]!.documentTitle},
                    página {legalCoverage.sources[rule.metric]!.page}.
                    {" "}{legalCoverage.sources[rule.metric]!.excerpt}
                  </p>:<p data-sigapro-urban-missing-metric={rule.metric}
                    className="mt-2 text-xs font-semibold text-amber-800 dark:text-amber-200">
                    Fonte oficial por índice não vinculada — registro bloqueado.
                  </p>}
                  <div className="mt-3 grid gap-3 md:grid-cols-[minmax(100px,0.35fr)_minmax(220px,1fr)]">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Medida informada
                      <Input className="mt-1" type="text" inputMode="decimal" disabled={readOnly}
                        aria-label={"Medição: " + definition.label} placeholder={definition.unit || "valor"}
                        value={fields[rule.metric]?.value || ""}
                        onChange={(event) => setField(rule.metric, "value", event.target.value)} />
                    </label>
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Prancha, página ou memória de cálculo
                      <Input className="mt-1" disabled={readOnly} maxLength={500}
                        aria-label={"Evidência: " + definition.label}
                        placeholder="Ex.: Prancha 02, detalhe de implantação"
                        value={fields[rule.metric]?.evidence || ""}
                        onChange={(event) => setField(rule.metric, "evidence", event.target.value)} />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {findings.filter((x) => x.status === "attention").length} divergências · {" "}
              {findings.filter((x) => x.status === "within_limit").length} dentro dos limites informados · {" "}
              {findings.filter((x) => x.status === "missing_evidence").length} sem comprovação
            </p>
            <Button type="button" disabled={!canSave} onClick={() => void save()} className="rounded-xl bg-sky-700 text-white hover:bg-sky-800">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Registrar pré-conferência fundamentada
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-700">
        <h4 className="flex items-center gap-2 text-sm font-bold text-slate-950 dark:text-white">
          <FileClock className="h-4 w-4" /> Histórico de pré-conferências
        </h4>
        <div className="mt-2 space-y-2">
          {!visibleHistory.length ? <p className="text-xs text-slate-500 dark:text-slate-300">Nenhuma pré-conferência registrada.</p> : null}
          {visibleHistory.map((entry) => {
            const historicRules = versions.find((version) =>
              version.id === entry.regulation_version_id && version.municipality_id === municipalityId,
            );
            const summary = summarizeUrbanPrecheckHistory(historicRules?.rules ?? null, entry.measurements);
            const historicallyCited=Boolean(entry.legal_review?.document_scope_confirmed &&
              Array.isArray(entry.legal_review.evidence_ids) && entry.legal_review.evidence_ids.length>0);
            return (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <p className="text-xs text-slate-700 dark:text-slate-200">
                  <ClipboardCheck className="mr-1 inline h-4 w-4" />
                  {formatUrbanHistoryDate(entry.created_at)} · Versão {historicRules?.version || "arquivada"}
                </p>
                <p className="flex items-center gap-1 text-xs text-slate-700 dark:text-slate-200">
                  {summary.status === "within_limit" && historicallyCited ?
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" /> :
                    <AlertTriangle className="h-4 w-4 text-amber-600" />}
                  {summary.status === "unavailable"
                    ? "Norma histórica indisponível · sem avaliação"
                    : `${summary.alertCount} alertas · ${summary.missingCount} sem medida · ${historicallyCited?"Referências legais registradas":"Fundamentação não registrada"} · Consultivo`}
                </p>
              </div>
            );
          })}
        </div>
      </div>
      {notice ? <p role="status" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">{notice}</p> : null}
    </section>
  );
}
