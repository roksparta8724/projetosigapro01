import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BrainCircuit, CheckCircle2, ClipboardCheck, FileClock, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listUrbanPrecheckHistory, listUrbanRegulations, listUrbanVerifiedEvidenceScopes, saveUrbanPrecheckRun,
  type UrbanPrecheckHistoryEntry,
} from "@/integrations/backend/urbanPrecheckClient";
import {
  URBAN_METRICS, evaluateUrbanPrecheck, filterUrbanPrecheckHistoryForContext, formatUrbanHistoryDate, normalizeUrbanCode, selectUrbanRegulation, summarizeUrbanPrecheckHistory,
  type UrbanMetric, type UrbanMeasurements, type UrbanRegulationVersion,
} from "@/lib/urbanPrecheck";
import { municipalCivilDateFromValue } from "@/lib/municipalCivilDate";
import { evidenceCoversUrbanRule, type UrbanLegalEvidenceScope } from "@/lib/urbanEvidenceCoverage";
import { Textarea } from "@/components/ui/textarea";
import { ArchitecturalPdfAiPanel } from "@/components/platform/ArchitecturalPdfAiPanel";
import type { ProcessRecord } from "@/lib/platform";

type Field = { value: string; evidence: string };
type Fields = Partial<Record<UrbanMetric, Field>>;

export function UrbanPrecheckPanel({
  process, municipalityId, readOnly,
}: { process: ProcessRecord; municipalityId: string; readOnly: boolean }) {
  const [versions, setVersions] = useState<UrbanRegulationVersion[]>([]);
  useEffect(() => {
    if (window.location.hash !== "#sigapro-urban-precheck") return;
    const raf = window.requestAnimationFrame(() => {
      document.getElementById("sigapro-urban-precheck")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(raf);
  }, [process.id]);

  const [history, setHistory] = useState<UrbanPrecheckHistoryEntry[]>([]);
  const [legalEvidence, setLegalEvidence] = useState<UrbanLegalEvidenceScope[]>([]);
  const [legalEvidenceError, setLegalEvidenceError] = useState("");
  const [selectedScopeByMetric, setSelectedScopeByMetric] =
    useState<Partial<Record<UrbanMetric, string>>>({});
  const [legalReviewNote, setLegalReviewNote] = useState("");
  const [legalReviewConfirmed, setLegalReviewConfirmed] = useState(false);
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
    setLegalEvidence([]);
    setLegalEvidenceError("");
    setSelectedScopeByMetric({});
    setLegalReviewNote("");
    setLegalReviewConfirmed(false);
    idempotencyRef.current=null;
    setVersions([]);
    setHistory([]);
    setNotice("");
    setLoading(true);
    void Promise.all([
      listUrbanRegulations(municipalityId),
      listUrbanPrecheckHistory(process.id),
      listUrbanVerifiedEvidenceScopes(municipalityId),
    ]).then(([rules, past, evidence]) => {
      if (active) {
        setVersions(rules);
        setHistory(past);
        setLegalEvidence(evidence);
      }
    }).catch((error: unknown) => {
      if (active) {
        setLegalEvidenceError(String((error as Error)?.message || error));
        setNotice("Normas ou evidências indisponíveis: " + String((error as Error)?.message || error));
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [municipalityId, process.id, process.property.usage, process.officializedAt]);

  const regulation = useMemo(
    () => selectUrbanRegulation(versions, municipalityId, zone, usage, asOf),
    [versions, municipalityId, zone, usage, asOf],
  );

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
  const scopedLegalEvidence = useMemo(() =>
    regulation ? Object.fromEntries(regulation.rules.map((rule) => [
      rule.metric, legalEvidence.filter((item) =>
        evidenceCoversUrbanRule(regulation, rule.metric, item)),
    ])) as Partial<Record<UrbanMetric, UrbanLegalEvidenceScope[]>> : {},
    [regulation, legalEvidence],
  );
  const selectedEvidenceIds = regulation?.rules.map((rule) =>
    selectedScopeByMetric[rule.metric] || "") ?? [];
  const legalScopesReady = !!regulation && selectedEvidenceIds.length <= 50 &&
    regulation.rules.every((rule) =>
      (scopedLegalEvidence[rule.metric] || []).some((item) =>
        item.id === selectedScopeByMetric[rule.metric])) &&
    new Set(selectedEvidenceIds).size === selectedEvidenceIds.length;

  const visibleHistory = useMemo(
    () => filterUrbanPrecheckHistoryForContext(history, municipalityId, process.id),
    [history, municipalityId, process.id],
  );
  const canSave = !!regulation && !readOnly && !saving && !loading &&
    !legalEvidenceError && legalScopesReady && legalReviewConfirmed &&
    legalReviewNote.trim().length >= 20 && legalReviewNote.trim().length <= 1200 &&
    findings.some((finding) => finding.status !== "missing_evidence");

  const save = async () => {
    if (!regulation || readOnly || saving) return;
    if (!canSave) {
      setNotice("Selecione a evidência legal para cada índice, confirme a revisão e informe uma justificativa antes de registrar.");
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
      const legalReview = {
        evidenceIds: selectedEvidenceIds,
        note: legalReviewNote.trim(),
        documentScopeConfirmed: true,
      };
      const snapshot=JSON.stringify({
        processId: process.id, municipalityId, versionId: regulation.id,
        referenceDate: asOf, measurements: complete, legalReview,
      });
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
    <section id="sigapro-urban-precheck" data-sigapro-urban-precheck="true" className="my-5 min-w-0 scroll-mt-24 overflow-hidden rounded-[26px] border border-sky-200 bg-white p-4 shadow-sm dark:border-sky-700 dark:bg-slate-950 md:p-6">
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
        Para utilizar: selecione a planta mais recente, confirme o envio ao provedor e clique em
        "Ler projeto arquitetônico com IA". Depois confira cada medida antes de aplicá-la.
        A leitura visual é experimental na homologação e depende de provedor habilitado.
        Verifique todas as cotas no PDF antes de utilizar as sugestões; a legislação municipal
        também precisa estar validada. Nunca há aprovação automática.
      </div>

      {readOnly ? (
        <p role="note" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950 dark:border-amber-500/40 dark:bg-slate-900 dark:text-amber-200">
          Esta tela está em modo de consulta. A leitura por IA só pode ser iniciada pelo
          analista com permissão de edição após assumir ou receber a análise do processo.
        </p>
      ) : null}

      <ArchitecturalPdfAiPanel
        process={process} readOnly={readOnly}
        activeMetrics={regulation?.rules.map((rule) => rule.metric) ?? []}
        onApply={(reviewed) => {
          setFields((current) => ({...current, ...reviewed}));
          setLegalReviewConfirmed(false);
          idempotencyRef.current = null;
          setNotice("Medidas conferidas copiadas. Confira os resultados e as evidências legais antes de registrar.");
        }}
      />
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Zona do imóvel
          <Input className="mt-1" placeholder="Ex.: ZR1" value={zone} maxLength={40}
            onChange={(event) => setZone(normalizeUrbanCode(event.target.value))} />
        </label>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Categoria de uso
          <Input className="mt-1" value={usage} maxLength={60} placeholder="Ex.: RESIDENCIAL"
            onChange={(event) => setUsage(normalizeUrbanCode(event.target.value))} />
        </label>
        <label className="text-xs font-bold text-slate-700 dark:text-slate-200">Data de referência legal
          <Input className="mt-1" type="date" value={asOf}
            onChange={(event) => setAsOf(event.target.value)} />
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
                        status === "within_limit" ? "Dentro do limite informado" : "Sem evidência"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                    Limite: {definition.direction === "minimum" ? "mínimo " : "máximo "}{rule.limit}{definition.unit ? " " + definition.unit : ""}
                    {" · "}{rule.reference}
                  </p>
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
          <div data-urban-precheck-legal-review="true"
            className="mt-4 min-w-0 space-y-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-slate-900 dark:border-sky-700 dark:bg-slate-900 dark:text-white">
            <h4 className="text-sm font-extrabold text-sky-950 dark:text-sky-100">
              Revisão legal obrigatória — provas individuais de cada índice
            </h4>
            <p className="text-xs leading-5 text-slate-700 dark:text-slate-200">
              Selecione, para cada índice da versão ativa, uma fonte oficialmente conferida
              com município, zona, uso, página, hash e vigência correspondentes.
              A pré-conferência não substitui a avaliação do projeto original.
            </p>
            {legalEvidenceError ? <p role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-950 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-100">
              Falha na consulta legal: {legalEvidenceError}. Gravação bloqueada.
            </p> : null}
            <div className="grid min-w-0 gap-2 lg:grid-cols-2">
              {regulation.rules.map((rule) => {
                const options = scopedLegalEvidence[rule.metric] || [];
                const label = URBAN_METRICS.find((item) => item.key === rule.metric)?.label || rule.metric;
                return <label key={rule.metric} className="block min-w-0 rounded-xl border border-sky-200 bg-white p-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                  <span className="mb-2 block font-bold">{label}</span>
                  <select data-urban-precheck-legal-evidence={rule.metric}
                    value={selectedScopeByMetric[rule.metric] || ""}
                    disabled={readOnly || !options.length}
                    onChange={(event) => {
                      setSelectedScopeByMetric((before) => ({...before,[rule.metric]:event.target.value}));
                      setLegalReviewConfirmed(false);
                    }}
                    className="min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
                    <option value="">Selecione a fonte legal conferida</option>
                    {options.map((item) => <option key={item.id} value={item.id}>
                      {item.document_title} · pág. {item.page_number} · {item.excerpt.slice(0, 65)}
                    </option>)}
                  </select>
                  {!options.length ? <span className="mt-2 block font-semibold text-amber-800 dark:text-amber-200">
                    Sem fonte legal verificável para este índice. Cadastre a evidência na legislação.
                  </span> : null}
                </label>;
              })}
            </div>
            <label className="block text-xs font-semibold text-slate-900 dark:text-white">
              Justificativa e condições excepcionais revisadas (20 a 1200 caracteres)
              <Textarea data-urban-precheck-legal-note="true"
                value={legalReviewNote} maxLength={1200} rows={3}
                disabled={readOnly}
                onChange={(event) => {
                  setLegalReviewNote(event.target.value);
                  setLegalReviewConfirmed(false);
                }}
                placeholder="Indique a lei, a versão, as observações, a zona, o uso e como as cotas foram conferidas."
                className="mt-2 bg-white text-slate-900 dark:bg-slate-950 dark:text-white" />
            </label>
            <label className="flex items-start gap-3 text-xs font-semibold text-slate-800 dark:text-slate-100">
              <input type="checkbox" data-urban-precheck-legal-confirmed="true"
                checked={legalReviewConfirmed} disabled={readOnly || !legalScopesReady}
                onChange={(event) => setLegalReviewConfirmed(event.target.checked)} />
              Conferi pessoalmente a correspondência entre as fontes, a legislação aplicável,
              as exceções, o projeto arquitetônico e todas as evidências selecionadas.
              Sei que este registro é consultivo, sem aprovação automática.
            </label>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              {selectedEvidenceIds.filter(Boolean).length}/{regulation.rules.length} fontes selecionadas.
              {" "}{!legalScopesReady ? "Conferência jurídica incompleta — registro bloqueado." :
                "Fontes vinculadas; falta confirmação humana e justificativa."}
            </p>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {findings.filter((x) => x.status === "attention").length} divergências · {" "}
              {findings.filter((x) => x.status === "within_limit").length} dentro dos limites informados · {" "}
              {findings.filter((x) => x.status === "missing_evidence").length} sem comprovação
            </p>
            <Button type="button" disabled={!canSave} onClick={() => void save()} className="rounded-xl bg-sky-700 text-white hover:bg-sky-800">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Registrar pré-conferência
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
            const legalAttested = Boolean(
              entry.legal_review?.document_scope_confirmed &&
              Array.isArray(entry.legal_review.evidence_ids) &&
              entry.legal_review.evidence_ids.length > 0 &&
              typeof entry.legal_review.note === "string" &&
              entry.legal_review.note.trim().length >= 20,
            );
            const summary = summarizeUrbanPrecheckHistory(historicRules?.rules ?? null, entry.measurements);
            return (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <p className="text-xs text-slate-700 dark:text-slate-200">
                  <ClipboardCheck className="mr-1 inline h-4 w-4" />
                  {formatUrbanHistoryDate(entry.created_at)} · Versão {historicRules?.version || "arquivada"}
                </p>
                <p className="flex items-center gap-1 text-xs text-slate-700 dark:text-slate-200">
                  {summary.status === "within_limit" && legalAttested ?
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" /> :
                    <AlertTriangle className="h-4 w-4 text-amber-600" />}
                  {summary.status === "unavailable"
                    ? "Norma histórica indisponível · sem avaliação"
                    : !legalAttested
                    ? "Registro legado sem comprovação jurídica completa · não homologado"
                    : `${summary.alertCount} alertas · ${summary.missingCount} sem comprovação · Registro consultivo`}
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
