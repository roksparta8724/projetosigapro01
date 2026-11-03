import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, ChevronDown, FileWarning, Loader2, Save, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  listUrbanQuadroIIWorkspace, saveUrbanQuadroIIDraft,
  type UrbanQuadroIIDraftInput, type UrbanQuadroIIWorkspace,
} from "@/integrations/backend/urbanPrecheckClient";

const emptyDraft = (pageNumber: number): UrbanQuadroIIDraftInput => ({
  pageNumber, categoryCode: "", useDescription: "", permittedZones: "",
  roadHierarchy: "", parkingRequirement: "", specialConditions: "", sourceExcerpt: "",
});

export function UrbanQuadroIIWorkspacePanel({
  municipalityId, canEdit,
}: { municipalityId: string; canEdit: boolean }) {
  const [workspace, setWorkspace] = useState<UrbanQuadroIIWorkspace | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activePage, setActivePage] = useState<number | null>(null);
  const [draft, setDraft] = useState<UrbanQuadroIIDraftInput>(() => emptyDraft(38));
  const [confirmed, setConfirmed] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let active = true;
    setWorkspace(null);
    setError("");
    setNotice("");
    setActivePage(null);
    setFormOpen(false);
    if (!municipalityId || !canEdit) return () => { active = false; };
    setLoading(true);
    void listUrbanQuadroIIWorkspace(municipalityId)
      .then((data) => { if (active) setWorkspace(data); })
      .catch((err: unknown) => {
        if (!active) return;
        const message = String((err as Error)?.message || err);
        setError(/PGRST202|Could not find the function/i.test(message)
          ? "A API municipal ainda não atualizou o cadastro do Quadro II. A função existe no Neon de homologação; tente atualizar a conexão."
          : message);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [municipalityId, canEdit, retryToken]);

  const draftCount = useMemo(
    () => workspace?.entries.length || 0, [workspace],
  );
  const pageCount = workspace?.pages.length || 0;
  const sourcePages = workspace?.pages.filter((page) => Boolean(page.source_evidence_text)).length || 0;
  const suggestions = workspace?.pages.reduce((count, page) => count + (page.proposals?.length || 0), 0) || 0;
  const valid = Boolean(
    draft.categoryCode.trim() && draft.useDescription.trim().length >= 5 &&
    draft.sourceExcerpt.trim().length >= 20 && confirmed &&
    workspace?.status === "pending_legal_review" && activePage === draft.pageNumber,
  );
  const selectPage = (page: number) => {
    if (saving) return;
    if (activePage === page) { setActivePage(null); setFormOpen(false); return; }
    setActivePage(page);
    setDraft(emptyDraft(page));
    setConfirmed(false);
    setFormOpen(false);
    setNotice("");
    setError("");
  };
  const save = async () => {
    if (!canEdit || !valid || saving || !workspace?.batch_id || !workspace.document_sha256) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await saveUrbanQuadroIIDraft(
        municipalityId, workspace.batch_id, workspace.document_sha256, draft, crypto.randomUUID(),
      );
      const next = await listUrbanQuadroIIWorkspace(municipalityId);
      setWorkspace(next);
      setDraft(emptyDraft(draft.pageNumber));
      setConfirmed(false);
      setFormOpen(false);
      setNotice("Transcrição salva como RASCUNHO SEM VALIDAÇÃO. Não foi criada regra ativa para a IA.");
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setSaving(false);
    }
  };
  const setField = (key: keyof Omit<UrbanQuadroIIDraftInput, "pageNumber">, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setConfirmed(false);
  };

  if (!canEdit || !municipalityId) return null;
  return (
    <section data-urban-quadro-ii="true"
      className="mt-5 min-w-0 rounded-[22px] border border-sky-200 bg-[#f3f9fe] p-4 dark:border-sky-700 dark:bg-slate-900 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="flex items-center gap-2 text-base font-extrabold text-slate-950 dark:text-white">
            <BookOpenCheck className="h-5 w-5 text-sky-700 dark:text-sky-300" />
            Quadro II — usos, localização e estacionamento
          </h4>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-700 dark:text-slate-200">
            Continuação independente do Quadro I. Confira cada categoria diretamente no PDF antes
            de guardar a transcrição. Pendências do Quadro I permanecem isoladas nesta etapa.
          </p>
        </div>
        <span className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-950">
          Base em preparação — sem vigência comprovada
        </span>
      </div>
      {loading ? (
        <p role="status" className="mt-3 flex items-center gap-2 text-xs text-slate-700">
          <Loader2 className="h-4 w-4 animate-spin" /> Consultando o índice de páginas no Neon...
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
          <span className="min-w-0 flex-1 break-words">{error}</span>
          <Button type="button" variant="outline" disabled={loading || saving}
            onClick={() => setRetryToken((value) => value + 1)}
            className="shrink-0 border-rose-200 bg-white text-rose-900">
            Tentar novamente
          </Button>
        </div>
      ) : null}
      {notice ? <p role="status" className="mt-3 break-words rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">{notice}</p> : null}

      {workspace?.status === "no_source" ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-white p-3 text-xs text-slate-800">
          Ainda não existe importação vinculada ao PDF desta Prefeitura. Cadastre primeiro o documento-fonte no acervo.
        </p>
      ) : null}
      {workspace?.status === "archived_source" ? (
        <p className="mt-3 rounded-xl border border-amber-200 bg-white p-3 text-xs text-slate-800">
          A importação de origem está arquivada. Restaure-a ou importe a versão oficial apropriada.
        </p>
      ) : null}

      {workspace?.status === "pending_legal_review" ? (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-slate-900">
              <p className="text-xs text-slate-600">Páginas identificadas</p>
              <strong className="text-xl font-extrabold">{pageCount}</strong>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-slate-900">
              <p className="text-xs text-slate-600">Páginas com texto-fonte</p>
              <strong className="text-xl font-extrabold">{sourcePages}/{pageCount}</strong>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3 text-slate-900">
              <p className="text-xs text-slate-600">Rascunhos de categorias</p>
              <strong className="text-xl font-extrabold">{draftCount}</strong>
            </div>
            <div className="rounded-xl border border-amber-200 bg-white p-3 text-slate-900">
              <p className="text-xs text-slate-600">Regras liberadas para IA</p>
              <strong className="text-xl font-extrabold text-amber-800">0</strong>
            </div>
          </div>
          <p className="mt-3 break-all text-[11px] leading-5 text-slate-600 dark:text-slate-300">
            Documento: {workspace.document_title} · SHA-256 {workspace.document_sha256}
          </p>
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
            <ShieldAlert className="mr-1 inline h-4 w-4" />
            O PDF contém {sourcePages} páginas com evidência de leitura em preparação e {suggestions} sugestões
            de categorias ainda não conferidas. Texto extraído pode misturar colunas, especialmente estacionamento e
            zonas. Nenhuma sugestão é norma e nada entra na análise da IA sem revisão documental e jurídica.
          </div>
          <p className="mt-4 text-sm font-bold text-slate-900 dark:text-white">Índice de leitura — páginas 38 a 51</p>
          <div className="mt-2 grid gap-2 lg:grid-cols-2">
            {workspace.pages.map((page) => {
              const expanded = activePage === page.page_number;
              const entries = workspace.entries.filter((item) => item.page_number === page.page_number);
              return (
                <div key={page.page_number} className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white">
                  <button type="button" aria-expanded={expanded}
                    onClick={() => selectPage(page.page_number)}
                    className="flex w-full min-w-0 items-center justify-between gap-3 p-3 text-left text-slate-900 hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 dark:text-white dark:hover:bg-slate-800">
                    <span className="min-w-0">
                      <strong className="block text-sm">Página {page.page_number} · {page.topic}</strong>
                      <span className="mt-1 block text-xs text-slate-600 dark:text-slate-300">
                        {page.draft_count} rascunho(s) · {page.proposals?.length || 0} sugestões · conferência legal pendente
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-sky-800 dark:text-sky-300">
                      {expanded ? "Ocultar" : "Abrir"} <ChevronDown className="h-4 w-4" />
                    </span>
                  </button>
                  {expanded ? (
                    <div className="space-y-3 border-t border-slate-200 bg-[#fbfdff] p-3 dark:border-slate-700 dark:bg-slate-900">
                      {page.visual_warning ? (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950">
                          <FileWarning className="mr-1 inline h-4 w-4" />
                          Página girada no original: examine a imagem antes de copiar qualquer número.
                        </p>
                      ) : null}
                      {page.source_evidence_text ? (
                        <details className="min-w-0 rounded-xl border border-sky-200 bg-white p-3 text-slate-900">
                          <summary className="cursor-pointer text-xs font-bold text-sky-900">
                            Exibir texto da página {page.page_number} extraído do PDF (não conferido)
                          </summary>
                          <p className="mt-2 text-xs leading-5 text-amber-900">
                            {page.source_quality === "visual_required"
                              ? "Esta página exige leitura visual. Não copie índices da extração automática."
                              : "Extração automática: colunas e números podem estar fora de ordem. Compare com a imagem original."}
                          </p>
                          <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 font-mono text-xs leading-5 text-slate-800">
                            {page.source_evidence_text}
                          </p>
                        </details>
                      ) : null}
                      {(page.proposals?.length || 0) > 0 ? (
                        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-slate-900">
                          <p className="text-sm font-extrabold">Sugestões de categorias — requerem conferência</p>
                          <p className="text-xs text-slate-600">
                            Use como ponto de partida, sem importar zonas, vagas ou recuos por suposição.
                            O registro somente será salvo depois de conferência humana no PDF.
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {page.proposals?.map((suggestion) => (
                              <div key={suggestion.category_code} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <strong className="block break-words text-xs text-slate-900">
                                  {suggestion.category_code} — {suggestion.use_description}
                                </strong>
                                <button type="button"
                                  disabled={saving}
                                  onClick={() => {
                                    setDraft({
                                      ...emptyDraft(page.page_number),
                                      categoryCode: suggestion.category_code,
                                      useDescription: suggestion.use_description,
                                      sourceExcerpt: suggestion.source_excerpt,
                                    });
                                    setConfirmed(false);
                                    setFormOpen(true);
                                    setNotice("");
                                  }}
                                  className="mt-2 rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-sky-950 hover:bg-sky-50">
                                  Preparar rascunho
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {entries.length > 0 ? entries.map((item) => (
                        <article key={item.id} className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-800">
                          <p className="font-bold">{item.category_code} · {item.use_description}</p>
                          <p className="mt-1">Zonas: {item.permitted_zones_text || "Não transcritas"}</p>
                          <p>Via: {item.road_hierarchy_text || "Não transcrita"}</p>
                          <p>Estacionamento: {item.parking_requirement_text || "Não transcrito"}</p>
                          <p className="mt-1 whitespace-pre-wrap break-words text-slate-600">Fonte literal: {item.source_excerpt}</p>
                          <p className="mt-1 font-semibold text-amber-800">Rascunho — sem validação jurídica</p>
                        </article>
                      )) : (
                        <p className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
                          Nenhuma categoria transcrita nesta página. Não presumir permissões.
                        </p>
                      )}
                      <button type="button" onClick={() => { setFormOpen((value) => !value); setConfirmed(false); }}
                        className="text-xs font-bold text-sky-800 underline underline-offset-4 dark:text-sky-300">
                        {formOpen ? "Fechar formulário" : "Registrar categoria como rascunho"}
                      </button>
                      {formOpen ? (
                        <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-slate-900">
                          <p className="text-xs leading-5 text-slate-700">
                            Transcreva uma categoria por vez. Sugestões pré-preenchidas não são conferência:
                            verifique e corrija o trecho no PDF original antes de marcar a confirmação.
                            Não deduza zonas, vagas ou restrições ilegíveis. Salvar não ativa normas urbanísticas.
                          </p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="text-xs font-semibold">Código da categoria
                              <Input className="mt-1 bg-white text-slate-900" value={draft.categoryCode}
                                onChange={(e) => setField("categoryCode",e.target.value)} maxLength={32}
                                placeholder="Ex.: E1.1" />
                            </label>
                            <label className="text-xs font-semibold">Descrição da categoria
                              <Input className="mt-1 bg-white text-slate-900" value={draft.useDescription}
                                onChange={(e) => setField("useDescription",e.target.value)} maxLength={200}
                                placeholder="Conforme a tabela original" />
                            </label>
                            <label className="text-xs font-semibold">Zonas permitidas (texto literal)
                              <Input className="mt-1 bg-white text-slate-900" value={draft.permittedZones}
                                onChange={(e) => setField("permittedZones",e.target.value)} maxLength={600}
                                placeholder="Deixe vazio se não confirmado" />
                            </label>
                            <label className="text-xs font-semibold">Hierarquia de via
                              <Input className="mt-1 bg-white text-slate-900" value={draft.roadHierarchy}
                                onChange={(e) => setField("roadHierarchy",e.target.value)} maxLength={600}
                                placeholder="Deixe vazio se não confirmado" />
                            </label>
                            <label className="text-xs font-semibold sm:col-span-2">Estacionamento e vagas
                              <Input className="mt-1 bg-white text-slate-900" value={draft.parkingRequirement}
                                onChange={(e) => setField("parkingRequirement",e.target.value)} maxLength={600}
                                placeholder="Regra exatamente como consta no PDF" />
                            </label>
                            <label className="text-xs font-semibold sm:col-span-2">Exceções e condições
                              <Textarea className="mt-1 bg-white text-slate-900" value={draft.specialConditions}
                                onChange={(e) => setField("specialConditions",e.target.value)} maxLength={800}
                                placeholder="Notas, exigências e exceções da página" rows={2} />
                            </label>
                            <label className="text-xs font-semibold sm:col-span-2">Trecho literal do PDF (mínimo 20 caracteres)
                              <Textarea className="mt-1 bg-white text-slate-900" value={draft.sourceExcerpt}
                                onChange={(e) => setField("sourceExcerpt",e.target.value)} maxLength={1600}
                                placeholder="Copie a evidência visível na página, sem corrigir números por suposição" rows={3} />
                            </label>
                          </div>
                          <label className="flex items-start gap-2 text-xs font-semibold leading-5 text-slate-800">
                            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                            Conferi a página {page.page_number} no PDF original.
                            Este registro ficará apenas como rascunho, sem aplicação automática.
                          </label>
                          <Button type="button" disabled={!valid || saving} onClick={() => void save()}
                            className="sig-force-dark-action min-h-11 bg-slate-950 !text-white disabled:!text-white">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            <span className="!text-white">{saving ? "Salvando..." : "Salvar transcrição em rascunho"}</span>
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </section>
  );
}
