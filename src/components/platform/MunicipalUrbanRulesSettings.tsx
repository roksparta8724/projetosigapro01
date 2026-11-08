import { useEffect, useRef, useState } from "react";
import { BookOpenCheck, CheckCircle2, Loader2, Save, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { activateUrbanRegulation, listUrbanRegulations, saveUrbanRegulationDraft } from "@/integrations/backend/urbanPrecheckClient";
import { UrbanLegalMatrixReviewPanel } from "@/components/platform/UrbanLegalMatrixReviewPanel";
import { UrbanQuadroIIWorkspacePanel } from "@/components/platform/UrbanQuadroIIWorkspacePanel";
import { UrbanOfficialLegalSourcesPanel } from "@/components/platform/UrbanOfficialLegalSourcesPanel";
import { UrbanAiReadinessPanel } from "@/components/platform/UrbanAiReadinessPanel";
import { UrbanZoningMapManagerPanel } from "@/components/platform/UrbanZoningMapManagerPanel";
import { UrbanRegulationEvidencePanel } from "@/components/platform/UrbanRegulationEvidencePanel";
import type { MunicipalLegalFiles } from "@/lib/urbanAiReadiness";
import type { PreparedUrbanMatrixDraft } from "@/lib/urbanMatrixDraftPreparation";
import { URBAN_METRICS, isUrbanTestFixtureRule, normalizeUrbanCode, type UrbanMetric, type UrbanRegulationVersion, type UrbanRule } from "@/lib/urbanPrecheck";

type EditableValue = { limit: string; reference: string };
type DraftInputs = Partial<Record<UrbanMetric, EditableValue>>;

export function MunicipalUrbanRulesSettings({
  municipalityId, canEdit, documentFiles, documentRef,
}: { municipalityId: string; canEdit: boolean; documentFiles?: MunicipalLegalFiles;
  documentRef?: string }) {
  const editorRef = useRef<HTMLDetailsElement>(null);
  const [sourceContext, setSourceContext] = useState<string[]>([]);
  const [simulationOnly, setSimulationOnly] = useState(false);
  const [versions, setVersions] = useState<UrbanRegulationVersion[]>([]);
  const officialActiveCount = versions.filter((version) =>
    version.status === "active" && !isUrbanTestFixtureRule(version),
  ).length;
  const fixtureCount = versions.filter(isUrbanTestFixtureRule).length;
  const [zone, setZone] = useState("");
  const [usage, setUsage] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [draft, setDraft] = useState<DraftInputs>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [activeQuadro, setActiveQuadro] = useState<"I" | "II">("I");
  const [auditRevision, setAuditRevision] = useState(0);
  const [reviewCaveatFocus, setReviewCaveatFocus] = useState(0);
  const openReviewQuadro = (quadro: "I" | "II") => {
    setActiveQuadro(quadro);
    if (quadro === "I") setReviewCaveatFocus((value) => value + 1);
  };
  const markAuditChanged = () => setAuditRevision((revision) => revision + 1);

  useEffect(() => {
    let active = true;
    setVersions([]);
    setDraft({});
    setSimulationOnly(false);
    setZone("");
    setUsage("");
    setEffectiveFrom("");
    setNotice("");
    setActiveQuadro("I");
    setSourceContext([]);
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
    markAuditChanged();
  };
  const updateRule = (metric: UrbanMetric, field: keyof EditableValue, text: string) => {
    setDraft((previous) => ({
      ...previous, [metric]: { limit: previous[metric]?.limit || "",
        reference: previous[metric]?.reference || "", [field]: text },
    }));
  };
  const prepareFromMatrix = (prepared: PreparedUrbanMatrixDraft) => {
    if (!canEdit) return;
    setZone(prepared.zone);
    setUsage(prepared.usage);
    setEffectiveFrom("");
    setDraft(prepared.fields);
    setSourceContext(prepared.otherLegalFields);
    setSimulationOnly(Boolean(prepared.simulationOnly));
    if (editorRef.current) {
      editorRef.current.open = true;
      // This scroll is user-initiated via "Preencher campos para conferência".
      // Route changes and background refreshes must never move the viewport.
      window.requestAnimationFrame(() =>
        editorRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
    }
    setNotice(prepared.warning + " Os dados estão no formulário aberto. Confira a fonte, vigência e o status antes de qualquer gravação.");
  };

  const save = async () => {
    if (!canEdit || !municipalityId || busy) return;
    // Provisional AIU2 = 1 is authorized for QA calculation only. It is never
    // a juridical value, even if someone manually provides an effective date.
    if (simulationOnly) {
      setNotice("AIU (2): CA mínimo 1,00 é somente simulação técnica. Nenhuma versão legal foi gravada. Aguarde confirmação documental/CONCIDADE.");
      return;
    }
    // The date of registration is not the effective date of a municipal law.
    // Never quietly date a legal rule as "today".
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      setNotice("Informe a data de início de vigência comprovada pela norma oficial; não use a data atual por padrão.");
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
      setDraft({});
      setSimulationOnly(false);
      setEffectiveFrom("");
      setSourceContext([]);
      setNotice("Nova versão registrada como RASCUNHO. Confira os artigos e ative quando validada.");
    } catch (error) {
      setNotice(String((error as Error)?.message || error));
    } finally { setBusy(false); }
  };
  const activate = async (id: string) => {
    if (!canEdit || busy || !window.confirm(
      "Confirma que a legislação vigente, o quadro, as exceções, a zona, o uso, a data de vigência e as evidências oficiais com página e hash foram conferidos? Sem evidências verificadas, a ativação será negada."
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
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100">
        <ShieldAlert className="mr-1 inline h-4 w-4" />
        O upload de PDFs do acervo legal não cria regras automaticamente. Informe os parâmetros
        somente após leitura da legislação oficial; situações especiais exigem avaliação jurídica e urbanística.
      </div>
      <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm leading-6 text-slate-800 dark:border-sky-700 dark:bg-slate-900 dark:text-slate-100">
        <p className="font-bold">Como preencher com fontes oficiais</p>
        <p className="mt-1">
          1. Identifique a <strong>zona real</strong> no mapa de zoneamento vigente;
          2. confira a <strong>categoria de uso</strong> na tabela de usos permitidos;
          3. consulte o <strong>quadro oficial de índices urbanísticos</strong> para essa combinação;
          4. registre apenas os limites aplicáveis com lei, artigo, quadro, página e exceções.
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-700 dark:text-slate-200">
          Não use valores de exemplos, minutas de revisão ou propostas não promulgadas.
          Se o parâmetro não foi confirmado, deixe o campo sem preencher e não ative a norma.
          Verifique alterações e vigência com o setor técnico responsável.
        </p>
      </div>

      <UrbanAiReadinessPanel municipalityId={municipalityId}
        documents={documentFiles ?? { usoSolo: "", zoneamento: "", planoDiretor: "", leisComplementares: "" }}
        onOpenQuadro={openReviewQuadro} revision={auditRevision} />
      <UrbanOfficialLegalSourcesPanel municipalityId={municipalityId} />

      <div className="mt-5 min-w-0 scroll-mt-24" data-urban-quadros-workspace="true">
        <div role="group" aria-label="Escolher quadro da legislação urbanística"
          className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-slate-100/80 p-2 dark:border-slate-700 dark:bg-slate-900 sm:grid-cols-2">
          <button type="button" data-urban-quadro-tab="true" data-contrast-surface={activeQuadro === "I" ? "dark" : "light"}
            id="sigapro-quadro-i-tab" aria-controls="sigapro-quadro-i-panel"
            aria-pressed={activeQuadro === "I"} onClick={() => setActiveQuadro("I")}
            className="min-w-0 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">
            <span data-urban-quadro-tab-title="true" className="block text-sm font-extrabold">Quadro I — Índices urbanísticos</span>
            <span data-urban-quadro-tab-detail="true" className="mt-1 block text-xs">Ver linhas importadas, conferências e pendências</span>
          </button>
          <button type="button" data-urban-quadro-tab="true" data-contrast-surface={activeQuadro === "II" ? "dark" : "light"}
            id="sigapro-quadro-ii-tab" aria-controls="sigapro-quadro-ii-panel"
            aria-pressed={activeQuadro === "II"} onClick={() => setActiveQuadro("II")}
            className="min-w-0 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500">
            <span data-urban-quadro-tab-title="true" className="block text-sm font-extrabold">Quadro II — Usos e localização</span>
            <span data-urban-quadro-tab-detail="true" className="mt-1 block text-xs">Transcrição assistida, páginas 38 a 51</span>
          </button>
        </div>
        {activeQuadro === "I" ? (
          <div id="sigapro-quadro-i-panel" role="region" aria-labelledby="sigapro-quadro-i-tab" className="min-w-0 pt-3">
            <UrbanLegalMatrixReviewPanel municipalityId={municipalityId} canView canEdit={canEdit}
                onPrepareDraft={prepareFromMatrix} onDataChanged={markAuditChanged}
                focusRegisteredCaveats={reviewCaveatFocus} />
          </div>
        ) : (
          <div id="sigapro-quadro-ii-panel" role="region" aria-labelledby="sigapro-quadro-ii-tab" className="min-w-0 pt-3">
            <UrbanQuadroIIWorkspacePanel municipalityId={municipalityId} canView canEdit={canEdit} onDataChanged={markAuditChanged} />
          </div>
        )}
      </div>
      {canEdit && municipalityId ? (
        <>
          <details ref={editorRef} data-urban-legal-editor="true"
            className="mt-6 min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-950">
            <summary className="cursor-pointer select-none rounded-2xl bg-slate-50 px-4 py-4 text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:bg-slate-900 dark:text-white">
              <strong className="block text-sm">Cadastro jurídico de versões — etapa independente</strong>
              <span className="mt-1 block text-xs leading-5 text-slate-600 dark:text-slate-200">
                Abra apenas depois da conferência documental da lei. Não é necessário repetir os dados dos Quadros I e II.
              </span>
            </summary>
            <div className="px-4 pb-5">
              {simulationOnly ? (
                <div data-urban-aiu2-autofill-preview="true"
                  className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-5 text-amber-950 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-100">
                  <div className="min-w-0 flex-1">
                    <strong className="block">AIU (2) — CA mínimo = 1,00 preenchido para teste</strong>
                    <p className="mt-1 text-xs">
                      Critério técnico provisório, pendente de CONCIDADE. O PDF original apresenta “01” e não comprova a vigência de 1,00.
                      Os campos podem ser usados para simulação, mas o salvamento jurídico permanece bloqueado.
                    </p>
                  </div>
                  <button type="button" onClick={() => {
                    setSimulationOnly(false); setDraft({}); setZone(""); setUsage(""); setEffectiveFrom("");
                    setSourceContext([]); setNotice("Simulação descartada; nenhuma norma foi gravada.");
                  }} className="min-h-9 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-950 hover:bg-amber-100">
                    Descartar simulação
                  </button>
                </div>
              ) : null}
              {sourceContext.length > 0 ? (
                <div data-urban-prepared-legal-context="true"
                  className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-slate-900 dark:border-sky-700 dark:bg-slate-900 dark:text-white">
                  <strong className="block">Informações do Quadro I que não foram convertidas em limites automáticos</strong>
                  {sourceContext.map((item) => <p key={item} className="mt-1 break-words">{item}</p>)}
                  <p className="mt-2 font-semibold">Confirme essas condições no original. Nenhuma regra foi ativada.</p>
                </div>
              ) : null}
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                Salvar cria apenas rascunho. Confirme artigo, versão, exceções e data real de início da vigência;
                a data do cadastro ou a de hoje não comprova vigência.
              </p>
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
              Vigência legal comprovada (obrigatória)
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
                <Input aria-label={"Referência legal: " + metric.label} placeholder="Ex.: Lei 123/2026, art. 15, § 2º"
                  maxLength={500} value={draft[metric.key]?.reference || ""}
                  onChange={(event) => updateRule(metric.key, "reference", event.target.value)} />
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              data-sigapro-urban-rules-save="true"
              aria-label="Salvar nova versão como rascunho"
              aria-busy={busy}
              disabled={busy || loading || simulationOnly}
              onClick={() => void save()}
              className="sig-force-dark-action sig-urban-rules-save-button inline-flex min-h-11 w-full max-w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 sm:w-auto"
            >
              {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" /> :
                <Save aria-hidden="true" className="h-4 w-4 shrink-0" />}
              <span data-sigapro-urban-rules-save-label="true" className="whitespace-normal text-center font-bold leading-5 text-white">
                {simulationOnly ? "Simulação: salvamento jurídico bloqueado" : "Salvar nova versão como rascunho"}
              </span>
            </button>
          </div>
            </div>
          </details>
        </>
      ) : null}

      <UrbanZoningMapManagerPanel municipalityId={municipalityId} canEdit={canEdit} />

      <div data-urban-regulation-versions="true" className="mt-6 scroll-mt-24 border-t border-slate-200 pt-4 dark:border-slate-700">
        <h4 className="text-sm font-bold text-slate-950 dark:text-white">Versões cadastradas neste município</h4>
        {!loading && fixtureCount > 0 ? (
          <p data-urban-qa-fixtures="true" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 font-semibold text-amber-950">
            {fixtureCount} registro(s) fictício(s) de QA nesta prefeitura. Não têm validade jurídica
            e não comprovam parâmetros oficiais, mesmo quando constam como ativos na base de testes.
          </p>
        ) : null}
        {!loading && officialActiveCount === 0 ? (
          <p data-urban-official-active="none" className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-950">
            Nenhuma versão ativa não fictícia encontrada neste cadastro.
            Para aprovar regras oficiais, confirme a lei consolidada, suas alterações,
            vigência e a evidência de cada índice com o setor urbanístico responsável.
          </p>
        ) : null}
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
                  Vigência informada: {item.effective_from} · {item.rules.length} parâmetros ·{" "}
                  {isUrbanTestFixtureRule(item) ? "Regra fictícia de teste — sem validade jurídica" :
                    item.status === "active" ? "Ativa no cadastro" : item.status === "draft" ? "Rascunho" : "Substituída"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {item.status === "active" && !isUrbanTestFixtureRule(item) ? <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-label="Versão ativa" /> : null}
                {item.status === "draft" && !isUrbanTestFixtureRule(item) ?
                  <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                    Evidência legal obrigatória antes da ativação
                  </span> : null}
              </div>
              {!isUrbanTestFixtureRule(item) && (item.status === "draft" || item.status === "active") ? (
                <UrbanRegulationEvidencePanel version={item} municipalityId={municipalityId}
                  canEdit={canEdit} sourceRef={documentRef}
                  onDataChanged={markAuditChanged}
                  sourceFileName={documentFiles?.usoSolo}
                  onActivate={() => void activate(item.id)} />
              ) : null}
            </article>
          ))}
        </div>
      </div>
      {notice ? <p role="status" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">{notice}</p> : null}
    </section>
  );
}
