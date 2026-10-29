import { useEffect, useState } from "react";
import { BookOpenCheck, CheckCircle2, Loader2, Save, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { activateUrbanRegulation, listUrbanRegulations, saveUrbanRegulationDraft } from "@/integrations/backend/urbanPrecheckClient";
import { URBAN_METRICS, normalizeUrbanCode, type UrbanMetric, type UrbanRegulationVersion, type UrbanRule } from "@/lib/urbanPrecheck";
import { UrbanLegalKnowledgeDesk } from "@/components/platform/UrbanLegalKnowledgeDesk";

type EditableValue = { limit: string; reference: string };
type DraftInputs = Partial<Record<UrbanMetric, EditableValue>>;

export function MunicipalUrbanRulesSettings({
  municipalityId, canEdit,
}: { municipalityId: string; canEdit: boolean }) {
  const [versions, setVersions] = useState<UrbanRegulationVersion[]>([]);
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null);
  const [zone, setZone] = useState("");
  const [usage, setUsage] = useState("");
  // Legal effective dates must be supplied from the actual municipal ordinance.
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [draft, setDraft] = useState<DraftInputs>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    setVersions([]);
    setExpandedVersionId(null);
    setDraft({});
    setZone("");
    setUsage("");
    setEffectiveFrom("");
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
  const save = async () => {
    if (!canEdit || !municipalityId || busy) return;
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
      setNotice("Nova versão registrada como RASCUNHO. Confira os artigos e ative quando validada.");
    } catch (error) {
      setNotice(String((error as Error)?.message || error));
    } finally { setBusy(false); }
  };
  const activate = async (id: string) => {
    if (!canEdit || busy || !window.confirm(
      "Confirma que a legislação, a zona, o uso, a data de vigência e os artigos foram conferidos? Ativar substituirá a versão vigente somente para esta zona e uso."
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

      {canEdit && municipalityId ? (
        <>
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
                <Input aria-label={"Referência legal: " + metric.label} placeholder="Ex.: Lei 123/2026, art. 15, § 2º"
                  maxLength={500} value={draft[metric.key]?.reference || ""}
                  onChange={(event) => updateRule(metric.key, "reference", event.target.value)} />
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Button type="button" disabled={busy || loading} onClick={() => void save()} className="rounded-xl bg-sky-700 text-white hover:bg-sky-800">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar nova versão como rascunho
            </Button>
          </div>
        </>
      ) : null}

      <div className="mt-6 border-t border-slate-200 pt-4 dark:border-slate-700">
        <h4 className="text-sm font-bold text-slate-950 dark:text-white">Versões cadastradas neste município</h4>
        {loading ? <p role="status" className="mt-3 text-sm text-slate-500">Carregando normas oficiais...</p> : null}
        {!loading && versions.length === 0 ? <p className="mt-3 text-sm text-slate-500 dark:text-slate-300">
          Não há regras cadastradas. A análise automática ficará indisponível até a ativação de uma versão válida.
        </p> : null}
        <div className="mt-3 grid gap-2">
          {versions.map((item) => (
            <article key={item.id} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 text-sm text-slate-950 dark:text-slate-100">
                  <p className="font-bold">{item.zone_code} · {item.use_code} · Versão {item.version}</p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Vigência: {item.effective_from} · {item.rules.length} parâmetros · {item.status === "active" ? "Vigente" : item.status === "draft" ? "Rascunho" : "Substituída"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {item.status === "active" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-label="Versão ativa" /> : null}
                  <Button type="button" variant="outline" aria-expanded={expandedVersionId === item.id}
                    onClick={() => setExpandedVersionId((previous) => previous === item.id ? null : item.id)}>
                    {expandedVersionId === item.id ? "Ocultar parâmetros" : "Conferir parâmetros"}
                  </Button>
                  {item.status === "draft" && canEdit ?
                    <Button type="button" variant="outline" disabled={busy || expandedVersionId !== item.id}
                      title={expandedVersionId !== item.id ? "Confira os limites e os artigos antes de ativar" : "Validar e ativar a versão"}
                      onClick={() => void activate(item.id)}>Validar e ativar</Button> : null}
                </div>
              </div>
              {expandedVersionId === item.id ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-950">
                  <p className="border-b border-slate-200 p-3 text-xs font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200">
                    Confira os limites, a data de vigência, as condições de aplicação e cada referência legal antes da ativação.
                  </p>
                  <div className="divide-y divide-slate-200 dark:divide-slate-700">
                    {item.rules.map((rule) => {
                      const description = URBAN_METRICS.find((metric) => metric.key === rule.metric);
                      return (
                        <div key={rule.metric} className="grid gap-1 p-3 text-xs text-slate-800 dark:text-slate-100 md:grid-cols-[minmax(160px,1fr)_minmax(90px,0.35fr)_minmax(180px,1.4fr)]">
                          <span className="font-bold">{description?.label || rule.metric}</span>
                          <span className="font-semibold">{description?.direction === "minimum" ? "Mín. " : "Máx. "}{rule.limit} {description?.unit || ""}</span>
                          <span className="break-words">{rule.reference}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </div>
      <UrbanLegalKnowledgeDesk
        municipalityId={municipalityId}
        canEdit={canEdit}
        scope={{ zoneCode: zone, useCode: usage, effectiveFrom, effectiveUntil: "" }}
        onUseReference={(metric, reference, suggestedLimit) => {
          if (!canEdit) return;
          setDraft(previous => ({
            ...previous,
            [metric]: {
              // Never overwrite a measurement the municipal editor has entered.
              limit: previous[metric]?.limit || (suggestedLimit === null ? "" : String(suggestedLimit)),
              reference: previous[metric]?.reference || reference,
            },
          }));
          setNotice("Referência copiada para o RASCUNHO. Revise zona, uso, data de vigência, lei, artigo, exceções e valor antes de salvar.");
        }}
      />
      {notice ? <p role="status" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">{notice}</p> : null}
    </section>
  );
}
