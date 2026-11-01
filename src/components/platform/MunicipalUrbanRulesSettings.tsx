import { useEffect, useState } from "react";
import { BookOpenCheck, CheckCircle2, Loader2, Save, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { activateUrbanRegulation, listUrbanRegulations, saveUrbanRegulationDraft } from "@/integrations/backend/urbanPrecheckClient";
import { URBAN_METRICS, normalizeUrbanCode, type UrbanMetric, type UrbanRegulationVersion, type UrbanRule } from "@/lib/urbanPrecheck";
import { municipalCivilDate } from "@/lib/municipalCivilDate";
import { UrbanLegalMatrixImporter } from "./UrbanLegalMatrixImporter";
import type { UrbanLegalSourceContext } from "@/lib/urbanLegalEvidenceRegistration";
import { proposeUrbanRulesFromPdf } from "@/lib/urbanLegalDraftFromPdf";
import {assessUrbanDraftReadiness} from "@/lib/urbanDraftReadiness";
import { UrbanLegalEvidenceCatalogPanel } from "./UrbanLegalEvidenceCatalogPanel";

type EditableValue = { limit: string; reference: string };
type DraftInputs = Partial<Record<UrbanMetric, EditableValue>>;

export function MunicipalUrbanRulesSettings({
  municipalityId, canEdit,
}: { municipalityId: string; canEdit: boolean }) {
  const [versions, setVersions] = useState<UrbanRegulationVersion[]>([]);
  const [zone, setZone] = useState("");
  const [usage, setUsage] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(() => municipalCivilDate());
  const [draft, setDraft] = useState<DraftInputs>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [legalSourceContext,setLegalSourceContext]=useState<UrbanLegalSourceContext|null>(null);
  const [manualEditorOpen,setManualEditorOpen]=useState(false);
  const [draftFromPdfCount,setDraftFromPdfCount]=useState(0);

  useEffect(() => {
    let active = true;
    setVersions([]);
    setDraft({});
    setZone("");
    setUsage("");
    setLegalSourceContext(null);
    setDraftFromPdfCount(0);setManualEditorOpen(false);
    setNotice("");
    if (!municipalityId) return;
    setLoading(true);
    void listUrbanRegulations(municipalityId)
      .then((list) => { if (active) setVersions(list); })
      .catch((error: unknown) => { if (active) setNotice(String((error as Error)?.message || error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [municipalityId]);

  const reload = async () => {
    const updated = await listUrbanRegulations(municipalityId);
    setVersions(updated);
  };
  const updateRule = (metric: UrbanMetric, field: keyof EditableValue, text: string) => {
    setDraft((previous) => ({
      ...previous, [metric]: { limit: previous[metric]?.limit || "",
        reference: previous[metric]?.reference || "", [field]: text },
    }));
  };
  const draftReadiness=assessUrbanDraftReadiness({zone,usage,effectiveFrom,draft});
  const save = async () => {
    if (!canEdit || !municipalityId || busy) return;
    if(!draftReadiness.canSave){
      setNotice("Ainda não é possível salvar: "+draftReadiness.reasons.join(" · "));
      return;
    }
    const rules: UrbanRule[] = [];
    for (const definition of URBAN_METRICS) {
      const entry = draft[definition.key];
      if (!entry?.limit.trim() && !entry?.reference.trim()) continue;
      const parsed = Number((entry?.limit || "").replace(",", "."));
      if (!entry?.limit.trim() || !Number.isFinite(parsed) || !entry.reference.trim()) {
        setNotice("Revise " + definition.label + ": valor e artigo legal são obrigatórios.");
        return;
      }
      rules.push({ metric: definition.key, limit: parsed, reference: entry.reference.trim() });
    }
    if (!zone.trim() || !usage.trim() || !rules.length) {
      setNotice("Informe zona, categoria de uso e ao menos um parâmetro legal.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      await saveUrbanRegulationDraft(municipalityId, zone, usage, effectiveFrom, rules);
      await reload();
      setNotice("Nova versão registrada como RASCUNHO. Os campos permanecem preenchidos para conferência; nada foi ativado.");
    } catch (error) {
      setNotice(String((error as Error)?.message || error));
    } finally { setBusy(false); }
  };
  const prepareDraftFromPdf = (context:UrbanLegalSourceContext) => {
    if(!canEdit||busy||!municipalityId||context!==legalSourceContext)return;
    const proposed=proposeUrbanRulesFromPdf(context);
    if(!proposed.length){
      setNotice("Nenhum índice numérico simples e inequívoco foi localizado nesta linha. Confira no PDF e use o cadastro manual somente com fonte legal.");
      return;
    }
    const hasEdits=Boolean(zone.trim()||usage.trim()||
      Object.values(draft).some(item=>Boolean(item?.limit?.trim()||item?.reference?.trim())));
    if(hasEdits&&!window.confirm("Substituir os campos não salvos pelos índices numéricos extraídos desta linha do PDF? Nada será gravado nem ativado."))return;
    const next:DraftInputs={};
    for(const item of proposed){
      // Crucial: no automatically invented article/reference.
      next[item.metric]={limit:item.limit,reference:""};
    }
    setZone(normalizeUrbanCode(context.zone));setUsage(normalizeUrbanCode(context.usage));
    setDraft(next);setDraftFromPdfCount(proposed.length);
    // A PDF's date is not the legislation's current verified effective date.
    setEffectiveFrom("");setManualEditorOpen(true);
    setNotice(proposed.length+" valor(es) numérico(s) pré-preenchido(s) como proposta. Preencha a vigência e as referências oficiais por índice; nenhum rascunho foi salvo e nenhuma norma foi ativada.");
    window.requestAnimationFrame(()=>document.getElementById("urban-manual-rule-editor")?.scrollIntoView({block:"start",behavior:"smooth"}));
  };
  const isSimulation=(item:UrbanRegulationVersion)=>
    /^(?:QA[-_]|TEST[-_])/i.test(item.zone_code)||/^(?:QA[-_]|TEST[-_])/i.test(item.use_code);
  const continueReview = (item: UrbanRegulationVersion) => {
    if (!canEdit || busy || loading || !municipalityId || item.municipality_id !== municipalityId || item.status !== "draft") return;
    const hasCurrentEdits = Boolean(zone.trim() || usage.trim() ||
      Object.values(draft).some((entry) => Boolean(entry?.limit.trim() || entry?.reference.trim())));
    if (hasCurrentEdits && !window.confirm(
      "Reabrir este rascunho substituirá os campos atualmente preenchidos. Deseja continuar?"
    )) return;
    const restored: DraftInputs = {};
    for (const rule of item.rules) {
      if (!URBAN_METRICS.some((metric) => metric.key === rule.metric)) continue;
      restored[rule.metric] = { limit: String(rule.limit), reference: rule.reference };
    }
    setZone(item.zone_code);
    setUsage(item.use_code);
    setEffectiveFrom(item.effective_from.slice(0, 10));
    setDraft(restored);
    setNotice("Rascunho da versão " + item.version + " recuperado do banco desta Prefeitura para nova conferência. Nenhuma regra foi ativada.");
  };
  const activate = async (id: string) => {
    if (!canEdit || busy || !window.confirm(
      "Confirma a lei oficialmente vigente, suas alterações, as condicionantes do Quadro II e a fonte individual de CADA índice? O banco recusará a ativação se faltarem evidências. A ativação valerá somente nesta zona e uso."
    )) return;
    setBusy(true);
    setNotice("");
    try {
      await activateUrbanRegulation(id);
      await reload();
      setNotice("Norma ativada com sucesso para o escopo municipal selecionado.");
    } catch (error) {
      setNotice(String((error as Error)?.message || error));
    } finally { setBusy(false); }
  };

  return (
    <section data-urban-rules-settings="true" className="min-w-0 rounded-[28px] border border-sky-200 bg-white p-4 shadow-sm dark:border-sky-700 dark:bg-slate-950 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-950 dark:text-white">
            <BookOpenCheck className="h-5 w-5 text-sky-700 dark:text-sky-300" />
            SIGAPRO IA — Regras urbanísticas da Prefeitura
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Cadastre normas por zona e tipo de uso com artigo legal. Cada atualização gera nova versão;
            apenas normas ativadas entram na pré-conferência técnica.
          </p>
        </div>
        <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-900 dark:border-sky-600 dark:bg-sky-950 dark:text-sky-100">
          Conferência humana obrigatória
        </span>
      </div>
      <p data-urban-admin-legal-hint="true"
        className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold leading-6 text-sky-950 dark:border-sky-700 dark:bg-slate-900 dark:text-sky-100">
        Use o PDF oficial e confira os valores por zona e uso. A leitura automática não confirma
        a vigência da lei nem ativa parâmetros.
      </p>

      <details data-urban-official-law-guidance="true"
        className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
        <summary className="cursor-pointer text-sm font-extrabold text-sky-900 dark:text-sky-100">
          Como conferir o documento e a vigência da lei
        </summary>
        <p className="mt-2 text-sm leading-6">
          Identifique a <strong>zona real</strong> no mapa vigente, confira a categoria de uso e
          consulte o quadro oficial de índices urbanísticos dessa combinação.
          Registre lei, artigo, quadro, página e exceções aplicáveis.
        </p>
        <p className="mt-2 text-xs font-semibold leading-5">
          Não use valores de exemplos, minutas de revisão ou propostas não promulgadas.
          Se o parâmetro não foi confirmado, deixe o campo sem preencher e não ative a norma.
          Confira alterações e vigência com o setor técnico responsável.
        </p>
      </details>
      {canEdit && municipalityId ? <UrbanLegalMatrixImporter municipalityId={municipalityId} canEdit={canEdit}
          onSaved={reload} onSourceContextChange={setLegalSourceContext}
          onPrepareDraftFromReading={()=>{
            if(legalSourceContext)prepareDraftFromPdf(legalSourceContext);
            else setNotice("Analise e selecione uma linha completa do PDF antes de preparar o rascunho.");
          }}/> : null}

      {canEdit && municipalityId ? (
        <details id="urban-manual-rule-editor" data-urban-manual-rule-editor="true"
          open={manualEditorOpen}
          onToggle={event=>setManualEditorOpen(event.currentTarget.open)}
          className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <summary className="cursor-pointer text-base font-extrabold text-sky-900 dark:text-sky-100">
            {draftFromPdfCount>0
              ?"Revisar os índices sugeridos pelo PDF — proposta não salva"
              :"Cadastro manual de regras urbanísticas — uso excepcional"}
          </summary>
          <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
            {draftFromPdfCount>0
              ?"Confira os índices sugeridos contra a página original e preencha referências e vigência. Nenhum dado foi salvo ou ativado."
              :"Abra somente para registrar manualmente valores já conferidos na legislação oficial. Nenhum dado é ativado ao salvar o rascunho."}
          </p>
          {draftFromPdfCount>0?<p data-urban-draft-from-pdf="true"
            className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-bold leading-6 text-amber-950">
            {draftFromPdfCount} índice(s) numérico(s) trazidos da camada textual da página {legalSourceContext?.physicalPage}.
            São sugestões NÃO validadas: confirme cada número, informe a vigência e preencha
            artigo e condições legais de cada regra. C.A. mínimo/básico, lote, testada, gabarito,
            Quadro II e exceções continuam fora do cálculo automático.
          </p>:null}
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Código da zona
              <Input aria-label="Código da zona urbanística" className="mt-1" value={zone} maxLength={40} placeholder="Ex.: ZR1"
                onChange={(event) => setZone(normalizeUrbanCode(event.target.value))} />
            </label>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Categoria de uso
              <Input aria-label="Categoria de uso" className="mt-1" value={usage} maxLength={60} placeholder="Ex.: RESIDENCIAL"
                onChange={(event) => setUsage(normalizeUrbanCode(event.target.value))} />
            </label>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
              Vigência a partir de
              <Input aria-label="Início de vigência" className="mt-1" type="date" value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)} />
            </label>
          </div>
          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
            <div className="grid grid-cols-1 gap-2 bg-slate-100 p-3 text-xs font-bold text-slate-700 dark:bg-slate-900 dark:text-slate-200 md:grid-cols-[minmax(170px,1fr)_minmax(100px,0.45fr)_minmax(210px,1.6fr)]">
              <span>Parâmetro</span><span>Limite legal</span><span>Lei, artigo e condição aplicável</span>
            </div>
            {URBAN_METRICS.map((metric) => (
              <div key={metric.key} className="grid gap-2 border-t border-slate-200 p-3 dark:border-slate-700 md:grid-cols-[minmax(170px,1fr)_minmax(100px,0.45fr)_minmax(210px,1.6fr)] md:items-center">
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {metric.label} <span className="text-xs text-slate-500 dark:text-slate-400">({metric.direction === "minimum" ? "mín." : "máx."}{metric.unit ? ", " + metric.unit : ""})</span>
                </span>
                <Input type="text" inputMode="decimal" aria-label={"Limite legal: " + metric.label}
                  placeholder="Não informado" value={draft[metric.key]?.limit || ""}
                  onChange={(event) => updateRule(metric.key, "limit", event.target.value)} />
                <Input aria-label={"Referência legal: " + metric.label} placeholder="Lei, artigo, Quadro I e condição oficialmente conferidos"
                  maxLength={500} value={draft[metric.key]?.reference || ""}
                  onChange={(event) => updateRule(metric.key, "reference", event.target.value)} />
              </div>
            ))}
          </div>
          <div data-urban-draft-readiness="true" role="status" aria-live="polite"
            className={draftReadiness.canSave
              ?"mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold leading-5 text-emerald-950"
              :"mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950"}>
            {draftReadiness.canSave
              ?"Campos obrigatórios para o rascunho preenchidos. Ainda é necessário conferir a fundamentação jurídica."
              :"Pendências antes de salvar: "+draftReadiness.reasons.join("; ")+
                ". Os valores sugeridos continuam apenas nesta sessão."}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              data-sigapro-urban-rules-save="true"
              aria-label="Salvar nova versão como rascunho"
              aria-busy={busy}
              disabled={busy || loading || !draftReadiness.canSave}
              onClick={() => void save()}
              className="sig-force-dark-action sig-urban-rules-save-button inline-flex min-h-11 w-full max-w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 sm:w-auto"
            >
              {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" /> :
                <Save aria-hidden="true" className="h-4 w-4 shrink-0" />}
              <span data-sigapro-urban-rules-save-label="true" className="whitespace-normal text-center font-bold leading-5 text-white">
                Salvar nova versão como rascunho
              </span>
            </button>
          </div>
        </details>
      ) : null}

      <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-700">
        <h4 className="text-sm font-bold text-slate-950 dark:text-white">Versões cadastradas neste município</h4>
        <p className="mt-1 text-xs leading-5 text-slate-700 dark:text-slate-300">Já salvou um rascunho em outro link? Use "Reabrir rascunho" abaixo para recuperar os campos registrados nesta Prefeitura, sem ativar normas.</p>
        {loading ? <p role="status" className="mt-3 text-sm text-slate-500">Carregando normas oficiais...</p> : null}
        {!loading && versions.length === 0 ? <p className="mt-3 text-sm text-slate-500 dark:text-slate-300">
          Não há regras cadastradas. A análise automática ficará indisponível até a ativação de uma versão válida.
        </p> : null}
        <div className="mt-3 grid gap-2">
          {versions.map((item) => (
            <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="min-w-0 text-sm text-slate-950 dark:text-slate-100">
                <p className="font-bold">{item.zone_code} · {item.use_code} · Versão {item.version}</p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  Data informada: {item.effective_from} · {item.rules.length} parâmetro(s) ·
                  {" "}{item.status === "active" ? "Ativa no banco" : item.status === "draft" ? "Rascunho" : "Substituída"}
                </p>
                {isSimulation(item)?<p data-urban-qa-test-version="true"
                  className="mt-1 text-xs font-extrabold text-amber-900 dark:text-amber-200">
                  REGISTRO DE TESTE QA — não representa legislação municipal homologada
                </p>:null}
              </div>
              <div className="flex items-center gap-2">
                {item.status === "active" && !isSimulation(item) ?
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-label="Versão ativa no banco, não aprovação jurídica" /> : null}
                {item.status === "draft" && canEdit ? (
                  <>
                    <Button type="button" variant="outline" disabled={busy || loading}
                      onClick={() => continueReview(item)}>Reabrir rascunho</Button>
                    <Button type="button" variant="outline" disabled={busy || loading}
                      onClick={() => void activate(item.id)}>Validar e ativar</Button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
      {municipalityId ? <UrbanLegalEvidenceCatalogPanel
        municipalityId={municipalityId} canEdit={canEdit} versions={versions}
        sourceContext={legalSourceContext}
        onPrepareDraft={prepareDraftFromPdf}/> : null}
      {notice ? <p role="status" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">{notice}</p> : null}
    </section>
  );
}
