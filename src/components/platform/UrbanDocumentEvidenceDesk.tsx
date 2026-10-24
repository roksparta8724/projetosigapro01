import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { BookOpenCheck, FileText, Link2, Loader2, ScanText, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ProcessRecord } from "@/lib/platform";
import { buildProcessPath } from "@/lib/platform";
import { buildUrbanTextEvidence, findUrbanPdfEvidenceCandidates, isUploadedPdfDocument, suggestUrbanTextSignals, type UrbanPdfEvidenceCandidate } from "@/lib/urbanTextEvidence";
import { getSignedUrlForObjectStrict } from "@/integrations/r2/client";
import { downloadUrbanPdfBytes, extractUrbanPdfText, ensureUrbanPdfBytes, type UrbanPdfTextResult } from "@/lib/urbanPdfTextReader";
import { verifyQaExistingDocumentCopy } from "@/lib/qaExistingDocumentRecovery";
import { findUrbanDrawingMeasurements, type UrbanDrawingTarget } from "@/lib/urbanDrawingMeasurements";
import { UrbanDrawingMeasurementDesk } from "@/components/platform/UrbanDrawingMeasurementDesk";
import { UrbanGraphicRulerDesk } from "@/components/platform/UrbanGraphicRulerDesk";
import { UrbanScannedPageDesk } from "@/components/platform/UrbanScannedPageDesk";
import type { UrbanMetric } from "@/lib/urbanPrecheck";

type Props = {
  process: ProcessRecord;
  readOnly: boolean;
  allowedMetrics: Array<{ key: UrbanMetric; label: string }>;
  onUseEvidence: (metric: UrbanMetric, evidence: string) => void;
  onUseMeasurement: (target: UrbanDrawingTarget, value: number, evidence: string) => void;
};

/**
 * Reads the PDF's selectable text in the authorized analyst browser only.
 * Suggests textual dimensions and documentary excerpts; does not do OCR,
 * measure graphics, stream data to external AI or establish compliance.
 * A local QA copy is accepted only when size and SHA-256 match the record.
 */
export function UrbanDocumentEvidenceDesk({ process, readOnly, allowedMetrics, onUseEvidence, onUseMeasurement }: Props) {
  const pdfs = useMemo(
    () => process.documents.filter(isUploadedPdfDocument),
    [process.documents],
  );
  const [documentId, setDocumentId] = useState("");
  const [pageText, setPageText] = useState("1");
  const [excerpt, setExcerpt] = useState("");
  const [metric, setMetric] = useState<UrbanMetric | "">("");
  const [notice, setNotice] = useState("");
  const [readStatus, setReadStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [readProgress, setReadProgress] = useState("");
  const [extracted, setExtracted] = useState<UrbanPdfTextResult | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [scanProof, setScanProof] = useState<{page:number;text:string;documentId:string;method:"visual_double_transcription"|"browser_ocr_human_verified"}|null>(null);
  const readAbort = useRef<AbortController | null>(null);
  const qaFileInput = useRef<HTMLInputElement | null>(null);

  const selected = pdfs.find((doc) => doc.id === documentId) || null;
  const signals = useMemo(() => suggestUrbanTextSignals(excerpt), [excerpt]);
  const allowed = new Set(allowedMetrics.map((item) => item.key));
  const knownSignals = signals.filter((item) => allowed.has(item.metric));
  const foundCandidates = useMemo(
    () => (extracted ? findUrbanPdfEvidenceCandidates(extracted.pages) : [])
      .filter((candidate) => allowed.has(candidate.metric)),
    [extracted, allowedMetrics],
  );
  const drawingSuggestions = useMemo(
    () => extracted
      ? findUrbanDrawingMeasurements(extracted.pages)
        .filter(candidate => ["lot","footprint","permeable","totalFloor"].includes(candidate.target) ||
          allowed.has(candidate.target as UrbanMetric))
      : [],
    [extracted, allowedMetrics],
  );

  useEffect(() => {
    readAbort.current?.abort();
    readAbort.current = null;
    setExtracted(null);
    setPdfBytes(null);
    setScanProof(null);
    setReadStatus("idle");
    setReadProgress("");
    setDocumentId("");
    setPageText("1");
    setExcerpt("");
    setMetric("");
    setNotice("");
  }, [process.id]);

  // A replacement or new version can retain the same document id.
  // Never reuse extracted text, measurements, or human verification for old bytes.
  useEffect(() => {
    readAbort.current?.abort();
    readAbort.current = null;
    setExtracted(null);
    setPdfBytes(null);
    setScanProof(null);
    setReadStatus("idle");
    setReadProgress("");
    setExcerpt("");
    setNotice("");
  }, [selected?.id, selected?.version, selected?.fileHash, selected?.filePath]);

  const resetPdfRead = (selectedId: string) => {
    readAbort.current?.abort();
    readAbort.current = null;
    setExtracted(null);
    setPdfBytes(null);
    setScanProof(null);
    setReadStatus("idle");
    setReadProgress("");
    setPageText("1");
    setExcerpt("");
    setMetric("");
    setDocumentId(selectedId);
    setNotice("");
  };

  const preReadDocument = async () => {
    if (!selected || !selected.filePath || readStatus === "loading") {
      setNotice("Selecione um PDF anexado com arquivo original disponível.");
      return;
    }
    const controller = new AbortController();
    readAbort.current?.abort();
    readAbort.current = controller;
    setReadStatus("loading");
    setExtracted(null);setPdfBytes(null);setScanProof(null);
    setReadProgress("Solicitando acesso autenticado ao PDF...");
    setNotice("");
    try {
      // Authenticated signed URL; only the user's browser reads the bytes.
      const isolated = import.meta.env.VITE_SIGAPRO_NEON_ISOLATED === "true";
      const bucket = isolated
        ? "process-documents"
        : ((import.meta.env.VITE_R2_BUCKET_DOCUMENTOS as string | undefined) || "sigapro-documentos");
      const url = await getSignedUrlForObjectStrict({
        bucket, objectKey: selected.filePath, expiresIn: 900,
      });
      if (controller.signal.aborted) return;
      setReadProgress("Lendo o arquivo somente neste navegador...");
      const bytes = await downloadUrbanPdfBytes(url, controller.signal);
      if (controller.signal.aborted) return;
      const result = await extractUrbanPdfText(bytes.slice(), {
        signal: controller.signal,
        onProgress: (page, total) => {
          if (!controller.signal.aborted) setReadProgress("Lendo página " + page + " de " + total + "...");
        },
      });
      if (controller.signal.aborted) return;
      setExtracted(result);
      setPdfBytes(bytes);
      setReadStatus("ready");
      setReadProgress("");
      setNotice(result.scannedPages === result.pages.length
        ? "Nenhum texto selecionável encontrado. Use a conferência visual de página escaneada, com dupla transcrição e validação humana."
        : "Pré-leitura concluída. Selecione um trecho e confirme na planta original antes de vinculá-lo.");
    } catch (error) {
      if (controller.signal.aborted) return;
      setReadStatus("error");
      setReadProgress("");
      setNotice(error instanceof Error ? error.message : "O PDF não pôde ser lido localmente.");
    } finally {
      if (readAbort.current === controller) readAbort.current = null;
    }
  };

  const preReadAuthorizedLocalCopy = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || readOnly || !selected ||
        import.meta.env.VITE_SIGAPRO_NEON_ISOLATED !== "true" || readStatus === "loading") return;
    const controller = new AbortController();
    readAbort.current?.abort();
    readAbort.current = controller;
    setReadStatus("loading");
    setExtracted(null);setPdfBytes(null);setScanProof(null); setReadProgress("Verificando integridade do PDF local...");
    setNotice("");
    try {
      // Never treat an arbitrary plan as the official attachment.
      await verifyQaExistingDocumentCopy(file, {
        fileHash: selected.fileHash, fileSizeBytes: selected.fileSizeBytes,
      });
      if (controller.signal.aborted) return;
      const bytes = new Uint8Array(await file.arrayBuffer());
      ensureUrbanPdfBytes(bytes);
      const result = await extractUrbanPdfText(bytes.slice(), {
        signal: controller.signal,
        onProgress:(page,total)=>{
          if (!controller.signal.aborted) setReadProgress("Lendo cópia verificada: página " + page + " de " + total);
        },
      });
      if (controller.signal.aborted) return;
      setExtracted(result); setPdfBytes(bytes); setReadStatus("ready"); setReadProgress("");
      setNotice("Cópia local conferida por tamanho e SHA-256. Leitura temporária, sem envio ou substituição do PDF oficial. Confira as cotas na prancha original.");
    } catch (error) {
      if (controller.signal.aborted) return;
      setReadStatus("error"); setReadProgress("");
      setNotice(error instanceof Error ? error.message : "Não foi possível validar a cópia do PDF.");
    } finally {
      if (readAbort.current === controller) readAbort.current = null;
    }
  };

  const acceptDrawingSuggestion = (candidate: ReturnType<typeof findUrbanDrawingMeasurements>[number]) => {
    if (readOnly || !selected || !extracted) return;
    try {
      const evidence = buildUrbanTextEvidence({
        documentId:selected.id,
        fileName:selected.fileName || selected.label,
        documentVersion:selected.version || 1,
        fileHash:selected.fileHash,
        page:candidate.page,
        excerpt:("Cota textual conferida: " + candidate.excerpt).slice(0,125),
      });
      onUseMeasurement(candidate.target,candidate.value,evidence);
      setNotice("Valor conferido enviado ao formulário. Se já existia um preenchimento, ele foi preservado. Faça a verificação final antes de registrar.");
    } catch(error){
      setNotice(error instanceof Error ? error.message : "Não foi possível preparar a referência documental.");
    }
  };

  const acceptCalibratedDistance = (target: UrbanMetric, value: number, evidence: string) => {
    if (readOnly || !selected || !pdfBytes || !allowed.has(target)) return;
    onUseMeasurement(target, value, evidence);
    setNotice("Régua gráfica: distância indicativa encaminhada para conferência; a aprovação permanece manual.");
  };

  const useExtractedCandidate = (candidate: UrbanPdfEvidenceCandidate) => {
    if (readOnly || !selected) return;
    setPageText(String(candidate.page));
    setExcerpt(candidate.excerpt);
    setMetric(candidate.metric);
    setNotice("Trecho pré-selecionado. Confira a página no documento e confirme a medida antes de vinculá-la.");
  };

  const addEvidence = () => {
    if (!selected || !metric || !allowed.has(metric) || readOnly) {
      setNotice("Selecione o PDF, o parâmetro normativo e a página antes de registrar a origem.");
      return;
    }
    try {
      const evidence = buildUrbanTextEvidence({
        documentId: selected.id,
        fileName: selected.fileName || selected.label,
        documentVersion: selected.version || 1,
        fileHash: selected.fileHash,
        page: Number(pageText),
        excerpt: scanProof?.documentId===selected.id && scanProof.page===Number(pageText) && scanProof.text===excerpt
          ? ((scanProof.method==="browser_ocr_human_verified" ? "OCR local revisado: " : "Transcrição visual dupla, sem OCR: ")+excerpt).slice(0,280) : excerpt,
      });
      onUseEvidence(metric, evidence);
      setNotice("Origem da medida preenchida. Confirme manualmente o valor no campo do parâmetro e registre a pré-conferência quando pronto.");
    } catch (error) {
      setNotice(String((error as Error)?.message || error));
    }
  };

  return (
    <section data-urban-document-evidence="true"
      className="mt-4 overflow-hidden rounded-[22px] border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="rounded-xl border border-sky-200 bg-sky-50 p-2 dark:border-sky-700 dark:bg-sky-950">
            <BookOpenCheck className="h-5 w-5 text-sky-800 dark:text-sky-200" />
          </span>
          <div>
            <h4 className="text-sm font-extrabold text-slate-950 dark:text-white">
              Evidências dos PDFs do processo
            </h4>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600 dark:text-slate-300">
              Selecione um PDF autorizado, localize trechos na camada de texto e confira a página
              no documento original. Você também pode transcrever manualmente. A análise permanece sob responsabilidade do servidor.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
          Verificação humana
        </span>
      </div>
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
        <ShieldAlert className="mr-1 inline h-4 w-4" />
        A pré-leitura extrai somente o texto selecionável do PDF original, quando disponível.
        Ela não interpreta automaticamente cotas gráficas nem faz OCR. Páginas escaneadas podem ser transcritas visualmente; as referências
        encontradas são sugestões e nunca representam aprovação ou conformidade legal.
      </div>
      {pdfs.length === 0 ? (
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-950 dark:text-slate-300">
          Nenhum PDF enviado foi encontrado neste processo.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(200px,1.7fr)_minmax(100px,0.35fr)]">
          <label className="min-w-0 text-xs font-bold text-slate-800 dark:text-slate-100">
            Documento PDF apresentado
            <select aria-label="Documento PDF apresentado" className="mt-1 block h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
              value={documentId} onChange={(event) => resetPdfRead(event.target.value)}>
              <option value="">Selecione o PDF para consultar</option>
              {pdfs.map((doc) => (
                <option key={doc.id} value={doc.id}>{doc.fileName || doc.label} · versão {doc.version || 1}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-800 dark:text-slate-100">
            Página conferida
            <Input aria-label="Página conferida" className="mt-1" type="number" min={1} max={10000}
              value={pageText} onChange={(event) => {setPageText(event.target.value);setScanProof(null);}} />
          </label>
        </div>
      )}

      {selected ? (
        <Link to={buildProcessPath(process) + "/documentos/" + encodeURIComponent(selected.id) + "/visualizar"}
          target="_blank" rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-900 underline-offset-2 hover:underline dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100">
          <FileText className="h-4 w-4" />
          Abrir PDF original no visualizador do SIGAPRO
        </Link>
      ) : null}
      {selected && !readOnly ? (
        <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-700 dark:bg-slate-950">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-950 dark:text-white">
                <ScanText className="h-4 w-4 text-sky-700 dark:text-sky-300" />
                Pré-leitura local da camada de texto
              </p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Até 20 MB e 24 páginas. Sem envio do PDF à IA, sem OCR e sem gravar trechos no banco.
              </p>
            </div>
            <Button type="button" variant="outline" disabled={!selected.filePath || readStatus === "loading"}
              onClick={() => void preReadDocument()}
              className="border-sky-300 bg-white text-sky-950 dark:border-sky-600 dark:bg-slate-800 dark:text-white">
              {readStatus === "loading" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ScanText className="mr-2 h-4 w-4" />}
              {readStatus === "loading" ? "Lendo PDF..." : "Localizar trechos no PDF"}
            </Button>
            {import.meta.env.VITE_SIGAPRO_NEON_ISOLATED === "true" ? (
              <>
                <input ref={qaFileInput} type="file" accept=".pdf,application/pdf"
                  aria-label="Cópia local autorizada do PDF deste processo" className="sr-only"
                  onChange={event => void preReadAuthorizedLocalCopy(event)} />
                <Button type="button" variant="outline" disabled={readStatus === "loading"}
                  onClick={() => qaFileInput.current?.click()}>
                  Usar cópia verificada do computador
                </Button>
              </>
            ) : null}
          </div>
          {readProgress ? <p role="status" className="mt-2 text-xs text-sky-800 dark:text-sky-200">{readProgress}</p> : null}
          {extracted ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                {extracted.pages.length} de {extracted.totalPages} páginas verificadas ·
                {" "}{extracted.scannedPages} sem camada de texto ·
                {" "}{foundCandidates.length} possíveis referências
              </p>
              {extracted.truncated ? <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                Pré-leitura limitada às primeiras 24 páginas; continue a verificação no documento original.
              </p> : null}
              {!foundCandidates.length ? <p className="text-xs text-slate-600 dark:text-slate-300">
                Nenhum termo urbanístico reconhecido. Isso não comprova conformidade.
              </p> : null}
              <div className="max-h-80 space-y-2 overflow-auto">
                {foundCandidates.map((candidate, index) => (
                  <div key={candidate.page + "-" + candidate.metric + "-" + index}
                    className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        Página {candidate.page} · {candidate.label}
                      </p>
                      <Button type="button" size="sm" variant="outline"
                        onClick={() => useExtractedCandidate(candidate)}>
                        Conferir este trecho
                      </Button>
                    </div>
                    <p className="mt-2 break-words text-xs leading-5 text-slate-700 dark:text-slate-200">
                      {candidate.excerpt}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {extracted && pdfBytes && extracted.scannedPages > 0 ? (
            <UrbanScannedPageDesk
              key={documentId + "-scanned-" + readStatus}
              bytes={pdfBytes}
              scannedPages={extracted.pages.filter(page => !page.text).map(page => page.page)}
              readOnly={readOnly}
              onVerifiedTranscript={({page,text,method}) => {
                setPageText(String(page));
                setExcerpt(text);
                setScanProof({page,text,documentId:selected.id,method});
                setNotice((method==="browser_ocr_human_verified" ? "OCR local com revisão humana: " : "Transcrição visual dupla sem OCR: ") + "página " + page +
                  ". Selecione o parâmetro técnico e vincule a origem.");
              }}
            />
          ) : null}
          {extracted ? (
            <UrbanDrawingMeasurementDesk key={documentId + "-" + readStatus}
              suggestions={drawingSuggestions} readOnly={readOnly}
              onConfirm={acceptDrawingSuggestion} />
          ) : null}
          {extracted && pdfBytes ? (
            <UrbanGraphicRulerDesk
              key={documentId + "-" + readStatus + "-" + (selected.fileHash || selected.version || 1)}
              pdfBytes={pdfBytes}
              documentId={selected.id}
              fileName={selected.fileName || selected.label}
              documentVersion={selected.version || 1}
              fileHash={selected.fileHash}
              totalPages={extracted.totalPages}
              allowedMetrics={allowedMetrics}
              readOnly={readOnly}
              onUseMeasurement={acceptCalibratedDistance} />
          ) : null}
        </div>
      ) : null}
      <label className="mt-4 block text-xs font-bold text-slate-800 dark:text-slate-100">
        Trecho conferido na página original
        <Textarea className="mt-1 min-h-24 text-sm" value={excerpt} maxLength={280}
          disabled={readOnly || !selected} placeholder="Transcreva uma cota, item da prancha ou trecho normativo após conferir o PDF original..."
          onChange={(event) => {setExcerpt(event.target.value);setScanProof(null);}} />
      </label>
      {knownSignals.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-600 dark:text-slate-300">Assuntos encontrados no trecho:</span>
          {knownSignals.map((s) => (
            <button type="button" key={s.metric} disabled={readOnly}
              onClick={() => setMetric(s.metric)}
              className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-900 hover:bg-sky-100 disabled:opacity-60 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100">
              {s.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <label className="min-w-[210px] flex-1 text-xs font-bold text-slate-800 dark:text-slate-100">
          Campo que receberá a referência documental
          <select aria-label="Parâmetro ao qual anexar a referência" className="mt-1 block h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
            value={metric} disabled={readOnly} onChange={(event) => setMetric(event.target.value as UrbanMetric | "")}>
            <option value="">Selecione um parâmetro da norma</option>
            {allowedMetrics.map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}
          </select>
        </label>
        <Button type="button" onClick={addEvidence} disabled={!selected || readOnly || !metric || excerpt.trim().length < 10}
          className="rounded-xl bg-sky-700 text-white hover:bg-sky-800">
          <Link2 className="mr-2 h-4 w-4" />
          Vincular origem ao parâmetro
        </Button>
      </div>
      {notice ? (
        <p role="status" className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
