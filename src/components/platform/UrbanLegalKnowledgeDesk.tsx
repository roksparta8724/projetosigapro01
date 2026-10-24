import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { BookText, CheckCircle2, FileSearch, Loader2, Search, ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmUrbanLegalEvidence, listUrbanLegalEvidence } from "@/integrations/backend/urbanLegalEvidenceClient";
import { ensureUrbanPdfBytes, extractUrbanPdfText, URBAN_PDF_MAX_BYTES, type UrbanPdfPageText } from "@/lib/urbanPdfTextReader";
import { UrbanScannedPageDesk } from "@/components/platform/UrbanScannedPageDesk";
import { normalizeUrbanScanTranscript } from "@/lib/urbanScannedTranscription";
import { excerptOccursOnPage, extractUrbanLegalSuggestions, searchLegalEvidence, sha256Hex,
  type UrbanLegalEvidence, type UrbanLegalSuggestion } from "@/lib/urbanLegalKnowledge";
import { URBAN_METRICS, type UrbanMetric } from "@/lib/urbanPrecheck";
import { urbanLegalScopeMatchesDraft, validateUrbanLegalScope, type UrbanLegalScopeDraft } from "@/lib/urbanLegalScope";

type Props = {
  municipalityId: string;
  canEdit: boolean;
  onUseReference: (metric: UrbanMetric, reference: string, suggestedLimit: number | null) => void;
  scope?: UrbanLegalScopeDraft;
};

function referenceForDraft(title: string, hash: string, page: number, excerpt: string): string {
  return ("Documento: " + title.slice(0, 110) + "; página " + page +
    "; SHA-256 " + hash.slice(0, 16) + "; trecho: " + excerpt.slice(0, 220)).slice(0, 490);
}

/** Client-only PDF parsing; only admin-confirmed 500-character snippets are saved. */
export function UrbanLegalKnowledgeDesk({ municipalityId, canEdit, onUseReference, scope }: Props) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState("");
  const [fileHash, setFileHash] = useState("");
  const [suggestions, setSuggestions] = useState<UrbanLegalSuggestion[]>([]);
  const [pdfPages, setPdfPages] = useState<UrbanPdfPageText[]>([]);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array|null>(null);
  const [scannedProof, setScannedProof] = useState<{page:number;text:string;hash:string;method:"visual_double_transcription"|"browser_ocr_human_verified"}|null>(null);
  const [manualPage, setManualPage] = useState("1");
  const [manualMetric, setManualMetric] = useState<UrbanMetric>("front_setback_m");
  const [manualExcerpt, setManualExcerpt] = useState("");
  const [manualConfirmed, setManualConfirmed] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [pagesRead, setPagesRead] = useState(0);
  const [pagesTotal, setPagesTotal] = useState(0);
  const [emptyPages, setEmptyPages] = useState(0);
  const [reading, setReading] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [confirmedKey, setConfirmedKey] = useState("");
  const [notice, setNotice] = useState("");
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const confirmedScope: UrbanLegalScopeDraft | null = scope ? { ...scope, effectiveUntil } : null;
  const scopeProblem = confirmedScope ? validateUrbanLegalScope(confirmedScope) : "Selecione uma zona, uso e data de vigência para vincular a fonte legal.";
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState<UrbanLegalEvidence[]>([]);
  const [loading, setLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const requestId = useRef(0);

  // Changing zone, use or reference date invalidates a previous human confirmation.
  useEffect(() => {
    setConfirmedKey("");
    setManualConfirmed(false);
  }, [scope?.zoneCode, scope?.useCode, scope?.effectiveFrom, effectiveUntil]);

  const refresh = useCallback(async () => {
    const list = await listUrbanLegalEvidence(municipalityId);
    setSaved(list);
    setCatalogError("");
  }, [municipalityId]);

  useEffect(() => {
    const request = ++requestId.current;
    setSaved([]); setFileHash(""); setSuggestions([]); setPdfPages([]); setPdfBytes(null); setScannedProof(null); setTitle("");
    setCatalogError(""); setNotice(""); setConfirmedKey(""); setEffectiveUntil("");
    if (!municipalityId) return;
    setLoading(true);
    void listUrbanLegalEvidence(municipalityId)
      .then(list => { if (requestId.current === request) setSaved(list); })
      .catch(error => { if (requestId.current === request) setCatalogError(String((error as Error)?.message || error)); })
      .finally(() => { if (requestId.current === request) setLoading(false); });
    return () => { requestId.current++; };
  }, [municipalityId]);

  const readPdf = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !canEdit || reading) return;
    setSuggestions([]); setPdfPages([]); setPdfBytes(null); setScannedProof(null); setFileHash(""); setConfirmedKey(""); setNotice("");
    setManualExcerpt(""); setManualPage("1"); setManualConfirmed(false);
    setPagesTotal(0); setPagesRead(0); setEmptyPages(0);
    if (!/\.pdf$/i.test(file.name) || file.size > URBAN_PDF_MAX_BYTES || file.size < 5) {
      setNotice("Selecione um PDF válido de legislação com até 20 MB."); return;
    }
    setReading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      ensureUrbanPdfBytes(bytes);
      const hash = await sha256Hex(bytes);
      const result = await extractUrbanPdfText(bytes.slice());
      setFileHash(hash);
      setTitle(file.name.slice(0, 180));
      setPagesTotal(result.totalPages); setPagesRead(result.pages.length);
      setEmptyPages(result.scannedPages);
      setPdfPages(result.pages);
      setPdfBytes(bytes);
      setSuggestions(extractUrbanLegalSuggestions(result.pages));
      setNotice(result.scannedPages === result.pages.length
        ? "O PDF não contém texto selecionável. Utilize a conferência visual ampliada e a dupla transcrição humana das páginas escaneadas."
        : result.truncated
          ? "Somente as primeiras 24 páginas foram lidas. Confira as demais páginas no documento original."
          : "Trechos localizados. Confira cada artigo e condição antes de confirmar uma referência.");
    } catch (error) {
      setNotice("Não foi possível ler a legislação: " + String((error as Error)?.message || error));
    } finally { setReading(false); }
  };

  const save = async (candidate: UrbanLegalSuggestion, key: string) => {
    if (!canEdit || !fileHash || !municipalityId || savingKey || confirmedKey !== key || !confirmedScope || scopeProblem) return;
    setSavingKey(key); setNotice("");
    try {
      await confirmUrbanLegalEvidence({
        municipalityId, documentTitle: title, documentSha256: fileHash,
        pageNumber: candidate.page, metric: candidate.metric, excerpt: candidate.excerpt,
        scope: confirmedScope,
      });
      await refresh();
      setConfirmedKey("");
      setNotice("Trecho vinculado à zona, uso e vigência no acervo QA. Ainda não ativa limites legais.");
    } catch (error) {
      setNotice(String((error as Error)?.message || error));
    } finally { setSavingKey(""); }
  };

  const saveManualEvidence = async () => {
    if (!canEdit || !manualConfirmed || !fileHash || !municipalityId || manualSaving || !confirmedScope || scopeProblem) return;
    const page = Number(manualPage);
    const textLayerVerified = excerptOccursOnPage(pdfPages, page, manualExcerpt);
    const scanDoubleVerified = scannedProof?.page === page &&
      scannedProof.hash === fileHash &&
      scannedProof.text === normalizeUrbanScanTranscript(manualExcerpt) &&
      pdfPages.some(entry => entry.page === page && !entry.text.trim());
    if (!textLayerVerified && !scanDoubleVerified) {
      setNotice("A citação precisa corresponder literalmente ao texto da página ou ter dupla transcrição visual verificada de página escaneada.");
      return;
    }
    setManualSaving(true); setNotice("");
    try {
      await confirmUrbanLegalEvidence({
        municipalityId, documentTitle:title, documentSha256:fileHash,
        pageNumber:page, metric:manualMetric, excerpt:manualExcerpt.trim(),
        scope:confirmedScope,
        verificationMethod: scanDoubleVerified ? scannedProof.method : "text_layer_verified",
      });
      await refresh();
      setManualConfirmed(false);
      setManualExcerpt("");setScannedProof(null);
      setNotice(scanDoubleVerified
        ? "Trecho de página escaneada registrado como transcrição visual dupla no histórico do acervo QA. Não ativa norma."
        : "Trecho literal vinculado à zona, uso e vigência no acervo QA. Não altera norma ativa.");
    } catch (error) {
      setNotice(String((error as Error)?.message || error));
    } finally { setManualSaving(false); }
  };

  const filtered = useMemo(() => searchLegalEvidence(saved, search), [saved, search]);
  return (
    <section data-urban-legal-knowledge="true"
      className="mt-6 min-w-0 rounded-[22px] border border-sky-200 bg-slate-50 p-4 text-slate-900 dark:border-sky-600/50 dark:bg-[#0d2136] dark:text-slate-100 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="flex items-center gap-2 text-sm font-extrabold text-slate-950 dark:text-white">
            <BookText className="h-5 w-5 text-sky-700 dark:text-sky-300" />
            SIGAPRO IA — Acervo legal pesquisável
          </h4>
          <p className="mt-1 max-w-3xl text-xs leading-6 text-slate-600 dark:text-slate-300">
            Referências confirmadas por prefeitura, com título, página e SHA-256 do PDF.
            Documentos são lidos no navegador e não enviados a modelos externos de IA.
          </p>
        </div>
        <span className="rounded-full border border-sky-300 px-3 py-1 text-xs font-bold text-sky-900 dark:border-sky-700 dark:text-sky-200">
          {saved.length} trecho(s) na base
        </span>
      </div>

      {canEdit ? (
        <div className="mt-4 rounded-xl border border-sky-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">Pré-ler uma lei municipal em PDF</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Até 20 MB / primeiras 24 páginas. Use somente uma cópia da legislação pública autorizada.</p>
            </div>
            <input ref={fileInput} type="file" accept="application/pdf,.pdf"
              aria-label="Selecionar legislação municipal PDF" className="sr-only"
              onChange={(event) => void readPdf(event)} />
            <Button type="button" variant="outline" disabled={reading || loading}
              onClick={() => fileInput.current?.click()}>
              {reading ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <FileSearch className="mr-2 h-4 w-4" />}
              {reading ? "Lendo a lei..." : "Selecionar PDF da legislação"}
            </Button>
          </div>
          <div data-urban-legal-scope="true"
            className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-600 dark:bg-[#112a43]">
            <p className="text-xs font-extrabold text-slate-900 dark:text-white">Aplicabilidade da referência — vínculo obrigatório</p>
            <p className="mt-1 text-xs leading-5 text-slate-700 dark:text-slate-200">
              O trecho será vinculado somente à zona, uso e período confirmados abaixo.
              Leis gerais e exceções de outros setores devem ser vinculadas separadamente após conferência.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <p className="rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-900 dark:border-slate-600 dark:bg-[#091d30] dark:text-white">
                Zona: <strong>{scope?.zoneCode || "Não informada"}</strong> · Uso: <strong>{scope?.useCode || "Não informado"}</strong>
              </p>
              <p className="rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-900 dark:border-slate-600 dark:bg-[#091d30] dark:text-white">
                Vigente desde: <strong>{scope?.effectiveFrom || "Não informado"}</strong>
              </p>
            </div>
            <label className="mt-2 block text-xs font-bold text-slate-800 dark:text-slate-100">
              Último dia da vigência, se já revogada ou substituída
              <Input aria-label="Fim da vigência da fonte legal" type="date" className="mt-1 max-w-xs"
                value={effectiveUntil} onChange={event => {setEffectiveUntil(event.target.value);setConfirmedKey("");setManualConfirmed(false);}} />
            </label>
            {scopeProblem ? <p role="alert" className="mt-2 text-xs font-bold text-amber-800 dark:text-amber-200">{scopeProblem}</p> : null}
          </div>
          {fileHash && (
            <div className="mt-3 space-y-3">
              <p className="break-words text-xs text-slate-600 dark:text-slate-300">
                Arquivo: <strong>{title}</strong> · SHA-256: {fileHash.slice(0,20)}… ·
                {pagesRead} de {pagesTotal} página(s) · {emptyPages} sem texto
              </p>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-100">
                Identificação da lei (confira antes de salvar)
                <Input className="mt-1" maxLength={180} aria-label="Título confirmado da legislação"
                  value={title} onChange={event => setTitle(event.target.value)} />
              </label>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-[#132e48]">
                <p className="text-xs font-bold text-slate-950 dark:text-white">
                  Referência manual verificada no PDF
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                  Para artigos que não foram reconhecidos, transcreva literalmente um trecho presente na página.
                  O SIGAPRO verifica o texto selecionável contra o PDF. Para páginas apenas digitalizadas,
                  exige duas transcrições coincidentes e revisão administrativa antes de gravar.
                </p>
                <div className="mt-3 grid gap-2 md:grid-cols-[110px_minmax(0,1fr)]">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Página
                    <Input type="number" min={1} max={pagesRead} className="mt-1"
                      value={manualPage} onChange={event => {setManualPage(event.target.value);setManualConfirmed(false);setScannedProof(null);}}
                      aria-label="Página da citação manual"/>
                  </label>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    Assunto
                    <select className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-slate-950 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                      value={manualMetric} aria-label="Assunto da citação manual"
                      onChange={event => {setManualMetric(event.target.value as UrbanMetric);setManualConfirmed(false);}}>
                      {URBAN_METRICS.map(metric => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
                    </select>
                  </label>
                </div>
                <label className="mt-2 block text-xs font-bold text-slate-700 dark:text-slate-200">
                  Texto da página, literalmente
                  <textarea className="mt-1 min-h-24 w-full rounded-md border border-slate-300 bg-white p-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                    maxLength={500} value={manualExcerpt} aria-label="Trecho literal da legislação"
                    onChange={event => {setManualExcerpt(event.target.value);setManualConfirmed(false);setScannedProof(null);}}
                    placeholder="Copie uma frase do PDF, sem completar ou inventar texto..." />
                </label>
                <label className="mt-2 flex items-start gap-2 text-xs text-slate-800 dark:text-slate-100">
                  <input type="checkbox" checked={manualConfirmed}
                    onChange={event=>setManualConfirmed(event.target.checked)} className="mt-0.5"/>
                  Revisei o artigo completo, a página, a legislação e confirmo a referência literal.
                </label>
                <Button type="button" variant="outline" className="mt-2"
                  disabled={!manualConfirmed || manualSaving || Boolean(catalogError) || Boolean(scopeProblem)}
                  onClick={() => void saveManualEvidence()}>
                  {manualSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ShieldCheck className="mr-2 h-4 w-4"/>}
                  Confirmar referência manual
                </Button>
              </div>
              {pdfBytes && pdfPages.some(page => !page.text.trim()) ? (
                <UrbanScannedPageDesk
                  key={fileHash}
                  bytes={pdfBytes}
                  scannedPages={pdfPages.filter(page => !page.text.trim()).map(page => page.page)}
                  readOnly={!canEdit}
                  onVerifiedTranscript={({page,text,method}) => {
                    setManualPage(String(page));
                    setManualExcerpt(text);
                    setScannedProof({page,text,hash:fileHash,method});
                    setManualConfirmed(false);
                    setNotice((method==="browser_ocr_human_verified" ? "OCR local revisado da lei, " : "Transcrição visual dupla da lei, ") + "página " + page +
                      ". Selecione o assunto, confira a legislação integral e confirme a referência antes de gravar.");
                  }}
                />
              ) : null}
              {suggestions.length === 0 ? <p className="text-xs text-amber-800 dark:text-amber-200">
                Nenhum trecho urbanístico reconhecido na parte lida. O documento ainda exige leitura humana.
              </p> : null}
              <div className="max-h-[550px] space-y-2 overflow-y-auto">
                {suggestions.map((item, index) => {
                  const key = item.page + ":" + item.metric + ":" + index;
                  return (
                    <article key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-[#132e48]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-bold text-slate-900 dark:text-white">
                          Pág. {item.page} · {item.label}
                          {item.suggestedLimit !== null ? " · possível limite: " + item.suggestedLimit : ""}
                        </p>
                        {item.suggestedLimit !== null ? (
                          <Button size="sm" type="button" variant="outline"
                            disabled={Boolean(scopeProblem) || confirmedKey !== key}
                            onClick={() => onUseReference(item.metric,
                              referenceForDraft(title,fileHash,item.page,item.excerpt),item.suggestedLimit)}>
                            Preencher proposta de rascunho
                          </Button>
                        ) : null}
                      </div>
                      <p className="mt-2 break-words text-xs leading-5 text-slate-700 dark:text-slate-200">{item.excerpt}</p>
                      <p className="mt-1 text-xs text-amber-800 dark:text-amber-200">{item.uncertainty}</p>
                      <label className="mt-3 flex items-start gap-2 text-xs font-medium text-slate-800 dark:text-slate-100">
                        <input type="checkbox" checked={confirmedKey === key}
                          onChange={e => setConfirmedKey(e.target.checked ? key : "")} className="mt-0.5" />
                        Li o artigo integral e confirmo que este trecho corresponde ao PDF e à página indicados.
                      </label>
                      <Button type="button" size="sm" className="mt-2 rounded-lg bg-sky-700 text-white hover:bg-sky-800"
                        disabled={savingKey !== "" || confirmedKey !== key || !title.trim() || Boolean(catalogError) || Boolean(scopeProblem)}
                        onClick={() => void save(item,key)}>
                        {savingKey === key ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <ShieldCheck className="mr-2 h-4 w-4"/>}
                        Confirmar trecho no acervo municipal
                      </Button>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : null}

      <div className="mt-5">
        <label className="block text-xs font-bold text-slate-800 dark:text-slate-100">
          Pesquisar legislação confirmada neste município
          <div className="relative mt-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" aria-hidden="true"/>
            <Input aria-label="Pesquisar acervo legal" value={search}
              onChange={event => setSearch(event.target.value)}
              className="pl-9" placeholder="Ex.: recuo frontal, página, lei, ocupação..." />
          </div>
        </label>
        {loading ? <p role="status" className="mt-2 text-xs text-slate-600 dark:text-slate-300">Consultando acervo municipal...</p> : null}
        {catalogError ? <p role="alert" className="mt-3 rounded-xl border border-rose-500/40 bg-rose-950/70 p-3 text-xs text-white">
          <ShieldAlert className="mr-1 inline h-4 w-4"/>{catalogError}
        </p> : null}
        {!loading && !catalogError && filtered.length === 0 ? <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
          Nenhum trecho confirmado encontrado neste município. A base não é treinada automaticamente.
        </p> : null}
        <div className="mt-3 max-h-[400px] space-y-2 overflow-y-auto">
          {filtered.map(item => (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-[#132e48]">
              <p className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300"/>
                {URBAN_METRICS.find(metric => metric.key === item.metric)?.label || item.metric}
                · página {item.page_number}
              </p>
              <p className="mt-1 break-words text-xs text-slate-600 dark:text-slate-300">
                {item.document_title} · SHA-256 {item.document_sha256.slice(0,20)}…
              </p>
              <p className="mt-1 break-words text-xs font-semibold text-sky-800 dark:text-sky-200">
                Zona {item.zone_code} · uso {item.use_code} · vigência {item.effective_from}
                {item.effective_until ? " até " + item.effective_until : " (sem data final cadastrada)"}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-300">
                Origem da leitura: {item.verification_method === "browser_ocr_human_verified" ? "OCR nativo com revisão humana" :
                  item.verification_method === "visual_double_transcription"
                  ? "transcrição visual dupla conferida por servidor (sem OCR)"
                  : "camada de texto PDF conferida"}
              </p>
              <p className="mt-2 break-words text-xs leading-5 text-slate-800 dark:text-slate-100">{item.excerpt}</p>
              {canEdit ? <Button type="button" size="sm" variant="outline" className="mt-2"
                disabled={!confirmedScope || !urbanLegalScopeMatchesDraft(item, confirmedScope)}
                title={!confirmedScope || !urbanLegalScopeMatchesDraft(item, confirmedScope) ? "Referência pertence a outra zona, uso ou período" : "Usar referência confirmada"}
                onClick={() => onUseReference(item.metric, referenceForDraft(
                  item.document_title,item.document_sha256,item.page_number,item.excerpt),null)}>
                Usar citação no rascunho
              </Button> : null}
            </article>
          ))}
        </div>
      </div>
      {notice ? <p role="status" className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-slate-800 dark:border-sky-700 dark:bg-slate-900 dark:text-slate-100">{notice}</p> : null}
    </section>
  );
}
