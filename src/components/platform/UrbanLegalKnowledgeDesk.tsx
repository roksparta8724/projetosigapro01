import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { BookText, CheckCircle2, FileSearch, Loader2, Search, ShieldCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmUrbanLegalEvidence, listUrbanLegalEvidence } from "@/integrations/backend/urbanLegalEvidenceClient";
import { ensureUrbanPdfBytes, extractUrbanPdfText, URBAN_PDF_MAX_BYTES } from "@/lib/urbanPdfTextReader";
import { extractUrbanLegalSuggestions, searchLegalEvidence, sha256Hex,
  type UrbanLegalEvidence, type UrbanLegalSuggestion } from "@/lib/urbanLegalKnowledge";
import { URBAN_METRICS, type UrbanMetric } from "@/lib/urbanPrecheck";

type Props = {
  municipalityId: string;
  canEdit: boolean;
  onUseReference: (metric: UrbanMetric, reference: string, suggestedLimit: number | null) => void;
};

function referenceForDraft(title: string, hash: string, page: number, excerpt: string): string {
  return ("Documento: " + title.slice(0, 110) + "; página " + page +
    "; SHA-256 " + hash.slice(0, 16) + "; trecho: " + excerpt.slice(0, 220)).slice(0, 490);
}

/** Client-only PDF parsing; only admin-confirmed 500-character snippets are saved. */
export function UrbanLegalKnowledgeDesk({ municipalityId, canEdit, onUseReference }: Props) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState("");
  const [fileHash, setFileHash] = useState("");
  const [suggestions, setSuggestions] = useState<UrbanLegalSuggestion[]>([]);
  const [pagesRead, setPagesRead] = useState(0);
  const [pagesTotal, setPagesTotal] = useState(0);
  const [emptyPages, setEmptyPages] = useState(0);
  const [reading, setReading] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const [confirmedKey, setConfirmedKey] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [saved, setSaved] = useState<UrbanLegalEvidence[]>([]);
  const [loading, setLoading] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const list = await listUrbanLegalEvidence(municipalityId);
    setSaved(list);
    setCatalogError("");
  }, [municipalityId]);

  useEffect(() => {
    const request = ++requestId.current;
    setSaved([]); setFileHash(""); setSuggestions([]); setTitle("");
    setCatalogError(""); setNotice(""); setConfirmedKey("");
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
    setSuggestions([]); setFileHash(""); setConfirmedKey(""); setNotice("");
    setPagesTotal(0); setPagesRead(0); setEmptyPages(0);
    if (!/\.pdf$/i.test(file.name) || file.size > URBAN_PDF_MAX_BYTES || file.size < 5) {
      setNotice("Selecione um PDF válido de legislação com até 20 MB."); return;
    }
    setReading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      ensureUrbanPdfBytes(bytes);
      const hash = await sha256Hex(bytes);
      const result = await extractUrbanPdfText(bytes);
      setFileHash(hash);
      setTitle(file.name.slice(0, 180));
      setPagesTotal(result.totalPages); setPagesRead(result.pages.length);
      setEmptyPages(result.scannedPages);
      setSuggestions(extractUrbanLegalSuggestions(result.pages));
      setNotice(result.scannedPages === result.pages.length
        ? "O PDF não contém texto selecionável nas páginas verificadas. É necessário OCR ou consulta manual."
        : result.truncated
          ? "Somente as primeiras 24 páginas foram lidas. Confira as demais páginas no documento original."
          : "Trechos localizados. Confira cada artigo e condição antes de confirmar uma referência.");
    } catch (error) {
      setNotice("Não foi possível ler a legislação: " + String((error as Error)?.message || error));
    } finally { setReading(false); }
  };

  const save = async (candidate: UrbanLegalSuggestion, key: string) => {
    if (!canEdit || !fileHash || !municipalityId || savingKey || confirmedKey !== key) return;
    setSavingKey(key); setNotice("");
    try {
      await confirmUrbanLegalEvidence({
        municipalityId, documentTitle: title, documentSha256: fileHash,
        pageNumber: candidate.page, metric: candidate.metric, excerpt: candidate.excerpt,
      });
      await refresh();
      setConfirmedKey("");
      setNotice("Trecho confirmado no acervo municipal da homologação. Não ativa nem altera limites legais.");
    } catch (error) {
      setNotice(String((error as Error)?.message || error));
    } finally { setSavingKey(""); }
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
                        disabled={savingKey !== "" || confirmedKey !== key || !title.trim() || Boolean(catalogError)}
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
              <p className="mt-2 break-words text-xs leading-5 text-slate-800 dark:text-slate-100">{item.excerpt}</p>
              {canEdit ? <Button type="button" size="sm" variant="outline" className="mt-2"
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
