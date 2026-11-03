import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BookOpenCheck, ChevronDown, FileWarning, Loader2, Save, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  listUrbanQuadroIIWorkspace, saveUrbanQuadroIIDraft,
  type UrbanQuadroIIDraftInput, type UrbanQuadroIISuggestion, type UrbanQuadroIIWorkspace,
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
  const [selectedSuggestion, setSelectedSuggestion] = useState<UrbanQuadroIISuggestion | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const pageIndexRef = useRef<HTMLDivElement | null>(null);
  const pageDetailRef = useRef<HTMLDivElement | null>(null);
  const pageButtonRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  useEffect(() => {
    let active = true;
    setWorkspace(null);
    setError("");
    setNotice("");
    setActivePage(null);
    setFormOpen(false);
    setSelectedSuggestion(null);
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

  // Keep the prepared form visible instead of leaving it below seven category cards.
  useEffect(() => {
    if (!formOpen || activePage === null) return;
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activePage, formOpen, selectedSuggestion?.category_code]);

  const draftCount = useMemo(
    () => workspace?.entries.length || 0, [workspace],
  );
  const pageCount = workspace?.pages.length || 0;
  const sourcePages = workspace?.pages.filter((page) => page.source_quality === "machine_unverified" && Boolean(page.source_evidence_text)).length || 0;
  const selectedPage = workspace?.pages.find((page) => page.page_number === activePage);
  const selectedIndex = workspace?.pages.findIndex((page) => page.page_number === activePage) ?? -1;
  const suggestions = workspace?.pages.reduce((count, page) => count + (page.proposals?.length || 0), 0) || 0;
  const valid = Boolean(
    draft.categoryCode.trim() && draft.useDescription.trim().length >= 5 &&
    draft.sourceExcerpt.trim().length >= 20 && confirmed &&
    workspace?.status === "pending_legal_review" && activePage === draft.pageNumber,
  );
  // Keep navigation in a stable horizontal strip; never auto-scroll the whole
  // page down to a long detail panel merely because a page was selected.
  useLayoutEffect(() => {
    if (activePage === null) return;
    const index = pageIndexRef.current;
    const activeButton = pageButtonRefs.current.get(activePage);
    if (!index || !activeButton) return;
    const left = activeButton.offsetLeft - index.offsetLeft;
    const right = left + activeButton.offsetWidth;
    if (left < index.scrollLeft || right > index.scrollLeft + index.clientWidth) {
      index.scrollTo({
        left: Math.max(0, left - Math.max(12, index.clientWidth / 3)),
        behavior: "auto",
      });
    }
  }, [activePage]);

  const selectPage = (page: number) => {
    if (saving) return;
    if (activePage === page) { setActivePage(null); setFormOpen(false); setSelectedSuggestion(null); return; }
    setActivePage(page);
    setDraft(emptyDraft(page));
    setSelectedSuggestion(null);
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
      setSelectedSuggestion(null);
      setConfirmed(false);
      setFormOpen(false);
      setNotice("Transcrição salva como RASCUNHO SEM VALIDAÇÃO. Não foi criada regra ativa para a IA.");
    } catch (err) {
      setError(String((err as Error)?.message || err));
    } finally {
      setSaving(false);
    }
  };
  const prepareSuggestion = (pageNumber: number, proposal: UrbanQuadroIISuggestion) => {
    if (saving || proposal.status !== "proposal_unverified") return;
    // Suggestions from old PDFs are untrusted. Clamp before showing them as editable text.
    setDraft({
      pageNumber,
      categoryCode: proposal.category_code.slice(0, 32),
      useDescription: proposal.use_description.slice(0, 200),
      // Zone abbreviations in the scanned table are not consistently legible.
      // Keep any OCR candidates visible below but NEVER paste them as legal permissions.
      permittedZones: "",
      roadHierarchy: (proposal.road_hierarchy_text || "").slice(0, 600),
      parkingRequirement: proposal.field_warnings?.some((note) =>
        /estacionamento|vagas.*(borrad|ileg[ií]vel|impress[aã]o)|propor[cç][aã]o.*vaga|raz[aã]o.*vaga/i.test(note),
      ) ? "" : (proposal.parking_requirement_text || "").slice(0, 600),
      specialConditions: (proposal.special_conditions_text || "").slice(0, 800),
      // Joined table-cell summaries must never appear as literal legal evidence.
      sourceExcerpt: (proposal.literal_source_excerpt || "").slice(0, 1600),
    });
    setSelectedSuggestion(proposal);
    setConfirmed(false); // Auto-fill is never a human confirmation.
    setFormOpen(true);
    setError("");
    setNotice("Campos pré-preenchidos pela leitura do PDF. Confira as páginas indicadas e corrija os pontos duvidosos antes de registrar.");
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
          <div ref={pageIndexRef} data-urban-qii-index="true"
            className="mt-2 scroll-mt-24 overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-950">
            <div role="group" aria-label="Selecionar página do Quadro II"
              className="flex w-max min-w-full flex-nowrap gap-2">
              {workspace.pages.map((item) => (
                <button key={item.page_number} type="button"
                  ref={(node) => {
                    if (node) pageButtonRefs.current.set(item.page_number, node);
                    else pageButtonRefs.current.delete(item.page_number);
                  }}
                  aria-pressed={activePage === item.page_number}
                  aria-controls="sigapro-qii-selected-page"
                  onClick={() => selectPage(item.page_number)}
                  className={`w-[160px] shrink-0 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600
                    ${activePage === item.page_number
                      ? "border-sky-400 bg-sky-50 text-slate-950 ring-1 ring-sky-200"
                      : "border-slate-200 bg-white text-slate-900 hover:bg-sky-50"}`}>
                  <span className="block truncate text-sm font-extrabold !text-slate-950">
                    Página {item.page_number}
                  </span>
                  <span className="mt-1 block truncate text-xs !text-slate-600" title={item.topic}>
                    {item.topic}
                  </span>
                  <span className="mt-1 block text-[11px] font-semibold text-sky-900">
                    {activePage === item.page_number ? "Selecionada" : `${item.proposals?.length || 0} sugestões`}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
            Escolha uma página acima ou use Anterior e Próxima. O conteúdo fica aqui,
            sem deslocar a tela para o fim da lista.
          </p>
          {selectedPage ? (() => {
            const page = selectedPage;
            const entries = workspace.entries.filter((item) => item.page_number === page.page_number);
            return (
              <div id="sigapro-qii-selected-page" ref={pageDetailRef}
                data-urban-qii-detail="true"
                role="region" aria-label={`Leitura da página ${page.page_number} do Quadro II`}
                className="mt-4 min-w-0 scroll-mt-24 overflow-hidden rounded-2xl border border-sky-200 bg-[#fbfdff] shadow-sm dark:border-sky-700 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-100 bg-white p-4 text-slate-900">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-sky-800">Leitura assistida — Quadro II</p>
                    <h5 className="mt-1 text-base font-extrabold text-slate-950">
                      Página {page.page_number} · {page.topic}
                    </h5>
                    <p className="mt-1 text-xs text-slate-600">
                      {page.proposals?.length || 0} sugestões · conferência legal pendente
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={selectedIndex <= 0}
                      onClick={() => {
                        const prev = workspace.pages[selectedIndex - 1];
                        if (prev) selectPage(prev.page_number);
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50">
                      Página anterior
                    </button>
                    <button type="button" disabled={selectedIndex >= workspace.pages.length - 1}
                      onClick={() => {
                        const next = workspace.pages[selectedIndex + 1];
                        if (next) selectPage(next.page_number);
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50">
                      Próxima página
                    </button>
                    <button type="button"
                      onClick={() => pageIndexRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })}
                      className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-950 hover:bg-sky-100">
                      Ver índice
                    </button>
                  </div>
                </div>
                    <div className="space-y-3 border-t border-slate-200 bg-[#fbfdff] p-3 dark:border-slate-700 dark:bg-slate-900 md:p-4">
                      {page.visual_warning ? (
                        <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950">
                          <FileWarning className="mr-1 inline h-4 w-4" />
                          Página girada no original: gire a visualização do PDF para ler a tabela S1. Não copie índices de texto extraído sem conferir.
                        </p>
                      ) : null}
                      {formOpen ? (
                        <div ref={editorRef} role="region" aria-label="Conferência assistida da categoria"
                          data-urban-qii-editor="true"
                          className="scroll-mt-24 space-y-4 rounded-2xl border-2 border-sky-300 bg-white p-4 text-slate-950 shadow-sm md:p-5">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-wide text-sky-900">Conferência assistida · Página {page.page_number}</p>
                              <h5 className="mt-1 text-lg font-extrabold text-slate-950">
                                {selectedSuggestion ? `${draft.categoryCode} — ${draft.useDescription}` : "Nova categoria — rascunho manual"}
                              </h5>
                              <p className="mt-1 text-xs leading-5 text-slate-600">
                                Campos sugeridos não são regras oficiais. Revise com a imagem do PDF antes de registrar.
                              </p>
                            </div>
                            <button type="button" onClick={() => { setFormOpen(false); setSelectedSuggestion(null); }}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 hover:bg-slate-100">
                              Fechar conferência
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs font-semibold">
                            <span className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sky-950">1. Dados sugeridos</span>
                            <span className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-950">2. Conferir original</span>
                            <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-slate-900">3. Salvar rascunho</span>
                          </div>
                          <p className="text-xs leading-5 text-slate-700">
                            {selectedSuggestion
                              ? "A IA preparou um rascunho, não uma regra. Zonas ilegíveis e exigências de vagas duvidosas permanecem em branco até você conferir o PDF original."
                              : "Cadastre uma categoria manualmente quando não houver leitura confiável."}
                            {" "}Quando um campo estiver em branco, o dado não foi confirmado e não deve ser inventado.
                            No campo de evidência, registre um trecho literal do original (não um resumo de colunas).
                            Um rascunho não ativa normas urbanísticas.
                          </p>
                          {selectedSuggestion ? (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                              <strong className="block">Conferência documental necessária</strong>
                              <span className="block">Páginas para conferir: {selectedSuggestion.source_pages?.join(" e ") || page.page_number}</span>
                              {selectedSuggestion.field_warnings?.map((warning, index) => (
                                <p key={index} className="mt-1 break-words">{warning}</p>
                              ))}
                              {selectedSuggestion.permitted_zones_text ? (
                                <p className="mt-2 rounded-xl border border-amber-300 bg-white p-3 text-slate-900">
                                  <strong className="block text-xs text-amber-900">Zonas detectadas automaticamente — NÃO confirmadas</strong>
                                  <span className="block break-words">{selectedSuggestion.permitted_zones_text}</span>
                                  <span className="mt-1 block text-xs text-amber-900">
                                    O campo de zonas ficou vazio propositalmente. Confira a coluna no Quadro II e o mapa
                                    de zoneamento vigente antes de inserir qualquer zona permitida.
                                  </span>
                                </p>
                              ) : null}
                              {selectedSuggestion.group_scope_text ? (
                                <p className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-2 font-semibold text-slate-900">
                                  Enquadramento geral da categoria: {selectedSuggestion.group_scope_text}
                                </p>
                              ) : null}
                              {selectedSuggestion.example_activities_text ? (
                                <p className="mt-2 rounded-lg border border-amber-200 bg-white px-3 py-2 text-slate-900">
                                  Atividades abrangidas na fonte: {selectedSuggestion.example_activities_text}
                                </p>
                              ) : null}
                              <p className="mt-2 font-semibold">
                                Os dados sugeridos ainda não são parâmetros oficialmente validados.
                                Não aprove o cadastro apenas pela aparência do preenchimento.
                              </p>
                            </div>
                          ) : null}
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
                            <label className="text-xs font-semibold">Zonas permitidas (somente após conferir no PDF e no mapa)
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
                            <label className="text-xs font-semibold sm:col-span-2">Trecho literal da fonte (conferir no PDF; mínimo 20 caracteres)
                              <Textarea className="mt-1 bg-white text-slate-900" value={draft.sourceExcerpt}
                                onChange={(e) => setField("sourceExcerpt",e.target.value)} maxLength={1600}
                                placeholder="Transcreva um trecho literal da tabela. Resumos automáticos de várias colunas não são prova documental." rows={3} />
                            </label>
                          </div>
                          <label className="flex items-start gap-2 text-xs font-semibold leading-5 text-slate-800">
                            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                            Conferi {selectedSuggestion?.source_pages?.length
                              ? `as páginas ${selectedSuggestion.source_pages.join(" e ")}`
                              : `a página ${page.page_number}`} no PDF original, inclusive os números
                            e exceções sugeridos. Este registro ficará somente como rascunho, sem aplicação automática.
                          </label>
                          <Button type="button" disabled={!valid || saving} onClick={() => void save()}
                            data-urban-qii-action="true" className="sig-force-dark-action min-h-11 rounded-xl bg-[#0b3150] !text-white disabled:!text-white">
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            <span data-urban-qii-action-label="true" className="!text-white">{saving ? "Salvando..." : "Salvar transcrição em rascunho"}</span>
                          </Button>
                        </div>
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
                      {(page.proposals?.length || 0) === 0 ? (
                        <div data-urban-qii-unstructured="true"
                          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-950">
                          <p className="text-sm font-extrabold">
                            {page.page_number === 44 ? "Continuação das categorias S1 — serviços locais"
                              : page.page_number === 49 ? "Continuação das categorias C2 — comércio diversificado"
                                : page.page_number === 51 ? "Parcelamento do solo — modalidades habitacionais"
                                  : "Página sem categorias estruturadas"}
                          </p>
                          <p className="mt-1 text-xs leading-5">
                            {page.page_number === 44
                              ? "As categorias S1.1 a S1.5 começam na página 43. A página 44 contém requisitos complementares de zonas, vias e vagas. Confira ambas antes de salvar."
                              : page.page_number === 49
                                ? "As categorias C2.1 a C2.7 começam na página 48. A página 49 contém condições e vagas que precisam ser conferidas junto à página anterior."
                                : page.page_number === 51
                                  ? "Esta página trata de modalidades de parcelamento, não de categorias de uso. Não registre modalidades UH como usos permitidos."
                                  : "A extração de texto não constitui transcrição validada. Ainda faltam identificar categorias, zonas, vagas e exceções nesta página."}
                            {" "}Não aplicar esta página à IA nem interpretar ausência de sugestões como ausência de exigências.
                          </p>
                        </div>
                      ) : null}
                      {(page.proposals?.length || 0) > 0 ? (
                        <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-slate-900">
                          <p className="text-sm font-extrabold">Sugestões de categorias — requerem conferência</p>
                          <p className="text-xs text-slate-600">
                            A leitura assistida preenche os campos que encontrou no PDF, com indicação das
                            páginas e dúvidas. Confira os números antes de salvar. Nada é ativado para a IA.
                          </p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {page.proposals?.map((suggestion) => (
                              <div key={suggestion.category_code} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <strong className="block break-words text-xs text-slate-900">
                                  {suggestion.category_code} — {suggestion.use_description}
                                </strong>
                                {suggestion.group_scope_text ? (
                                  <p className="mt-1 break-words text-[11px] text-slate-700">{suggestion.group_scope_text}</p>
                                ) : null}
                                <p className="mt-1 break-words text-[11px] text-slate-600">
                                  Fonte: páginas {suggestion.source_pages?.join(", ") || page.page_number} ·
                                  leitura pendente de conferência
                                </p>
                                <p className="mt-1 break-words text-xs text-slate-700">
                                  {suggestion.parking_requirement_text
                                    ? `Vagas: ${suggestion.parking_requirement_text}`
                                    : "Vagas: trecho ilegível ou não confirmado"}
                                </p>
                                <button type="button"
                                  disabled={saving}
                                  onClick={() => prepareSuggestion(page.page_number, suggestion)}
                                  data-urban-qii-action="true"
                                  className="mt-2 min-h-10 rounded-xl border border-sky-300 bg-[#0b3150] px-4 py-2.5 text-xs font-bold !text-white shadow-sm hover:bg-sky-900 disabled:opacity-70">
                                  <span data-urban-qii-action-label="true" className="!text-white">Pré-preencher e revisar</span>
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
                      <button type="button" onClick={() => {
                        const shouldOpen = !formOpen;
                        if (shouldOpen) {
                          setDraft(emptyDraft(page.page_number));
                          setSelectedSuggestion(null);
                        }
                        setFormOpen(shouldOpen);
                        setConfirmed(false);
                      }}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-sky-900 hover:bg-slate-50">
                        {formOpen ? "Fechar formulário" : "Cadastrar outra categoria manualmente"}
                      </button>

                    </div>
              </div>
            );
          })() : (
            <p className="mt-3 rounded-xl border border-sky-100 bg-white px-4 py-3 text-sm text-slate-700">
              Escolha uma página no índice para visualizar suas categorias e evidências, sem deslocamentos inesperados.
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
