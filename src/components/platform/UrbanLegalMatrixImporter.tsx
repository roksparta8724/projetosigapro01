import { useEffect, useRef, useState } from "react";
import { BookText, CheckCircle2, FileText, Loader2, ShieldAlert } from "lucide-react";
import { backendClient } from "@/integrations/backend/databaseClient";
import { normalizeUrbanCode, URBAN_METRICS, type UrbanMetric } from "@/lib/urbanPrecheck";
import { extractLiteralCandidates, parsedLiteralNumber, validateImportDate,
  type ImportQuadro, type UrbanExtractedCandidate } from "@/lib/urbanMatrixImport";
import { reconcileUrbanOcr, type OcrReconciliation } from "@/lib/urbanOcrReconciliation";
import { URBAN_VISION_FIELDS, type UrbanVisionFieldKey } from "@/lib/urbanVisionStructured";
import { compareUrbanVisionDrafts, auditExpertAgainstArchivedRow, type UrbanDiagnosticRow } from "@/lib/urbanVisionDiagnostic";
import { UrbanMatrixBatchReviewBoard } from "./UrbanMatrixBatchReviewBoard";
import { UrbanMatrixArchivePanel, type UrbanStoredDraft } from "./UrbanMatrixArchivePanel";

type Props = { municipalityId: string; canEdit: boolean; onSaved: () => Promise<void> };
type SavedSnapshot = { id: string; version: number; quadro: ImportQuadro; zone_code: string;
  use_code: string; page_number: number; status: string; document_title: string };
type ExtractionReply = { candidates?: unknown; error?: string; quadro?: ImportQuadro;
  status?: string; automaticallyActivated?: boolean };
type VisionReply = { draftText?:unknown; error?:string;
  status?:string;recognizable?:number;total?:number;unrecognized?:string[];
  warning?:string;ocrPreview?:string;code?:string;diagnosticCode?:string;
  fieldKey?:string;read?:string|null };
type ReviewPackageRow = {
  pagina_pdf: number; zona_conforme_tabela: string; uso_predominante_conforme_tabela: string;
  ca_minimo_original: string | null; ca_basico_original: string; ca_maximo_original: string;
  taxa_ocupacao_maxima_pct: number; taxa_permeabilidade_minima_pct: number;
  lote_minimo_m2: number; testada_minima_m: number; gabarito_original: string;
  recuo_frontal_m: number; recuo_fundos_m: number; recuo_lateral_m: number | string;
  observacoes_especificas: string; pendencias_de_leitura: string;
};
type ReviewPackage = {
  tipo: string; municipio: string; arquivo_sha256: string;
  nao_ativar_regras_automaticamente: true; quadro_I: ReviewPackageRow[];
};
function validReviewRow(value: unknown): value is ReviewPackageRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.pagina_pdf === "number" && Number.isSafeInteger(row.pagina_pdf) && Number(row.pagina_pdf)>0 &&
    Number(row.pagina_pdf)<=10000 &&
    ["zona_conforme_tabela","uso_predominante_conforme_tabela","ca_basico_original",
      "ca_maximo_original","gabarito_original","observacoes_especificas",
      "pendencias_de_leitura"].every(key =>
        typeof row[key] === "string" && (row[key] as string).length <= 500) &&
    typeof row.zona_conforme_tabela === "string" && row.zona_conforme_tabela.trim().length>0 &&
    typeof row.uso_predominante_conforme_tabela === "string" &&
    row.uso_predominante_conforme_tabela.trim().length>0 &&
    (row.ca_minimo_original === null || typeof row.ca_minimo_original === "string") &&
    ["taxa_ocupacao_maxima_pct","taxa_permeabilidade_minima_pct",
      "lote_minimo_m2","testada_minima_m","recuo_frontal_m","recuo_fundos_m"]
      .every(key => typeof row[key] === "number" && Number.isFinite(row[key] as number) && Number(row[key])>=0) &&
    (typeof row.recuo_lateral_m === "string" ||
      (typeof row.recuo_lateral_m === "number" && Number.isFinite(row.recuo_lateral_m)));
}

function OcrReferenceComparison({row,analysis,preparedText,onPrepareVerified,onInvalidatePrepared}:{
  row:ReviewPackageRow;analysis:OcrReconciliation|null;preparedText:string|null;
  onPrepareVerified:(verifiedText:string)=>void;onInvalidatePrepared:()=>void;
}) {
  // Local-only, explicit per-cell human verification. Reset on document/row
  // changes through the keyed component: never reuse approvals across tenants.
  const [confirmedCells,setConfirmedCells]=useState<string[]>([]);
  const [sourceAttested,setSourceAttested]=useState(false);
  const values:[string,string][]=[
    ["C.A. mínimo",row.ca_minimo_original??"A CONFERIR"],
    ["C.A. básico",row.ca_basico_original],["C.A. máximo",row.ca_maximo_original],
    ["Ocupação máxima",String(row.taxa_ocupacao_maxima_pct)+"%"],
    ["Permeabilidade mínima",String(row.taxa_permeabilidade_minima_pct)+"%"],
    ["Lote mínimo",String(row.lote_minimo_m2)+" m²"],
    ["Testada mínima",String(row.testada_minima_m)+" m"],
    ["Gabarito",row.gabarito_original],
    ["Recuo frontal",String(row.recuo_frontal_m)+" m"],
    ["Recuo de fundos",String(row.recuo_fundos_m)+" m"],
    ["Recuo lateral",String(row.recuo_lateral_m)+" m"],
  ];
  const referenceCells:[string,string][]=[
    ["Zona",row.zona_conforme_tabela],
    ["Uso",row.uso_predominante_conforme_tabela],
    ...values,
  ];
  const reviewBlocked=Boolean(row.pendencias_de_leitura?.trim()) ||
    row.ca_minimo_original===null || values.some(([,value])=>!value.trim()||/\bA CONFERIR\b/i.test(value));
  const allCellsSelected=confirmedCells.length===referenceCells.length;
  const canPrepare=!reviewBlocked && sourceAttested &&
    referenceCells.every(([label])=>confirmedCells.includes(label));
  const statusLabel=(status:string)=>status==="match"?"Coincide — conferir no PDF":
    status==="divergent"?"DIVERGENTE":status==="ambiguous"?"AMBÍGUO":
    status==="unreadable"?"ILEGÍVEL":"NÃO IDENTIFICADO";
  return <section data-urban-ocr-comparison="true"
    aria-label="Conferência dos parâmetros com o PDF"
    className="mt-5 overflow-hidden rounded-2xl border border-slate-300 bg-white p-3 text-slate-950 shadow-sm sm:p-4">
    <div data-urban-ocr-premium-header="true" className="rounded-xl border border-sky-800 bg-slate-950 p-4 text-white sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p data-urban-ocr-premium-eyebrow="true" className="text-xs font-extrabold uppercase tracking-[0.15em] text-sky-200">Matriz de evidências · quadro I</p>
          <h5 className="mt-1 text-lg font-extrabold leading-6 text-white">Comparação de colunas — PDF × matriz histórica</h5>
        </div>
        <span data-urban-ocr-premium-badge="true" className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-bold text-white">
          Revisão humana obrigatória
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-100">
        Página {row.pagina_pdf} · {row.zona_conforme_tabela} · {row.uso_predominante_conforme_tabela}
      </p>
    </div>
    <p className="mt-4 text-sm leading-6 text-slate-800">
      Estes valores vieram do pacote JSON da lei original.
      Não são valores confirmados pela IA nem comprovação da vigência atual.
      Compare cada coluna com a imagem antes de corrigir a transcrição acima.
    </p>
    {analysis ? <div data-urban-ocr-kpis="true" className="mt-3 grid gap-2 sm:grid-cols-3">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-950">
        <span className="block text-xs font-extrabold uppercase tracking-wide">Correspondências textuais</span>
        <strong className="mt-1 block text-2xl font-extrabold">{analysis.matches} / {analysis.matches+analysis.unresolved}</strong>
        <span className="text-xs font-semibold">Ainda exigem fonte oficial</span>
      </div>
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-rose-950">
        <span className="block text-xs font-extrabold uppercase tracking-wide">Células pendentes</span>
        <strong className="mt-1 block text-2xl font-extrabold">{analysis.unresolved}</strong>
        <span className="text-xs font-semibold">Divergentes, ausentes ou ambíguas</span>
      </div>
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sky-950">
        <span className="block text-xs font-extrabold uppercase tracking-wide">Situação jurídica</span>
        <strong className="mt-2 block text-base font-extrabold">Não verificada</strong>
        <span className="text-xs font-semibold">Vigência e exceções pendentes</span>
      </div>
    </div>:null}
    {analysis ? <div data-urban-ocr-reconciliation-summary="true"
      className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold leading-6 text-amber-950">
      Correspondência literal identificada: {analysis.matches} de {analysis.matches+analysis.unresolved}
      (inclui zona e uso). {analysis.complete
        ?"Os campos nomeados coincidem com o pacote histórico; a vigência e a conferência humana continuam pendentes."
        :"Existem diferenças ou campos sem identificação. Corrija a transcrição somente com o PDF original. A extração permanece bloqueada."}
      {analysis.warnings.map((warning,i)=><p key={i} className="mt-1 font-semibold">{warning}</p>)}
      <div className="mt-2 space-y-1">
        {analysis.scope.map(scope=><p key={scope.label}>
          <strong>{scope.label}:</strong> original {scope.expected} · IA {scope.read??"Não encontrado"} · {statusLabel(scope.status)}
        </p>)}
      </div>
    </div> : <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-950">
      {preparedText
        ? "Transcrição preparada por conferência humana, não pela IA. Valores conferidos na página, mas vigência e exceções continuam pendentes."
        : "A IA ainda não forneceu transcrição estruturada. Use os valores históricos para conferir as células no PDF; nenhuma regra foi aprovada."}
    </p>}
    <details data-urban-ocr-detailed-comparison="true" open={Boolean(analysis)}
      className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <summary className="cursor-pointer bg-slate-50 px-4 py-3 text-sm font-bold text-sky-950">
        Comparação detalhada dos 11 índices — expandir ou recolher
      </summary>
      <div className="max-w-full overflow-x-auto">
        <table className="w-full min-w-[700px] border-collapse text-left text-sm text-slate-950">
        <thead className="bg-slate-100">
          <tr><th scope="col" className="p-3 font-extrabold">Parâmetro</th>
            <th scope="col" className="p-2 font-bold">JSON (original)</th>
            <th scope="col" className="p-2 font-bold">Leitura IA</th>
            <th scope="col" className="p-2 font-bold">Situação</th></tr>
        </thead>
        <tbody>{values.map(([label,value],i)=>{
          const field=analysis?.fields[i];
          return <tr key={label} className="border-t border-slate-200" data-urban-ocr-field={field?.key||String(i)}>
            <th scope="row" className="max-w-[180px] break-words p-3 font-semibold">{label}</th>
            <td className="max-w-[190px] break-words p-3 font-bold">{value}</td>
            <td className="max-w-[190px] break-words p-3">{field?.read??"—"}</td>
            <td className="max-w-[220px] break-words p-3 font-bold">
              <span data-urban-ocr-verdict={!field?"pending":field.status==="match"?"match":"attention"} className={"inline-flex rounded-lg border px-2 py-1 text-xs font-extrabold leading-5 "+(
                !field?"border-slate-300 bg-slate-50 text-slate-800":
                field.status==="match"?"border-emerald-300 bg-emerald-50 text-emerald-950":
                "border-rose-300 bg-rose-50 text-rose-950")}>
                {field?statusLabel(field.status):"Conferir na imagem"}
              </span>
            </td>
          </tr>;
        })}</tbody>
        </table>
      </div>
    </details>
    {row.observacoes_especificas?<p className="mt-3 text-sm font-semibold text-amber-950">
      Observações e exceções originais: {row.observacoes_especificas}
    </p>:null}
    {row.pendencias_de_leitura?<p className="mt-2 text-sm font-bold text-rose-950">
      Pendência da leitura original: {row.pendencias_de_leitura}
    </p>:null}
    <div data-urban-matrix-manual-verification="true"
      className="mt-5 rounded-xl border border-sky-300 bg-sky-50 p-4 text-slate-950">
      <h6 className="text-base font-extrabold text-slate-950">Conferência assistida pelo PDF — sem depender da IA</h6>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-800">
        O pacote JSON passou pela conferência SHA-256 com o PDF selecionado.
        Marque apenas as células que você conferiu visualmente na página original,
        uma por uma. Isso não confirma vigência legal nem ativa índices.
      </p>
      <p data-urban-matrix-manual-progress="true" role="status"
        className="mt-2 text-sm font-extrabold text-sky-900">
        {confirmedCells.length} de {referenceCells.length} células conferidas
      </p>
      <label className="mt-3 flex items-start gap-2 rounded-lg border border-sky-200 bg-white p-3 text-sm font-semibold leading-6 text-slate-950">
        <input type="checkbox" checked={sourceAttested}
          onChange={e=>{onInvalidatePrepared();setSourceAttested(e.target.checked);}}
          className="mt-1 h-4 w-4 shrink-0 accent-sky-800"/>
        Conferi pessoalmente a página oficial, a linha, os cabeçalhos e as unidades.
        Sei que os valores são históricos e que a legislação vigente ainda precisa ser comprovada.
      </label>
      <div data-urban-manual-bulk-check="true" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-white p-3">
        <div>
          <p className="text-sm font-extrabold text-slate-950">Conferência dos índices</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-700">
            Após comparar cada campo com o PDF, confirme a declaração acima e marque todas de uma vez.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" data-urban-manual-check-all="true" data-sigapro-contrast="dark"
            data-selection-state={allCellsSelected?"complete":"pending"}
            aria-pressed={allCellsSelected}
            disabled={!sourceAttested||reviewBlocked||allCellsSelected}
            onClick={()=>{
              onInvalidatePrepared();
              setConfirmedCells(referenceCells.map(([label])=>label));
            }}
            className="min-h-10 rounded-lg border border-sky-800 bg-sky-800 px-4 py-2 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-600">
            {allCellsSelected?"✓ Todas marcadas ("+referenceCells.length+")":"Marcar todas ("+referenceCells.length+")"}
          </button>
          <button type="button" data-urban-manual-uncheck-all="true"
            disabled={confirmedCells.length===0}
            onClick={()=>{
              onInvalidatePrepared();
              setConfirmedCells([]);
            }}
            className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-900 disabled:cursor-not-allowed disabled:opacity-50">
            Desmarcar todas
          </button>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {referenceCells.map(([label,value])=><label key={label}
          className="flex min-w-0 items-start gap-2 rounded-xl border border-sky-200 bg-white p-3 text-sm text-slate-950">
          <input aria-label={"Conferi no PDF: "+label}
            type="checkbox" checked={confirmedCells.includes(label)}
            onChange={e=>{
              onInvalidatePrepared();
              setConfirmedCells(prev=>e.target.checked
                ?[...prev,label]:prev.filter(x=>x!==label));
            }}
            className="mt-1 h-4 w-4 shrink-0 accent-sky-800"/>
          <span className="min-w-0 break-words font-semibold text-slate-900">
            <strong className="block text-xs text-slate-700">{label}</strong>{value}
          </span>
        </label>)}
      </div>
      {reviewBlocked?<p role="alert" className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm font-bold text-rose-950">
        Há índice ou leitura original pendente. Não é permitido preparar a linha
        automaticamente; confira a fonte e use o registro manual para resolver a pendência.
      </p>:null}
      <button type="button" data-urban-manual-prepare="true" data-sigapro-contrast="dark"
        disabled={!canPrepare}
        onClick={()=>onPrepareVerified(referenceCells.map(([label,value])=>label+": "+value).join("\n"))}
        className="mt-3 min-h-11 rounded-xl border border-sky-800 bg-sky-900 px-4 py-2 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-200 disabled:text-slate-700">
        Preparar texto conferido do PDF — sem salvar regras
      </button>
      <p className="mt-2 text-xs font-semibold leading-5 text-slate-700">
        Esta ação só prepara uma transcrição de trabalho. Para registrar revisão no Neon QA,
        ainda serão exigidos fonte literal, vigência confirmada e as aprovações humanas previstas no fluxo.
      </p>
      {preparedText ? <section data-urban-manual-result="true" role="status" aria-live="polite"
        className="mt-4 overflow-hidden rounded-xl border border-emerald-300 bg-white text-slate-950 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-wide text-emerald-950">Resultado da conferência humana</p>
            <h6 className="mt-1 text-base font-extrabold text-slate-950">Transcrição preparada — 13 campos</h6>
          </div>
          <span className="rounded-full border border-emerald-300 bg-white px-3 py-1 text-xs font-bold text-emerald-950">
            Não salvo · não é leitura da IA
          </span>
        </div>
        <div className="px-4 py-3">
          <p className="text-sm font-semibold leading-6 text-slate-800">
            Página {row.pagina_pdf} · {row.zona_conforme_tabela} · {row.uso_predominante_conforme_tabela}.
            O texto está disponível aqui; a edição fica recolhida acima. Nenhuma regra nem vigência foi alterada.
          </p>
          <pre data-urban-manual-result-text="true"
            className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-medium leading-6 text-slate-950">{preparedText}</pre>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <a href="#urban-matrix-transcription" className="text-sm font-bold text-sky-900 underline underline-offset-2">
              Abrir opção de editar transcrição
            </a>
            <span className="text-xs font-semibold text-amber-950">Vigência e exceções ainda pendentes</span>
          </div>
        </div>
      </section> : null}
    </div>
  </section>;
}
const dateValid = (s: string) => validateImportDate(s);
const MAX_PDF_BYTES = 100 * 1024 * 1024;

async function verifyPdfAndHash(file: File) {
  if (file.size > MAX_PDF_BYTES || file.size < 5 || !/\.pdf$/i.test(file.name))
    throw new Error("Selecione um PDF oficial válido, de até 100 MB.");
  const bytes = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  if (String.fromCharCode(...bytes) !== "%PDF-")
    throw new Error("O arquivo selecionado não possui assinatura PDF.");
  if (!globalThis.crypto?.subtle) throw new Error("Navegador sem suporte à verificação SHA-256.");
  const hashed = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(hashed)).map(b => b.toString(16).padStart(2,"0")).join("");
}

export function UrbanLegalMatrixImporter({municipalityId,canEdit,onSaved}: Props) {
  const [file,setFile] = useState<File|null>(null);
  const [pageImage,setPageImage]=useState<File|null>(null);
  const [pageImagePreview,setPageImagePreview]=useState("");
  const [ocrDraft,setOcrDraft]=useState(false);
  const [ocrVerified,setOcrVerified]=useState(false);
  const [visionBusy,setVisionBusy]=useState(false);
  const [visionNotice,setVisionNotice]=useState<{kind:"reading"|"success"|"error";message:string}|null>(null);
  const [visionRawPreview,setVisionRawPreview]=useState("");
  const [visionFeedback,setVisionFeedback]=useState<{recognized:number;total:number;missing:number}|null>(null);
  const [focusCandidates,setFocusCandidates]=useState<UrbanVisionFieldKey[]>([]);
  const [focusSelection,setFocusSelection]=useState<UrbanVisionFieldKey>("zona");
  const [focusedResults,setFocusedResults]=useState<Partial<Record<UrbanVisionFieldKey,string|null>>>({});
  const [focusNotice,setFocusNotice]=useState("");
  const [expertDiagnostics,setExpertDiagnostics]=useState<UrbanDiagnosticRow[]|null>(null);
  const [expertStatus,setExpertStatus]=useState("");
  const [autoAuditPending,setAutoAuditPending]=useState(false);
  // Reject asynchronous OCR results if the document, image, selected zone,
  // usage or municipality changes while the provider is still processing.
  const currentVisionScope=useRef({municipalityId,file,pageImage,quadro:"I" as ImportQuadro,
    page:"",zone:"",usage:""});

  // No localStorage: only the same authenticated component session may reuse an
  // identical, already-authorized crop without charging Cloudflare again.
  const visionSessionCache=useRef(new Map<string,VisionReply>());
  const [previewUrl,setPreviewUrl] = useState("");
  const [pdfViewerReload,setPdfViewerReload] = useState(0);
  const [openedRowNotice,setOpenedRowNotice]=useState("");
  // The browser's native PDF reader does not reliably honor fragment changes
  // in an already mounted iframe. Remount on page / document / manual refresh.
  // Preview writes must use an explicitly configured, non-production Neon pair.
  const authUrl=String(import.meta.env.VITE_NEON_AUTH_URL || "");
  const dataUrl=String(import.meta.env.VITE_NEON_DATA_API_URL || "");
  const authEp=authUrl.match(/^(?:https:\/\/)?(ep-[^.]+)\.neonauth\./)?.[1];
  const dataEp=dataUrl.match(/^(?:https:\/\/)?(ep-[^.]+)\.apirest\./)?.[1];
  const qaWriteEnabled=import.meta.env.VITE_SIGAPRO_URBAN_MATRIX_QA_ENABLED==="true" &&
    Boolean(authEp && dataEp && authEp===dataEp && authEp!=="ep-blue-cloud-b4hhgb4t") &&
    !["sigapromunicipal.com.br","www.sigapromunicipal.com.br"].includes(window.location.hostname) &&
    !window.location.hostname.endsWith(".sigapromunicipal.com.br");
  const [quadro,setQuadro] = useState<ImportQuadro>("I");
  const [page,setPage] = useState("");
  // Page must be initialized before any derived value can read it.
  const selectedPdfPage=Number.isSafeInteger(Number(page)) && Number(page)>0
    ?Number(page):1;
  const [text,setText] = useState("");
  // Display-only duplicate of the operator-prepared text, never a persisted rule.
  const [preparedManualText,setPreparedManualText]=useState<string|null>(null);
  const [zone,setZone] = useState("");
  const [usage,setUsage] = useState("");
  const [effectiveFrom,setEffectiveFrom] = useState("");
  const [method,setMethod] = useState<"text_layer_verified"|"visual_double_transcription">("text_layer_verified");
  const [candidates,setCandidates] = useState<UrbanExtractedCandidate[]>([]);
  const [checked,setChecked] = useState<number[]>([]);
  const [consent,setConsent] = useState(false);
  const [manualMetric,setManualMetric] = useState<UrbanMetric>("front_setback_m");
  const [manualValue,setManualValue] = useState("");
  const [manualExcerpt,setManualExcerpt] = useState("");
  const [manualNote,setManualNote] = useState("");
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [reviewPackage,setReviewPackage] = useState<ReviewPackage|null>(null);
  const [reviewRowIndex,setReviewRowIndex] = useState(0);
  const [reviewLoading,setReviewLoading] = useState(false);
  const [archiveReloadToken,setArchiveReloadToken]=useState(0);
  const [archiveRestored,setArchiveRestored]=useState(false);
  const [history,setHistory] = useState<SavedSnapshot[]>([]);
  const [historyChecked,setHistoryChecked] = useState(false);
  const [historyError,setHistoryError] = useState(false);
  // Unresolved OCR cells are not eligible for confirmation, extraction or saving.
  const ocrHasIllegibleCell=/\[\s*ILEG[IÍ]VEL\s*\]/i.test(text);
  const matchingOriginalRow=reviewPackage?.quadro_I[reviewRowIndex]??null;
  const matchingOriginalScope=Boolean(matchingOriginalRow && quadro==="I" &&
    Number(page)===matchingOriginalRow.pagina_pdf &&
    normalizeUrbanCode(zone)===normalizeUrbanCode(matchingOriginalRow.zona_conforme_tabela) &&
    normalizeUrbanCode(usage)===normalizeUrbanCode(matchingOriginalRow.uso_predominante_conforme_tabela));
  const historicalExpertAudit=expertDiagnostics
    ? auditExpertAgainstArchivedRow(expertDiagnostics,matchingOriginalScope?matchingOriginalRow:null)
    : null;
  const historicalMatches=historicalExpertAudit?.filter(x=>x.status==="match").length??0;
  const historicalConflicts=historicalExpertAudit?.filter(x=>x.status==="divergent").length??0;
  const ocrReconciliation=ocrDraft && matchingOriginalScope && matchingOriginalRow
    ? reconcileUrbanOcr(text,matchingOriginalRow) : null;
  const ocrReconciliationBlocked=Boolean(ocrDraft && reviewPackage &&
    (!matchingOriginalScope || !ocrReconciliation?.complete));
  useEffect(()=>{
    visionSessionCache.current.clear();
    setVisionFeedback(null);
    setOcrVerified(false);
  },[municipalityId]);
  const reset = () => {setCandidates([]);setChecked([]);setConsent(false);setMessage("");};
  const loadStructuredReview = async (incoming: File | null) => {
    setReviewPackage(null);setReviewRowIndex(0);setPreparedManualText(null);
    setArchiveRestored(false);
    if (!incoming) return;
    if (!file) {setMessage("Selecione o mesmo PDF oficial antes do pacote de revisão.");return;}
    if (incoming.size > 1_000_000 || !incoming.name.toLowerCase().endsWith(".json")) {
      setMessage("Selecione um pacote JSON de revisão com até 1 MB.");return;
    }
    setReviewLoading(true);setMessage("");
    try {
      const parsed: unknown = JSON.parse(await incoming.text());
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw Error("Estrutura do pacote inválida.");
      const candidate = parsed as Partial<ReviewPackage>;
      if (candidate.tipo !== "sigapro_urban_matrix_original_lc379_2009_review" ||
          candidate.nao_ativar_regras_automaticamente !== true ||
          typeof candidate.municipio !== "string" || candidate.municipio.length>120 ||
          typeof candidate.arquivo_sha256 !== "string" ||
          !/^[a-f0-9]{64}$/.test(candidate.arquivo_sha256) ||
          !Array.isArray(candidate.quadro_I) ||
          candidate.quadro_I.length===0 || candidate.quadro_I.length>500 ||
          !candidate.quadro_I.every(validReviewRow))
        throw Error("Pacote de revisão incompatível ou com linhas inválidas.");
      const actualHash=await verifyPdfAndHash(file);
      if(actualHash!==candidate.arquivo_sha256)
        throw Error("O PDF selecionado NÃO corresponde ao arquivo de origem deste pacote. Nenhum campo foi alterado.");
      setReviewPackage(candidate as ReviewPackage);
      // Select the first verified PDF row so the OCR page does not stay blank.
      const firstRow=candidate.quadro_I[0]!;
      setQuadro("I");setReviewRowIndex(0);setPage(String(firstRow.pagina_pdf));
      setZone(normalizeUrbanCode(firstRow.zona_conforme_tabela));
      setUsage(normalizeUrbanCode(firstRow.uso_predominante_conforme_tabela));
      setMessage("Pacote de revisão carregado com conferência SHA-256 do PDF. Selecione uma linha para pré-preencher apenas o escopo. A legislação vigente ainda precisa ser validada.");
    } catch(e) {setMessage("Pacote não carregado: "+(e instanceof Error?e.message:"erro desconhecido"));}
    finally {setReviewLoading(false);}
  };
  const restoreArchivedDraft=async(draft:UrbanStoredDraft)=>{
    if(!file)throw Error("Selecione o PDF original para abrir o rascunho sem reenviar o JSON.");
    if(draft.municipality_id!==municipalityId||draft.status!=="pending_legal_review"||
      !/^[a-f0-9]{64}$/.test(draft.document_sha256)||
      !Array.isArray(draft.source_rows)||draft.source_rows.length<1||
      draft.source_rows.length>500||!draft.source_rows.every(validReviewRow))
      throw Error("Rascunho incompatível com a prefeitura ou com a estrutura de revisão.");
    const actualHash=await verifyPdfAndHash(file);
    if(actualHash!==draft.document_sha256)
      throw Error("O PDF enviado não corresponde ao rascunho arquivado (SHA-256). Nenhum dado foi alterado.");
    const first=draft.source_rows[0]!;
    const restored:ReviewPackage={
      tipo:"sigapro_urban_matrix_original_lc379_2009_review",
      municipio:draft.source_municipality,
      arquivo_sha256:draft.document_sha256,
      quadro_I:draft.source_rows,
      nao_ativar_regras_automaticamente:true,
    };
    setReviewPackage(restored);setArchiveRestored(true);setReviewRowIndex(0);
    setQuadro("I");setPage(String(first.pagina_pdf));
    setZone(normalizeUrbanCode(first.zona_conforme_tabela));
    setUsage(normalizeUrbanCode(first.uso_predominante_conforme_tabela));
    setEffectiveFrom("");setPreparedManualText(null);setText("");
    setOcrDraft(false);setOcrVerified(false);setCandidates([]);setChecked([]);
    setVisionNotice(null);setVisionFeedback(null);setConsent(false);
    setMessage("Rascunho histórico recuperado do Neon QA, com PDF original conferido por SHA-256. Nenhuma regra foi ativada. Continue a análise das pendências.");
  };
  const openBatchRow=(index:number)=>{
    const row=reviewPackage?.quadro_I[index];
    if(!row||busy)return;
    setReviewRowIndex(index);
    setQuadro("I");setPage(String(row.pagina_pdf));
    setZone(normalizeUrbanCode(row.zona_conforme_tabela));
    setUsage(normalizeUrbanCode(row.uso_predominante_conforme_tabela));
    setEffectiveFrom("");setText("");setPreparedManualText(null);
    // Old crop or consent must never carry into another zone / use.
    setPageImage(null);setVisionNotice(null);setVisionFeedback(null);
    setFocusCandidates([]);setFocusedResults({});setFocusNotice("");
    setVisionRawPreview("");setOcrDraft(false);setOcrVerified(false);
    setCandidates([]);setChecked([]);setConsent(false);
    setPdfViewerReload(previous=>previous+1);
    setOpenedRowNotice("Linha "+(index+1)+" aberta: "+row.zona_conforme_tabela+
      " · "+row.uso_predominante_conforme_tabela+" · página "+row.pagina_pdf+
      ". Confira o PDF e selecione o recorte desta linha para a IA.");
    setMessage("Linha aberta para conferência. Vigência não confirmada; nenhum índice salvo.");
    requestAnimationFrame(()=>{
      document.getElementById("urban-matrix-selected-row")?.scrollIntoView({behavior:"smooth",block:"start"});
      document.getElementById("urban-matrix-selected-row-control")?.focus({preventScroll:true});
    });
  };
  const applyReviewRow = () => {
    const row=reviewPackage?.quadro_I[reviewRowIndex];
    if(!row || !canEdit || busy) return;
    setQuadro("I");setPage(String(row.pagina_pdf));
    setZone(normalizeUrbanCode(row.zona_conforme_tabela));
    setUsage(normalizeUrbanCode(row.uso_predominante_conforme_tabela));
    setEffectiveFrom("");setText("");setPreparedManualText(null);setOcrDraft(false);setOcrVerified(false);
    setCandidates([]);setChecked([]);setConsent(false);
    setMessage("Página, zona e uso preenchidos para revisão. Os valores abaixo são da lei ORIGINAL e não foram gravados. Confira a linha no PDF e possíveis alterações posteriores; a vigência continua em branco.");
  };

  useEffect(() => {
    let active = true;
    setFile(null);setQuadro("I");setPage("");setText("");setPreparedManualText(null);setZone("");
    setUsage("");setEffectiveFrom("");reset();setHistory([]);
    setHistoryChecked(false);setHistoryError(false);
    if (!municipalityId || !canEdit || !backendClient) return () => {active=false;};
    void backendClient.rpc("list_urban_legal_matrix_imports_v1",
      {_municipality_id: municipalityId}).then(({data,error}:{data:unknown;error:unknown})=>{
      if (!active) return;
      setHistoryChecked(true);
      if (error || !Array.isArray(data)) {
        setHistoryError(true);
        setMessage("Não foi possível consultar as importações desta prefeitura no banco QA. Não conclua que os dados foram perdidos; verifique a conexão/migração.");
        return;
      }
      setHistory(data as SavedSnapshot[]);
    }).catch(()=>{
      if (!active) return;
      setHistoryChecked(true);setHistoryError(true);
      setMessage("Falha ao consultar o histórico da matriz no banco QA. Não refaça o cadastro sem confirmar a situação da conexão.");
    });
    return () => {active=false;};
  },[municipalityId,canEdit]);

  useEffect(()=>{
    if(!file){setPreviewUrl("");return;}
    const local=URL.createObjectURL(file);
    setPreviewUrl(local);
    return ()=>URL.revokeObjectURL(local);
  },[file]);
  useEffect(()=>{
    if(!pageImage){setPageImagePreview("");return;}
    const local=URL.createObjectURL(pageImage);
    setPageImagePreview(local);
    return ()=>URL.revokeObjectURL(local);
  },[pageImage]);
  // A proposal from one PDF/zone must never remain visible for another page,
  // image, municipality or use. The initial OCR result is unaffected because
  // these dependencies do not change when an OCR request completes.
  useEffect(()=>{
    setFocusCandidates([]);setFocusedResults({});setFocusNotice("");
    setExpertDiagnostics(null);setExpertStatus("");setAutoAuditPending(false);
  },[municipalityId,file,pageImage,quadro,page,zone,usage]);
  currentVisionScope.current={municipalityId,file,pageImage,quadro,page,zone,usage};
  const readPageImage = async (visionMode:"structured"|"literal"|"focused"|"expert"="structured") => {
    const requestedScope=currentVisionScope.current;
    const scopeIsCurrent=()=>{
      const current=currentVisionScope.current;
      return current.municipalityId===requestedScope.municipalityId &&
        current.file===requestedScope.file && current.pageImage===requestedScope.pageImage &&
        current.quadro===requestedScope.quadro && current.page===requestedScope.page &&
        current.zone===requestedScope.zone && current.usage===requestedScope.usage;
    };
    if(visionBusy || busy || !canEdit || !file || !pageImage || !consent ||
      !Number.isSafeInteger(Number(page)) || Number(page)<1 || Number(page)>10000){
      setMessage("Selecione PDF oficial, página física e imagem recortada da tabela. Autorize a consulta à IA antes de prosseguir.");return;
    }
    if(visionMode==="focused"&&!focusCandidates.includes(focusSelection))return;
    if(visionMode==="expert"&&(quadro!=="I"||(!ocrDraft && visionFeedback?.recognized!==0)))return;
    setVisionBusy(true);
    if(visionMode!=="focused"&&visionMode!=="expert"){
      setAutoAuditPending(false);
      setExpertStatus("O SIGAPRO consultará automaticamente uma segunda IA para diagnosticar os 13 campos.");
      setExpertDiagnostics(null);
      setCandidates([]);setChecked([]);setMessage("");
      setVisionNotice({kind:"reading",message:"Solicitação enviada para leitura da linha. Nenhum dado será salvo automaticamente."});
      setVisionRawPreview("");
      setOcrDraft(false);setOcrVerified(false);setVisionFeedback(null);
      setFocusCandidates([]);setFocusedResults({});setFocusNotice("");
    }else if(visionMode==="expert"){
      setExpertStatus("Analisando recorte com Gemma 4; sem alterar transcrição existente.");
      setExpertDiagnostics(null);
    }else{
      setFocusNotice("Lendo somente "+(URBAN_VISION_FIELDS.find(([k])=>k===focusSelection)?.[1]||"a célula")+
        " em uma chamada individual. Nenhum valor será inserido automaticamente.");
    }
    try {
      if(pageImage.size>12*1024*1024 || !["image/jpeg","image/png"].includes(pageImage.type))
        throw Error("Selecione uma imagem JPG/PNG de até 12 MB (antes de comprimir).");
      const bitmap=await createImageBitmap(pageImage);
      try {
        if(bitmap.width<400 || bitmap.height<140)
          throw Error("Imagem muito pequena. Amplie a tabela e recorte uma linha com os cabeçalhos.");
        // Thin historical table fonts are often only 6–12px high in the
        // operator's crop. Preserve available pixels, and magnify small crops
        // before the vision encoder downscales the image internally.
        // Never stretch beyond 1900px or beyond 2.2x the uploaded resolution.
        const ratio=Math.min(2.2,1900/Math.max(bitmap.width,bitmap.height));
        const canvas=document.createElement("canvas");
        canvas.width=Math.max(1,Math.round(bitmap.width*ratio));
        canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
        const ctx=canvas.getContext("2d");
        if(!ctx)throw Error("Seu navegador não conseguiu ler a imagem.");
        ctx.imageSmoothingEnabled=true;
        ctx.imageSmoothingQuality="high";
        ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
        let data=canvas.toDataURL("image/jpeg",0.88);
        if(data.length>1_400_000)data=canvas.toDataURL("image/jpeg",0.65);
        if(data.length>1_400_000)
          throw Error("A imagem ainda está grande. Faça um recorte apenas da linha e do cabeçalho da tabela.");
        // Digest binds the result to this exact crop, page, tenant and
        // original PDF. An in-memory cache avoids repeated paid calls.
        const bytes=new TextEncoder().encode(data);
        const digest=await crypto.subtle.digest("SHA-256",bytes);
        const hash=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
        const cacheKey=[municipalityId,reviewPackage?.arquivo_sha256||file.name+"-"+file.size+"-"+file.lastModified,
          quadro,page,hash,visionMode,visionMode==="focused"?focusSelection:""].join("|");
        let result=visionSessionCache.current.get(cacheKey);
        const reused=Boolean(result);
        if(!result){
          const session=await backendClient?.auth?.getSession?.();
          const bearer=String(session?.data?.session?.access_token||session?.data?.session?.accessToken||"");
          if(!bearer)throw Error("Sua sessão expirou. Entre novamente no SIGAPRO.");
          const response=await fetch("/api/ai-assistant",{
            method:"POST",credentials:"same-origin",cache:"no-store",
            headers:{"Content-Type":"application/json",Authorization:"Bearer "+bearer,
              "X-SIGAPRO-VISION":"1"},
            body:JSON.stringify({action:"urban-matrix-vision",quadro,
              pageNumber:Number(page),imageDataUrl:data,mode:visionMode,
              ...(visionMode==="focused"?{fieldKey:focusSelection}:{})}),
          });
          result=await response.json() as VisionReply;
          if(!response.ok)throw Error(result.error||"Falha na leitura visual.");
          if(result.status!=="unverified_unstructured_ocr_response" &&
            result.status!=="unverified_focused_cell" &&
            (typeof result.draftText!=="string"||result.draftText.trim().length<20))
            throw Error("A IA não conseguiu transcrever esse recorte com segurança.");
          if(visionSessionCache.current.size>=5)visionSessionCache.current.clear();
          visionSessionCache.current.set(cacheKey,result);
        }
        if(!scopeIsCurrent())return;
        if(visionMode==="expert"){
          if(result.status!=="unverified_expert_ocr_draft"||typeof result.draftText!=="string"){
            setExpertStatus(result.diagnosticCode==="GEMMA_EMPTY_COMPLETION"
              ?"A Gemma 4 respondeu sem produzir texto. É uma falha da geração do modelo, não prova de que a tabela esteja ilegível. A primeira leitura e o PDF foram preservados."
              :"Gemma 4 não identificou as colunas com segurança. O resultado anterior permanece preservado.");
            return;
          }
          const hasInitialDraft=ocrDraft&&text.trim().length>=20;
          if(!hasInitialDraft){
            // The second model is uncorroborated. Never overwrite text typed or
            // approved by a human, even if the first model failed.
            if(!text.trim()){
              setText(result.draftText.trim().slice(0,6000));
              setOcrDraft(true);setOcrVerified(false);
              setMethod("visual_double_transcription");
              setPreparedManualText(null);
            }
            setVisionFeedback({
              recognized:Number(result.recognizable)||0,total:13,
              missing:Array.isArray(result.unrecognized)?result.unrecognized.length:13,
            });
            setVisionNotice({kind:"reading",message:"A primeira IA não identificou as colunas. "+
              "A Gemma 4 produziu uma transcrição independente, ainda NÃO corroborada nem aprovada."});
            const missing=Array.isArray(result.unrecognized)?result.unrecognized:[];
            const pending=missing.filter((key):key is UrbanVisionFieldKey=>
              URBAN_VISION_FIELDS.some(([id])=>id===key));
            setFocusCandidates(pending);setFocusSelection(pending[0]||"zona");
          }
          const diagnostics=compareUrbanVisionDrafts(hasInitialDraft?text:"",result.draftText);
          setExpertDiagnostics(diagnostics);
          const diagnosticsPending=diagnostics.filter(x=>x.verdict!=="agree").map(x=>x.key);
          setFocusCandidates(diagnosticsPending);
          setFocusSelection(diagnosticsPending[0]||"zona");
          const agreeing=diagnostics.filter(x=>x.verdict==="agree").length;
          const conflicts=diagnostics.filter(x=>x.verdict==="conflict").length;
          setExpertStatus((hasInitialDraft?"Duas IAs comparadas. ":"Somente a Gemma 4 conseguiu ler campos; falta uma segunda evidência. ")+agreeing+" concordâncias, "+conflicts+
            " divergências. Valores isolados e não lidos permanecem pendentes. Nenhum índice foi aprovado.");
          return;
        }
        if(visionMode==="focused"){
          if(result.status!=="unverified_focused_cell"||result.fieldKey!==focusSelection)
            throw Error("Retorno focalizado incompatível com a célula solicitada.");
          const read=typeof result.read==="string"?result.read:null;
          setFocusedResults(previous=>({...previous,[focusSelection]:read}));
          setFocusNotice(read===null
            ?"Célula ainda ilegível. Faça a conferência ampliada no PDF oficial; não deduza um número."
            :"Proposta para "+(URBAN_VISION_FIELDS.find(([k])=>k===focusSelection)?.[1]||focusSelection)+
              ": "+read+". NÃO foi inserida na transcrição nem aprovada. Compare com o PDF antes de corrigir.");
          return;
        }
        if(result.status==="unverified_unstructured_ocr_response"){
          // Preserve any existing operator-entered text; an unreliable LLM
          // response must never silently overwrite human evidence.
          setVisionRawPreview(typeof result.ocrPreview==="string"?
            result.ocrPreview.slice(0,2500):"");
          setVisionFeedback({recognized:0,total:13,missing:13});
          setFocusCandidates(URBAN_VISION_FIELDS.map(([k])=>k));
          setFocusSelection("zona");
          if(visionMode==="structured"&&quadro==="I")setAutoAuditPending(true);
          // Preserve the provenance of any prior OCR text. Repeated failed
          // calls must never recast old unverified OCR as trusted manual text.
          setOcrVerified(false);
          const issue=result.diagnosticCode==="OCR_EMPTY_RESPONSE"
            ?"O modelo não retornou texto para este recorte."
            :result.diagnosticCode==="OCR_SHORT_RESPONSE"
              ?"A resposta do modelo foi curta demais para reconhecer as colunas."
              :"O modelo não associou os valores aos cabeçalhos com segurança.";
          const message="A Cloudflare respondeu, mas não foi possível validar a extração: "+issue+
            " Confira se a ZONA e o USO da imagem coincidem com a linha selecionada. "+
            "Não aprove estes campos. A conferência manual continua disponível.";
          setVisionNotice({kind:"error",message:(reused?"Resultado recuperado desta sessão. ":"")+message});
          setMessage(message);
          return;
        }
        if(typeof result.draftText!=="string")
          throw Error("Resposta da IA sem transcrição verificável.");
        const structured=result.status==="unverified_structured_ocr_draft";
        setVisionFeedback(structured?{
          recognized:Number(result.recognizable)||0,
          total:Number(result.total)||13,
          missing:Array.isArray(result.unrecognized)?result.unrecognized.length:13,
        }:null);
        setPreparedManualText(null);
        setText(result.draftText.trim().slice(0,6000));
        setOcrDraft(true);setOcrVerified(false);setMethod("visual_double_transcription");
        // A visually different zone must never be reported as a successful reading
        // for the selected legal row (the prior video selected ZM-MA but sent ZM-B).
        const extractedZone=result.draftText.match(/^Zona:\s*(.*)$/mi)?.[1]?.trim()||"";
        const extractedUse=result.draftText.match(/^Uso:\s*(.*)$/mi)?.[1]?.trim()||"";
        const confident=(v:string)=>Boolean(v&&!/\[\s*ileg[ií]vel\s*\]/i.test(v));
        const zoneMismatch=quadro==="I"&&confident(extractedZone)&&Boolean(zone)&&
          normalizeUrbanCode(extractedZone)!==normalizeUrbanCode(zone);
        const useMismatch=quadro==="I"&&confident(extractedUse)&&Boolean(usage)&&
          normalizeUrbanCode(extractedUse)!==normalizeUrbanCode(usage);
        const missing=(Array.isArray(result.unrecognized)?result.unrecognized:[]).filter(
          (k):k is UrbanVisionFieldKey=>URBAN_VISION_FIELDS.some(([known])=>known===k));
        const toReview=[...new Set<UrbanVisionFieldKey>([
          ...(zoneMismatch?["zona" as const]:[]),
          ...(useMismatch?["uso" as const]:[]),...missing])];
        setFocusCandidates(toReview);
        setFocusSelection(toReview[0]||"zona");
        if(visionMode==="structured"&&quadro==="I")setAutoAuditPending(true);
        setVisionNotice({kind:zoneMismatch||useMismatch?"error":Number(result.recognizable)===13?"success":"reading",message:
          zoneMismatch||useMismatch
            ?"Imagem diferente da linha selecionada. Editor: "+zone+" / "+usage+
              ". IA leu: "+(extractedZone||"zona ilegível")+" / "+(extractedUse||"uso ilegível")+
              ". Selecione a linha correspondente e refaça a conferência. Nenhuma regra foi aprovada."
            :Number(result.recognizable)<13
              ?"Transcrição parcial: "+String(result.recognizable||0)+"/13 campos associados aos cabeçalhos. "+
                "As demais células continuam ilegíveis ou não identificadas; nenhum parâmetro foi aprovado."
              :reused
                ?"Leitura estruturada recuperada desta sessão. Compare os valores abaixo."
                :"13 campos sugeridos pela IA, ainda não aprovados. Confira cada coluna no PDF."});
        setMessage(zoneMismatch||useMismatch
          ?"DIVERGÊNCIA DE ZONA OU USO: a linha aberta não é a que a IA transcreveu. "+
            "Nenhuma norma foi gravada ou ativada."
          :(reused?"Leitura recuperada nesta sessão, sem nova chamada à Cloudflare. ":"")+
            (quadro==="I"?"A IA devolveu células sugeridas e NÃO verificadas. Compare cada coluna com o PDF. ":
              "Transcrição preliminar do Quadro II; confira as condições na fonte original. ")+
            "Nenhuma norma foi gravada ou ativada.");
      } finally {bitmap.close();}
    } catch(err) {
      if(!scopeIsCurrent())return;
      const reason=err instanceof Error?err.message:"A leitura visual não foi concluída.";
      if(visionMode==="expert")setExpertStatus("Auditoria independente não concluída: "+reason+
        ". O OCR anterior foi mantido sem alterações.");
      else if(visionMode==="focused")setFocusNotice("Releitura focalizada não concluída: "+reason);
      else{
        setVisionNotice({kind:"error",message:reason+" Nenhum índice foi salvo; a referência histórica permanece disponível abaixo."});
        setMessage(reason);
      }
    } finally{setVisionBusy(false);}
  };
  // One authorized click starts two independent readings in sequence.
  // No automatic call is triggered by typing, page loads or background jobs.
  useEffect(()=>{
    if(!autoAuditPending||visionBusy||!file||!pageImage||!consent||quadro!=="I")return;
    if(!ocrDraft&&visionFeedback?.recognized!==0)return;
    setAutoAuditPending(false);
    void readPageImage("expert");
  },[autoAuditPending,visionBusy,ocrDraft,visionFeedback,quadro,file,pageImage,consent]);
  const queryAi = async () => {
    if (busy || !file || !zone.trim() || !usage.trim() ||
      !Number.isSafeInteger(Number(page)) || Number(page)<1 || Number(page)>10000 ||
      text.trim().length<40 || text.length>6000 || !consent ||
      (ocrDraft && (!ocrVerified || ocrHasIllegibleCell || ocrReconciliationBlocked))) {
      setMessage("Informe página, zona, uso e texto da lei. A vigência só será exigida para registrar rascunho. Se houve OCR, confira a transcrição primeiro.");
      return;
    }
    setBusy(true);setCandidates([]);setChecked([]);setMessage("");
    try {
      await verifyPdfAndHash(file);
      const current=await backendClient?.auth?.getSession?.();
      const bearer=String(current?.data?.session?.access_token || current?.data?.session?.accessToken || "");
      if (!bearer) throw Error("Faça login novamente para consultar a IA.");
      const response=await fetch("/api/ai-assistant",{
        method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+bearer},
        cache:"no-store",credentials:"same-origin",
        body:JSON.stringify({action:"urban-matrix-extract",quadro,pageNumber:Number(page),
          documentTitle:file.name,pageText:text.trim(),zoneCode:normalizeUrbanCode(zone),useCode:normalizeUrbanCode(usage)}),
      });
      const payload=await response.json() as ExtractionReply;
      if (!response.ok) throw Error(payload.error||"Não foi possível interpretar o trecho.");
      const normalized=extractLiteralCandidates({candidates:payload.candidates},text.trim(),quadro);
      setCandidates(normalized);
      setMessage(normalized.length
        ? "Propostas extraídas. Confira cada número/condição diretamente no PDF e marque apenas as linhas corretas."
        : "Nenhuma linha pôde ser confirmada literalmente. Confira se o trecho e a tabela foram copiados corretamente.");
    } catch (err) {setMessage(err instanceof Error ? err.message:"Falha na extração.");}
    finally{setBusy(false);}
  };
  const addManualCandidate = () => {
    if (busy || !file || !text.trim() || !Number.isSafeInteger(Number(page)) ||
        Number(page)<1 || !zone.trim() || !usage.trim() ||
        (ocrDraft && (!ocrVerified || ocrHasIllegibleCell || ocrReconciliationBlocked))) {
      setMessage("Selecione o PDF, página, zona, uso e transcrição para propor uma linha manual. A vigência é exigida somente no salvamento.");
      return;
    }
    const excerpt=manualExcerpt.trim();
    const proposed = quadro==="I" ?
      {kind:"numeric_index",metric:manualMetric,limit:parsedLiteralNumber(manualValue),
        rawValue:manualValue.trim(),source_excerpt:excerpt} :
      {kind:"use_condition",note:manualNote.trim(),source_excerpt:excerpt};
    const verified=extractLiteralCandidates({candidates:[proposed]},text.trim(),quadro);
    if (!verified.length || (quadro==="I" && candidates.some(x=>x.metric===manualMetric)) ||
        (quadro==="II" && candidates.some(x=>x.source_excerpt===excerpt))) {
      setMessage("Linha recusada. O trecho precisa ser idêntico ao texto da página e conter o valor numérico declarado. Não repita índices da mesma zona/uso.");
      return;
    }
    setCandidates(previous=>[...previous,...verified]);setChecked([]);
    setManualExcerpt("");setManualValue("");setManualNote("");
    setMessage("Linha proposta registrada localmente. Compare-a com o PDF e marque para confirmação humana; ainda não foi gravada no Neon.");
  };
  const saveReview = async () => {
    if(busy || !canEdit || !backendClient || !file || !dateValid(effectiveFrom) ||
      !zone.trim() || !usage.trim() || !Number.isSafeInteger(Number(page)) ||
      Number(page)<1 || Number(page)>10000 || !consent ||
      (ocrDraft && (!ocrVerified || ocrHasIllegibleCell || ocrReconciliationBlocked))) {
      setMessage("Complete e confira o escopo legal antes do registro.");return;
    }
    const chosen=candidates.filter((_,i)=>checked.includes(i));
    if (!chosen.length) {setMessage("Marque ao menos uma linha conferida no PDF.");return;}
    const entries=extractLiteralCandidates({candidates:chosen},text.trim(),quadro);
    if(entries.length!==chosen.length) {setMessage("O trecho mudou ou deixou de corresponder à fonte. Reextraia a página.");return;}
    if(!window.confirm("Confirma que conferiu o PDF oficial, página, zona, uso, vigência e TODAS as linhas selecionadas? Será gravada apenas uma versão de REVISÃO, nunca ativada."))return;
    setBusy(true);setMessage("");
    try {
      const hash=await verifyPdfAndHash(file);
      const scope={_municipality_id:municipalityId,_document_title:file.name.slice(0,180),
        _document_sha256:hash,_page_number:Number(page),_quadro:quadro,
        _zone_code:normalizeUrbanCode(zone),_use_code:normalizeUrbanCode(usage),
        _effective_from:effectiveFrom,_source_excerpt:text.trim(),
        _reviewed_entries:entries,_verification_method:method};
      if (!qaWriteEnabled) throw Error("Somente o ambiente Neon de homologação isolado pode gravar a matriz nesta etapa.");
      if (quadro==="I") {
        const { _quadro: _onlyQuadro, ...payload } = scope;
        const reviewed=await backendClient.rpc("save_urban_matrix_numeric_review_v1",payload);
        if(reviewed.error) throw Error("Importação atômica recusada: "+reviewed.error.message);
        await onSaved();
      } else {
        const reviewed=await backendClient.rpc("save_urban_legal_matrix_import_v1",scope);
        if(reviewed.error) throw Error("Falha ao registrar condições de uso: "+reviewed.error.message);
      }
      const historyResult=await backendClient.rpc("list_urban_legal_matrix_imports_v1",
        {_municipality_id:municipalityId});
      if(historyResult.error || !Array.isArray(historyResult.data))
        throw Error("Registro enviado ao banco, mas a leitura do histórico falhou. Verifique antes de tentar salvar outra vez.");
      setHistory(historyResult.data as SavedSnapshot[]);
      setHistoryChecked(true);setHistoryError(false);
      setChecked([]);setCandidates([]);setConsent(false);
      setMessage(quadro==="I"
        ? "Quadro I registrado e nova versão NUMÉRICA salva como RASCUNHO. Nenhuma regra ativada."
        : "Condições do Quadro II registradas como REVISÃO, sem autorizar usos nem ativar normas.");
    }catch(err){setMessage(err instanceof Error?err.message:"Não foi possível salvar.");}
    finally{setBusy(false);}
  };

  if(!canEdit || !municipalityId)return null;
  return <section data-urban-matrix-import="true" className="mt-5 rounded-2xl border border-sky-200 bg-slate-50 p-4 dark:border-sky-800 dark:bg-slate-900">
    <div className="flex items-start gap-3">
      <BookText className="mt-1 h-5 w-5 shrink-0 text-sky-700 dark:text-sky-300"/>
      <div>
        <h4 className="font-extrabold text-slate-950 dark:text-white">Importador assistido — Matriz de parâmetros</h4>
        <p className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-200">
          Homologação dos Quadros I e II da LC 379/2009 e alterações vigentes.
          A IA só sugere trechos copiados da página do PDF oficial. Ela não identifica
          automaticamente a zona do imóvel, não comprova vigência e não aprova processos.
        </p>
      </div>
    </div>
    <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
      <ShieldAlert className="mr-1 inline h-4 w-4"/>
      Faça download do PDF que está no R2 e selecione a mesma versão aqui; copie o texto
      da página da tabela para o campo abaixo. Tabelas digitalizadas exigem transcrição
      e dupla conferência humana. Nenhum PDF completo é enviado à IA: só o trecho autorizado.
    </p>
    <UrbanMatrixArchivePanel municipalityId={municipalityId}
      qaWriteEnabled={qaWriteEnabled} canEdit={canEdit}
      reloadToken={archiveReloadToken} file={file}
      onRestore={restoreArchivedDraft}/>
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <label className="text-xs font-bold text-slate-800 dark:text-white">Arquivo PDF oficial
        <input type="file" accept=".pdf,application/pdf" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900"
          onChange={e=>{setFile(e.target.files?.[0]||null);setArchiveRestored(false);setReviewPackage(null);setReviewRowIndex(0);setPreparedManualText(null);setPageImage(null);setText("");setOcrDraft(false);setOcrVerified(false);setVisionFeedback(null);setVisionNotice(null);setVisionRawPreview("");visionSessionCache.current.clear();reset();}}/>
      </label>
      <label className="text-xs font-bold text-slate-800 dark:text-white">Quadro de origem
        <select value={quadro} onChange={e=>{setQuadro(e.target.value as ImportQuadro);setPreparedManualText(null);setText("");setOcrDraft(false);setOcrVerified(false);reset();}}
          className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950">
          <option value="I">Quadro I — Índices numéricos</option>
          <option value="II">Quadro II — Categorias e condições de uso</option>
        </select>
      </label>
      <label className="text-xs font-bold text-slate-800 dark:text-white">Página física do PDF
        <input aria-label="Número de página do PDF" type="number" min="1" max="10000" value={page}
          onChange={e=>{setPage(e.target.value);setText("");setPreparedManualText(null);setOcrDraft(false);setOcrVerified(false);setVisionFeedback(null);setVisionNotice(null);setVisionRawPreview("");reset();}} placeholder="Informe a página visualizada"
          className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950"/>
      </label>
      <label className="text-xs font-bold text-slate-800 dark:text-white">Vigência legal confirmada
        <input aria-label="Vigência legal confirmada" type="date" value={effectiveFrom}
          onChange={e=>{setEffectiveFrom(e.target.value);reset();}}
          className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950"/>
      </label>
      <label className="text-xs font-bold text-slate-800 dark:text-white">Código de zona validado
        <input aria-label="Código de zona do documento" value={zone} maxLength={40}
          onChange={e=>{setZone(normalizeUrbanCode(e.target.value));reset();}}
          placeholder="Exatamente como no mapa vigente"
          className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950"/>
      </label>
      <label className="text-xs font-bold text-slate-800 dark:text-white">Categoria de uso validada
        <input aria-label="Categoria de uso do documento" value={usage} maxLength={60}
          onChange={e=>{setUsage(normalizeUrbanCode(e.target.value));reset();}}
          placeholder="Exatamente como no quadro vigente"
          className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950"/>
      </label>
    </div>
    <div data-urban-structured-review="true" className="mt-4 rounded-xl border border-sky-300 bg-white p-4 text-slate-950">
      <h5 className="text-sm font-extrabold text-slate-950">Pré-preencher pela matriz extraída do PDF — revisão controlada</h5>
      <p className="mt-1 text-sm leading-6 text-slate-800">
        Envie o pacote JSON de revisão preparado a partir do PDF. O SIGAPRO confere o hash SHA-256
        do arquivo original antes de disponibilizar as linhas. Nenhuma norma é ativada ou salva nesta etapa.
      </p>
      <label className="mt-3 block text-xs font-bold text-slate-900">
        Pacote de dados para conferência (.json)
        <input aria-label="Importar pacote estruturado da legislação" type="file" accept=".json,application/json"
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-950"
          onChange={e=>void loadStructuredReview(e.target.files?.[0]||null)} disabled={!file||reviewLoading}/>
      </label>
      {reviewLoading?<p role="status" className="mt-2 text-sm text-sky-900">Conferindo PDF e pacote…</p>:null}
      {reviewPackage?<div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-slate-950">
        <p className="text-sm font-bold text-slate-950">Origem: {reviewPackage.municipio} · {reviewPackage.quadro_I.length} linhas · LEI ORIGINAL, VIGÊNCIA NÃO VERIFICADA</p>
        {file?<UrbanMatrixBatchReviewBoard
          key={[municipalityId,reviewPackage.arquivo_sha256,file.name,file.lastModified].join(":")}
          municipalityId={municipalityId} file={file} reviewPackage={reviewPackage}
          qaWriteEnabled={qaWriteEnabled} canEdit={canEdit} onOpenRow={openBatchRow}
          activeRowIndex={reviewRowIndex} archiveRestored={archiveRestored}
          onArchiveSaved={()=>{setArchiveRestored(true);setArchiveReloadToken(previous=>previous+1);}}
        />:null}
        {openedRowNotice?<p data-urban-row-opened="true" role="status" aria-live="polite"
          className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm font-extrabold text-emerald-950">
          {openedRowNotice}
        </p>:null}
        <label id="urban-matrix-selected-row" className="mt-4 block scroll-mt-32 text-sm font-bold text-slate-900">
          Selecione a zona e o uso conforme tabela de origem
          <select id="urban-matrix-selected-row-control" aria-label="Linha extraída para pré-preenchimento" value={reviewRowIndex}
            onChange={e=>openBatchRow(Number(e.target.value))}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950">
            {reviewPackage.quadro_I.map((row,i)=><option key={i} value={i}>
              Página {row.pagina_pdf} · {row.zona_conforme_tabela} · {row.uso_predominante_conforme_tabela}
            </option>)}
          </select>
        </label>
        {reviewPackage.quadro_I[reviewRowIndex] ? (() => {
          const row=reviewPackage.quadro_I[reviewRowIndex];
          const values=[
            ["C.A. mínimo",row.ca_minimo_original??"A CONFERIR"],
            ["C.A. básico",row.ca_basico_original],["C.A. máximo",row.ca_maximo_original],
            ["Ocupação máx.",String(row.taxa_ocupacao_maxima_pct)+"%"],
            ["Permeabilidade mín.",String(row.taxa_permeabilidade_minima_pct)+"%"],
            ["Lote mínimo",String(row.lote_minimo_m2)+" m²"],
            ["Testada mínima",String(row.testada_minima_m)+" m"],
            ["Gabarito",row.gabarito_original],
            ["Recuo frontal",String(row.recuo_frontal_m)+" m"],
            ["Recuo de fundos",String(row.recuo_fundos_m)+" m"],
            ["Recuo lateral",String(row.recuo_lateral_m)+" m"],
          ];
          return <details data-urban-original-reference="true"
            className="mt-3 overflow-hidden rounded-lg border border-sky-200 bg-white text-slate-950">
            <summary className="cursor-pointer bg-white px-3 py-3 text-sm font-extrabold text-sky-950">
              Ver os 11 índices históricos do pacote — expandir ou recolher
            </summary>
            <div className="px-3 pb-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {values.map(([title,value])=><p key={title} className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs leading-5 text-slate-950">
                <strong className="block font-bold text-slate-700">{title}</strong>{value}
              </p>)}
            </div>
            {row.observacoes_especificas?<p className="mt-2 text-xs leading-5 text-amber-950">Exceções da tabela: {row.observacoes_especificas}</p>:null}
              {row.pendencias_de_leitura?<p role="alert" className="mt-2 text-xs font-bold leading-5 text-rose-900">Leitura pendente: {row.pendencias_de_leitura}</p>:null}
            </div>
          </details>;
        })() : null}
        <button type="button" data-urban-review-apply="true" data-sigapro-contrast="dark"
          className="sig-premium-dark-action mt-3 min-h-11 max-w-full rounded-xl border border-slate-900 bg-slate-950 px-5 py-3 text-sm font-extrabold !text-white shadow-sm transition-colors hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          onClick={applyReviewRow}>Pré-preencher página, zona e uso para conferência</button>
        <p className="mt-2 text-xs font-semibold leading-5 text-amber-950">Valores históricos apenas para comparação. A transcrição literal, a vigência e a confirmação humana continuam obrigatórias para gravar um rascunho no Neon QA.</p>
      </div>:null}
    </div>
    {previewUrl?<section data-urban-pdf-review="true"
      className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white p-3 text-slate-950">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h5 className="text-sm font-extrabold text-slate-950">Conferência visual do PDF oficial</h5>
          <p data-urban-pdf-selected-page="true" className="mt-1 text-sm font-bold text-sky-900">
            Página solicitada: {selectedPdfPage} · arquivo local, não enviado ao servidor
          </p>
        </div>
        <button type="button" data-urban-pdf-reload="true"
          onClick={()=>setPdfViewerReload(n=>n+1)}
          className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900">
          Recarregar página no leitor
        </button>
      </div>
      <iframe key={[previewUrl,selectedPdfPage,pdfViewerReload].join(":")}
        title={"Visualização local do PDF oficial — página solicitada "+selectedPdfPage}
        src={previewUrl+"#page="+selectedPdfPage}
        loading="lazy" className="h-[360px] w-full rounded-lg border border-slate-200"/>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-xl text-xs font-semibold leading-5 text-amber-950">
          Confira o número da página exibida no leitor: alguns navegadores ignoram a navegação automática.
          Caso isso ocorra, abra o PDF abaixo e selecione a página manualmente.
        </p>
        <a className="text-sm font-bold text-sky-900 underline underline-offset-2"
          href={previewUrl+"#page="+selectedPdfPage}
          target="_blank" rel="noreferrer">Abrir PDF na página solicitada</a>
      </div>
    </section>:null}
    <div data-urban-matrix-ai-card="true" className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-slate-950">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-sky-800">IA visual · revisão controlada</p>
          <h5 className="mt-1 text-base font-extrabold leading-6 text-slate-950">Ler tabela digitalizada — extração estruturada</h5>
        </div>
        <span className="rounded-full border border-sky-200 bg-white px-3 py-1 text-xs font-extrabold text-sky-900">
          Somente homologação
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-sky-200 bg-white p-3 text-xs font-semibold leading-5 text-slate-900">
          <span className="block text-sm font-extrabold text-sky-900">1 · Enviar recorte</span>Cabeçalho e uma única linha
        </div>
        <div className="rounded-xl border border-sky-200 bg-white p-3 text-xs font-semibold leading-5 text-slate-900">
          <span className="block text-sm font-extrabold text-sky-900">2 · Comparar</span>Valores da IA × PDF × histórico
        </div>
        <div className="rounded-xl border border-sky-200 bg-white p-3 text-xs font-semibold leading-5 text-slate-900">
          <span className="block text-sm font-extrabold text-sky-900">3 · Conferir</span>Sem aprovação automática
        </div>
      </div>
      {matchingOriginalScope && matchingOriginalRow
        ?<p data-urban-ai-expected-row="true"
          className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-extrabold text-amber-950">
          Linha selecionada: {matchingOriginalRow.zona_conforme_tabela} · {matchingOriginalRow.uso_predominante_conforme_tabela}.
          Confirme que o recorte mostra EXATAMENTE esta zona e uso antes de enviar à IA.
        </p>:null}
      <p data-urban-ai-page-status="true" role="status"
        className="mt-3 rounded-lg border border-sky-200 bg-white p-3 text-sm font-bold text-slate-900">
        {Number.isSafeInteger(Number(page))&&Number(page)>0
          ?"Página física pronta para IA: "+page+" · quadro "+quadro+". Confira se a imagem corresponde a esta página."
          :"Selecione uma linha na matriz acima para preencher a página automaticamente e liberar a leitura."}
      </p>
      <p className="mt-1 text-sm leading-6 text-slate-800">
        Para Quadros I/II que são imagens: abra o PDF em zoom 100–150%, capture
        somente o cabeçalho e a linha de uma zona (Win + Shift + S), salve como PNG/JPG
        e selecione abaixo. A IA transcreve o recorte; pode confundir células,
        portanto você precisa comparar e corrigir antes de usar qualquer valor.
      </p>
      <label className="mt-3 block text-xs font-bold">
        Imagem recortada da página (não o PDF completo)
        <input aria-label="Imagem da linha do Quadro I ou II" type="file" accept="image/png,image/jpeg"
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2"
          onChange={e=>{setPageImage(e.target.files?.[0]||null);setPreparedManualText(null);setOcrDraft(false);
            setOcrVerified(false);setVisionFeedback(null);setVisionNotice(null);setVisionRawPreview("");setText("");
            setFocusCandidates([]);setFocusedResults({});setFocusNotice("");reset();}}/>
      </label>
      {pageImagePreview?<img src={pageImagePreview} alt="Prévia local da linha fotografada do quadro"
        className="mt-2 max-h-60 w-full rounded-lg border border-slate-200 object-contain"/>:null}
      <label data-urban-matrix-vision-consent="true"
        className="mt-3 flex items-start gap-3 rounded-xl border border-sky-300 bg-white p-3 text-sm font-bold leading-5 text-slate-950">
        <input type="checkbox" aria-label="Autorizar leitura da imagem pela IA"
          checked={consent} onChange={e=>setConsent(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-sky-800"/>
        Autorizo enviar somente o recorte da tabela à Cloudflare para duas leituras independentes (Moondream 3.1 e Gemma 4),
        com comparação dos 13 campos. São até duas consultas de IA por análise, sujeitas à franquia da conta.
        O PDF completo permanece local. Ao trocar a imagem, confirmarei a autorização novamente.
      </label>
      <button type="button" data-urban-matrix-action="vision"
        disabled={visionBusy||busy||!file||!pageImage||!consent||!Number.isSafeInteger(Number(page))||Number(page)<1||Number(page)>10000}
        onClick={()=>void readPageImage()} data-sigapro-contrast="dark"
        className="mt-3 min-h-11 rounded-xl border border-sky-800 bg-sky-800 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed">
        {visionBusy?"Analisando a tabela com IA…":"Executar leitura completa e diagnóstico com 2 IAs — sem salvar"}
      </button>
      {visionNotice?.kind==="error"&&visionFeedback?.recognized===0 && file && pageImage && consent
        ?<button type="button" data-urban-vision-literal-retry="true"
          data-sigapro-contrast="dark" disabled={visionBusy||busy}
          onClick={()=>void readPageImage("literal")}
          className="mt-2 min-h-11 rounded-xl border border-sky-800 bg-sky-800 px-4 py-2 text-sm font-extrabold text-white">
          Tentar transcrição literal das colunas (nova consulta à Cloudflare)
        </button>:null}
      {visionNotice?.kind==="error"&&visionFeedback?.recognized===0
        ?<p className="mt-2 text-xs font-semibold text-amber-950">
          A segunda tentativa é opcional, utiliza o mesmo recorte com outra instrução e pode consumir a franquia de IA.
          Não envia o PDF completo nem ativa índices.
        </p>:null}

      {(ocrDraft && text.trim().length>=20 || Boolean(expertStatus)||Boolean(expertDiagnostics)) && quadro==="I" && file && pageImage && consent
        ?<section data-urban-expert-audit="true"
          className="mt-4 rounded-xl border border-sky-300 bg-white p-4 text-slate-950">
          <h6 className="text-base font-extrabold text-sky-950">Diagnóstico de precisão — segunda IA Gemma 4</h6>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-800">
            A segunda IA é executada automaticamente após a primeira leitura, em um único fluxo,
            com comparação dos 13 campos. Valores divergentes e ilegíveis não são aprovados.
          </p>
          <button type="button" data-sigapro-contrast="dark" data-urban-expert-run="true"
            disabled={visionBusy||busy||!canEdit}
            onClick={()=>void readPageImage("expert")}
            className="mt-3 min-h-11 rounded-lg border border-sky-900 bg-sky-900 px-4 py-2 text-sm font-extrabold text-white">
            {visionBusy?"Executando auditoria…":"Reexecutar diagnóstico Gemma 4 (opcional)"}
          </button>
          <p className="mt-2 text-xs font-bold text-amber-950">
            Consulta opcional e independente que pode consumir franquia da Cloudflare.
            A fonte oficial e a conferência humana continuam obrigatórias.
          </p>
          {expertStatus?<p data-urban-expert-status="true" role="status" aria-live="polite"
            className="mt-3 rounded-lg border border-sky-200 bg-slate-50 p-3 text-sm font-bold text-slate-900">
            {expertStatus}
          </p>:null}
          {expertDiagnostics?<div className="mt-3 space-y-3">
            <p data-urban-expert-historical-summary="true" role="status"
              className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-extrabold text-amber-950">
              {matchingOriginalScope&&matchingOriginalRow
                ?"Comparação com rascunho histórico importado: "+historicalMatches+
                  "/13 semelhantes, "+historicalConflicts+
                  " divergentes. Esta referência ainda exige conferência humana e validação da vigência da lei."
                :"Sem comparação histórica vinculada à página, zona e uso. Nenhum parâmetro foi verificado contra uma fonte documental."}
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-200"
              data-urban-expert-diagnostics="true">
            <table className="w-full min-w-[940px] border-collapse text-left text-sm text-slate-950">
              <thead className="bg-slate-100"><tr>
                <th className="p-2">Parâmetro</th><th className="p-2">Moondream</th>
                <th className="p-2">Gemma 4</th>
                <th className="p-2">Rascunho histórico (não validado)</th>
                <th className="p-2">Resultado e pendência</th>
              </tr></thead>
              <tbody>{expertDiagnostics.map(row=>{
                const history=historicalExpertAudit?.find(h=>h.key===row.key);
                const historicLabel=history?.status==="match"?"Confere com o rascunho — conferir PDF":
                  history?.status==="divergent"?"DIVERGE DO RASCUNHO — verificar PDF":
                  history?.status==="unreadable"?"IA ilegível — pendente":
                  history?.status==="ambiguous"?"Ambíguo — pendente":
                  history?.status==="missing"?"Sem leitura da IA — pendente":
                  "Histórico não comparado";
                return <tr key={row.key} data-urban-expert-row={row.key}
                  className={"border-t "+(history?.status==="divergent"
                    ?"border-rose-300 bg-rose-50":"border-slate-200")}>
                  <td className="p-2 font-bold">{row.label}</td>
                  <td className="p-2">{row.primary??"[ILEGÍVEL]"}</td>
                  <td className="p-2">{row.expert??"[ILEGÍVEL]"}</td>
                  <td className="p-2">{history?.reference??"Não disponível"}</td>
                  <td className="p-2">
                    <p className={row.verdict==="agree"?"font-bold text-emerald-800":"font-extrabold text-rose-900"}>
                      {row.verdict==="agree"?"IAs concordam":
                        row.verdict==="conflict"?"IAs divergem":
                        row.verdict==="one_model_only"?"Uma IA apenas":"Não lido"}
                    </p>
                    <p className={history?.status==="divergent"?"font-extrabold text-rose-900":"font-semibold text-slate-800"}>
                      {historicLabel}
                    </p>
                    {row.verdict!=="agree"||history?.status==="divergent"
                      ?<button type="button" data-urban-expert-select-field={row.key}
                        disabled={visionBusy||busy}
                        onClick={()=>{
                          setFocusCandidates(old=>old.includes(row.key)?old:[...old,row.key]);
                          setFocusSelection(row.key);
                          document.querySelector('[data-urban-focus-review="true"]')?.scrollIntoView({behavior:"smooth",block:"center"});
                        }}
                        className="mt-2 rounded border border-sky-700 bg-white px-2 py-1 text-xs font-extrabold text-sky-900">
                        Conferir este campo
                      </button>:null}
                  </td>
                </tr>;
              })}</tbody>
            </table>
            </div>
            <p className="text-xs font-semibold text-amber-950">
              Concordância entre modelos ou com o rascunho não comprova legislação vigente nem autoriza parâmetros.
              O gabarito textual e a identificação da zona exigem conferência literal no PDF.
            </p>
          </div>:null}
        </section>:null}
      {focusCandidates.length>0 && file && pageImage && consent?
        <section data-urban-focus-review="true"
          className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-slate-950">
          <h6 className="text-base font-extrabold text-slate-950">Leitura avançada — célula por célula</h6>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-800">
            A IA de tabelas pode confundir coeficientes e zonas. A releitura faz UMA pergunta
            sobre UMA coluna de cada vez, como recomenda a documentação do modelo.
            Cada clique pode consumir uma nova chamada à Cloudflare. Nenhuma resposta
            altera o documento, a comparação ou a decisão do analista.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="min-w-[210px] flex-1 text-sm font-bold text-slate-900">
              Campo com problema
              <select value={focusSelection}
                aria-label="Selecionar célula para releitura focada"
                onChange={e=>setFocusSelection(e.target.value as UrbanVisionFieldKey)}
                className="mt-1 min-h-11 w-full rounded-lg border border-amber-300 bg-white px-3 text-slate-950">
                {focusCandidates.map(key=><option key={key} value={key}>
                  {URBAN_VISION_FIELDS.find(([k])=>k===key)?.[1]||key}
                </option>)}
              </select>
            </label>
            <button type="button" data-urban-focus-retry="true" data-sigapro-contrast="dark"
              disabled={visionBusy||busy||!canEdit}
              onClick={()=>void readPageImage("focused")}
              className="min-h-11 rounded-lg border border-sky-900 bg-sky-900 px-4 py-2 text-sm font-extrabold text-white">
              {visionBusy?"Consultando célula…":"Reexaminar somente esta célula"}
            </button>
          </div>
          {focusNotice?<p data-urban-focus-result="true" role="status" aria-live="polite"
            className="mt-3 rounded-lg border border-amber-300 bg-white p-3 text-sm font-bold leading-6 text-slate-950">
            {focusNotice}
          </p>:null}
          {Object.keys(focusedResults).length>0?<div className="mt-3 space-y-2" data-urban-focus-proposals="true">
            {Object.entries(focusedResults).map(([key,value])=><p key={key}
              className="rounded-lg border border-slate-200 bg-white p-2 text-sm text-slate-900">
              <strong>{URBAN_VISION_FIELDS.find(([k])=>k===key)?.[1]||key}:</strong>
              {" "}{value??"[ILEGÍVEL]"} — sugestão separada, requer comparação com o PDF
            </p>)}
          </div>:null}
          <p className="mt-3 text-xs font-bold text-amber-950">
            Dica: para coeficientes pequenos, recorte apenas os respectivos cabeçalhos
            e a mesma linha em alta resolução. A zona e o uso devem ser conferidos
            no PDF original; nunca copie de uma zona para outra.
          </p>
        </section>:null}
      {visionNotice?<p data-urban-vision-status="true" data-state={visionNotice.kind}
        role={visionNotice.kind==="error"?"alert":"status"} aria-live="polite"
        className={"mt-3 rounded-xl border px-4 py-3 text-sm font-bold leading-6 "+(
          visionNotice.kind==="error"?"border-rose-300 bg-rose-50 text-rose-950":
          visionNotice.kind==="success"?"border-emerald-300 bg-emerald-50 text-emerald-950":
          "border-sky-300 bg-white text-slate-950")}>
        {visionNotice.message}
      </p>:null}
      {visionRawPreview?<details data-urban-vision-raw-preview="true"
        className="mt-2 rounded-lg border border-amber-200 bg-white p-3 text-sm text-slate-950">
        <summary className="cursor-pointer font-bold text-slate-900">
          Ver resposta textual da IA rejeitada — somente diagnóstico
        </summary>
        <p className="mt-2 text-sm font-semibold text-amber-950">
          Isto NÃO é uma transcrição validada. O conteúdo abaixo não será importado nem salvo.
        </p>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-xs text-slate-900">{visionRawPreview}</pre>
      </details>:null}
      <p role="status" data-urban-matrix-vision-hint="true" className="mt-2 text-sm font-semibold leading-6 text-slate-900">
        {!file ? "Para habilitar: selecione o PDF oficial acima."
          : !Number.isSafeInteger(Number(page))||Number(page)<1||Number(page)>10000
            ? "Para habilitar: informe a página do PDF ou abra uma linha da matriz para preencher automaticamente."
          : !pageImage ? "Para habilitar: selecione o recorte JPG/PNG da tabela."
          : !consent ? "Imagem carregada. Marque a autorização logo ACIMA do botão para habilitar a leitura."
          : "Leitura liberada: a imagem e a autorização estão prontas. Clique no botão para transcrever."}
      </p>
      {visionFeedback?<div data-urban-structured-vision-result="true" role="status"
        className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-sky-300 bg-white px-4 py-3 text-sm text-slate-950">
        <strong className="text-sky-900">{visionFeedback.recognized}/{visionFeedback.total} células transcritas</strong>
        <span className="text-amber-950">{visionFeedback.missing} sem leitura segura</span>
        <span className="font-semibold text-slate-800">Proposta da IA — não validada</span>
      </div>:null}
      <p className="mt-2 text-sm leading-6 text-slate-800">
        A leitura usa a IA visual Cloudflare da homologação e pode consumir sua franquia.
        A mesma imagem autorizada pode ser reutilizada nesta sessão sem nova cobrança.
        Nenhum dado é ativado ou gravado automaticamente.
      </p>
    </div>
    {preparedManualText ? <details data-urban-transcription-edit="true" id="urban-matrix-transcription"
      className="mt-3 rounded-xl border border-slate-200 bg-white text-slate-950">
      <summary className="cursor-pointer px-4 py-3 text-sm font-extrabold text-sky-950">
        Editar transcrição preparada — abrir somente se precisar corrigir
      </summary>
      <label className="block px-4 pb-4 text-xs font-bold text-slate-800">
        Ao editar, a conferência preparada será invalidada e precisará ser revisada.
        <textarea rows={7} maxLength={6000} value={text}
          onChange={e=>{setText(e.target.value);setExpertDiagnostics(null);setExpertStatus("");setPreparedManualText(null);setOcrVerified(false);reset();}}
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-950"/>
      </label>
    </details> : <label className="mt-3 block text-xs font-bold text-slate-800 dark:text-white">
      Transcrição literal da página — revise números e cabeçalhos antes de importar
      <textarea id="urban-matrix-transcription" rows={7} maxLength={6000} value={text}
        onChange={e=>{setText(e.target.value);setExpertDiagnostics(null);setExpertStatus("");setOcrVerified(false);reset();}}
        placeholder="Cole apenas o trecho da página oficial, com sua linha, cabeçalhos e notas..."
        className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-950"/>
    </label>}
    {matchingOriginalScope && matchingOriginalRow ? <>
      {!ocrDraft && !preparedManualText?<p data-urban-ocr-fallback="true"
        className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-950">
        A comparação está disponível mesmo sem IA. Os valores são da lei original,
        não da transcrição, e não podem ser tratados como índices confirmados sem
        conferência no PDF e validação da vigência legal. Se a Cloudflare expirar,
        não é necessário repetir a leitura para consultar os dados históricos.
      </p>:null}
      <OcrReferenceComparison
        key={[municipalityId,reviewPackage?.arquivo_sha256,reviewRowIndex,zone,usage,page].join(":")}
        row={matchingOriginalRow} analysis={ocrReconciliation}
        preparedText={preparedManualText}
        onInvalidatePrepared={()=>{
          if(preparedManualText && text===preparedManualText){setExpertDiagnostics(null);setExpertStatus("");setText("");}
          setPreparedManualText(null);
          setCandidates([]);setChecked([]);setConsent(false);
        }}
        onPrepareVerified={verifiedText=>{
          setPreparedManualText(verifiedText);
          setExpertDiagnostics(null);setExpertStatus("");setText(verifiedText);
          setOcrDraft(false);setOcrVerified(false);setVisionFeedback(null);
          setCandidates([]);setChecked([]);setConsent(false);
          setMethod("visual_double_transcription");
          // Show one main result beside the button, not a duplicate in the AI panel.
          setVisionNotice(null);
          setMessage("");
        }}/>
    </>:null}
    {ocrDraft && ocrHasIllegibleCell ? <p data-urban-ocr-unresolved="true" role="alert"
      className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm font-bold leading-6 text-rose-950">
      A transcrição contém [ILEGÍVEL]. Não é seguro confirmar nem extrair índices.
      Confira a célula no PDF e substitua o marcador somente se o valor estiver realmente legível.
      Caso contrário, mantenha a linha pendente.
    </p>:null}
    {ocrDraft && ocrReconciliationBlocked ? <p data-urban-ocr-column-block="true" role="alert"
      className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm font-bold leading-6 text-rose-950">
      Conferência bloqueada: a IA não identificou exatamente a zona, o uso e os índices
      da matriz original. Valores em colunas diferentes NÃO podem ser aceitos.
      Ajuste a transcrição com a página oficial antes de confirmar; nenhum índice foi salvo.
    </p>:null}
    {ocrDraft?<label className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-950">
      <input type="checkbox" checked={ocrVerified} disabled={ocrHasIllegibleCell||ocrReconciliationBlocked}
        onChange={e=>setOcrVerified(e.target.checked)}
        className="mt-1"/>
      Conferi a transcrição gerada pela IA com a imagem original, célula por célula,
      incluindo código da zona, uso, vírgulas decimais e recuos.
      Sei que a leitura automática NÃO comprova vigência nem substitui dupla conferência.
    </label>:null}
    <label className="mt-3 block text-xs font-bold text-slate-800 dark:text-white">Método da verificação
      <select value={method} onChange={e=>{setMethod(e.target.value as typeof method);reset();}}
        className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950">
        <option value="text_layer_verified">Conferi a camada de texto com a página original</option>
        <option value="visual_double_transcription">Dupla conferência visual de tabela digitalizada</option>
      </select>
    </label>
    <label data-urban-matrix-text-consent="true"
      className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs font-semibold leading-5 text-slate-900">
      <input type="checkbox" aria-label="Autorizar envio do trecho textual à IA"
        checked={consent} onChange={e=>setConsent(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-sky-800"/>
      Autorizo enviar SOMENTE o trecho da página à IA Cloudflare para extrair propostas.
      O PDF completo permanece local. É a mesma autorização exibida junto ao botão de leitura da imagem.
    </label>
    <p data-urban-text-ai-prerequisites="true" className="mt-2 text-sm font-semibold text-slate-800">
      Esta segunda opção analisa o TEXTO transcrito acima (mínimo 40 caracteres).
      Para ler uma imagem use “Extrair campos por coluna com IA” na seção anterior.
    </p>
    <button type="button" data-urban-matrix-action="extract"
      disabled={busy||!file||text.trim().length<40||!consent||!Number.isSafeInteger(Number(page))||Number(page)<1||
        !zone.trim()||!usage.trim()||(ocrDraft&&(!ocrVerified||ocrHasIllegibleCell||ocrReconciliationBlocked))} onClick={()=>void queryAi()}
      className="mt-3 min-h-11 rounded-xl border border-sky-800 bg-sky-800 px-4 py-2 font-bold text-white">
      {busy?<Loader2 aria-hidden className="mr-2 inline h-4 w-4 animate-spin"/>:null}
      Extrair propostas do trecho — sem salvar
    </button>
    <div data-urban-matrix-manual-card="true" className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-slate-950">
      <h5 className="text-base font-extrabold leading-6 text-slate-950">Registro manual assistido — sem enviar dados à IA</h5>
      <p className="mt-1 text-xs leading-5">
        Use se o PDF for digitalizado ou a Cloudflare não estiver disponível. Transcreva
        o valor e cole uma citação literal da página; o sistema não inventa nenhum índice.
      </p>
      {quadro==="I"?<div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-xs font-bold">Índice identificado na lei
          <select aria-label="Índice para transcrição manual" value={manualMetric}
            onChange={e=>setManualMetric(e.target.value as UrbanMetric)}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-950">
            {URBAN_METRICS.map(m=><option key={m.key} value={m.key}>{m.label} ({m.unit || "un."})</option>)}
          </select>
        </label>
        <label className="text-xs font-bold">Número exatamente como escrito no PDF
          <input aria-label="Número da transcrição manual" value={manualValue}
            onChange={e=>setManualValue(e.target.value)} maxLength={30}
            placeholder="Ex.: 7 ou 1,5"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-950"/>
        </label>
      </div>:<label className="mt-3 block text-xs font-bold">
        Condição de uso para revisão
        <textarea aria-label="Condição de uso transcrita" value={manualNote}
          onChange={e=>setManualNote(e.target.value)} maxLength={400} rows={2}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-950"/>
      </label>}
      <label className="mt-3 block text-xs font-bold">
        Citação literal contínua da página — 20 a 500 caracteres
        <textarea aria-label="Citação exata da página" rows={3} maxLength={500}
          value={manualExcerpt} onChange={e=>setManualExcerpt(e.target.value)}
          placeholder="Cole o trecho idêntico ao texto acima, incluindo o número e sua linha..."
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-950"/>
      </label>
      <button type="button" data-urban-matrix-action="manual" disabled={busy} onClick={addManualCandidate}
        className="mt-3 min-h-11 rounded-xl border border-sky-700 bg-white px-4 py-2 font-bold text-sky-950">
        Adicionar linha para conferência (sem gravar)
      </button>
    </div>
    {candidates.length>0 ? <div className="mt-4 space-y-3">
      <h5 className="text-sm font-bold text-slate-900 dark:text-white">Matriz para conferência — {candidates.length} proposta(s)</h5>
      {candidates.map((item,i)=><label key={i} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900">
        <input aria-label={"Conferi a linha "+(i+1)} className="mt-1" type="checkbox"
          checked={checked.includes(i)}
          onChange={e=>setChecked(old=>e.target.checked?[...old,i]:old.filter(x=>x!==i))}/>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{item.kind==="numeric_index"
            ? item.metric+" = "+item.limit+" (proposta não validada)" : item.note}</p>
          <p className="mt-1 break-words text-slate-700">Citação literal: “{item.source_excerpt}”</p>
          <p className="mt-1 text-xs text-slate-600">Compare com a página {page} do PDF. Marque somente se linha, zona, uso, índice e exceções forem corretos.</p>
        </div>
      </label>)}
      <button type="button" data-sigapro-contrast="dark" disabled={busy||!checked.length||!qaWriteEnabled||(ocrDraft&&(!ocrVerified||ocrHasIllegibleCell||ocrReconciliationBlocked))} onClick={()=>void saveReview()}
        className="sig-premium-dark-action min-h-11 max-w-full rounded-xl border border-slate-900 bg-slate-950 px-5 py-3 font-extrabold !text-white">
        <CheckCircle2 className="mr-2 inline h-4 w-4"/> Registrar linhas conferidas como RASCUNHO
      </button>
      {!qaWriteEnabled?<p role="status" className="text-xs font-semibold text-amber-800">Gravação bloqueada até a Vercel Preview apontar para Neon QA com AUTH e DATA API do mesmo branch. O site oficial permanece intacto.</p>:null}
      <p className="text-xs text-slate-700 dark:text-slate-200">
        Quadro II salva somente condições de uso em versão revisada; não vira índice numérico nem autoriza usos automaticamente.
      </p>
    </div>:null}
    {message?<p role="status" className="mt-4 rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900">{message}</p>:null}
    <div className="mt-5 border-t border-slate-200 pt-3">
      <h5 className="text-sm font-bold text-slate-900 dark:text-white">Importações revisadas desta prefeitura</h5>
      <p className="text-xs text-slate-700 dark:text-slate-200">Todas permanecem como revisão/rascunho, sem ativação automática.</p>
      {!historyChecked ? <p role="status" className="mt-2 text-sm text-slate-700">Consultando registros desta prefeitura…</p> : null}
      {historyChecked && historyError ? <p role="alert" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-bold text-amber-950">Não foi possível verificar o histórico. Os registros podem existir no banco: não cadastre novamente antes de conferir a conexão.</p> : null}
      {historyChecked && !historyError && history.length===0 ? <p data-urban-matrix-empty-history="true" className="mt-2 rounded-lg border border-slate-200 bg-white p-3 text-sm font-semibold text-slate-800">Nenhuma importação revisada foi encontrada neste ambiente QA para esta prefeitura. Os rascunhos de regras manuais ficam em uma lista separada.</p> : null}
      {history.slice(0,12).map(item=><p key={item.id}
        className="mt-2 rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-900">
        Quadro {item.quadro} · {item.zone_code}/{item.use_code} · página {item.page_number} · versão {item.version} · {item.status}
      </p>)}
    </div>
  </section>;
}
