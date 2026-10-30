import { useEffect, useState } from "react";
import { BookText, CheckCircle2, FileText, Loader2, ShieldAlert } from "lucide-react";
import { backendClient } from "@/integrations/backend/databaseClient";
import { normalizeUrbanCode, URBAN_METRICS, type UrbanMetric } from "@/lib/urbanPrecheck";
import { extractLiteralCandidates, parsedLiteralNumber, validateImportDate,
  type ImportQuadro, type UrbanExtractedCandidate } from "@/lib/urbanMatrixImport";

type Props = { municipalityId: string; canEdit: boolean; onSaved: () => Promise<void> };
type SavedSnapshot = { id: string; version: number; quadro: ImportQuadro; zone_code: string;
  use_code: string; page_number: number; status: string; document_title: string };
type ExtractionReply = { candidates?: unknown; error?: string; quadro?: ImportQuadro;
  status?: string; automaticallyActivated?: boolean };
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

function OcrReferenceComparison({row}:{row:ReviewPackageRow}) {
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
  return <section data-urban-ocr-comparison="true"
    aria-label="Conferência dos parâmetros com o PDF"
    className="mt-4 rounded-xl border border-sky-300 bg-white p-4 text-slate-950">
    <h5 className="text-base font-extrabold text-slate-950">Comparação de colunas — PDF × matriz histórica</h5>
    <p className="mt-1 text-sm leading-6 text-slate-800">
      Página {row.pagina_pdf} · {row.zona_conforme_tabela} · {row.uso_predominante_conforme_tabela}.
      Estes valores vieram do pacote JSON da lei original.
      Não são valores confirmados pela IA nem comprovação da vigência atual.
      Compare cada coluna com a imagem antes de corrigir a transcrição acima.
    </p>
    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full border-collapse text-left text-sm text-slate-950">
        <thead className="bg-slate-100">
          <tr><th scope="col" className="p-2 font-bold">Parâmetro</th>
            <th scope="col" className="p-2 font-bold">JSON (original)</th>
            <th scope="col" className="p-2 font-bold">Situação</th></tr>
        </thead>
        <tbody>{values.map(([label,value])=><tr key={label} className="border-t border-slate-200">
          <th scope="row" className="p-2 font-semibold">{label}</th>
          <td className="p-2 font-bold">{value}</td>
          <td className="p-2 font-semibold text-amber-950">Conferir na imagem</td>
        </tr>)}</tbody>
      </table>
    </div>
    {row.observacoes_especificas?<p className="mt-3 text-sm font-semibold text-amber-950">
      Observações e exceções originais: {row.observacoes_especificas}
    </p>:null}
    {row.pendencias_de_leitura?<p className="mt-2 text-sm font-bold text-rose-950">
      Pendência da leitura original: {row.pendencias_de_leitura}
    </p>:null}
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
  const [previewUrl,setPreviewUrl] = useState("");
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
  const [text,setText] = useState("");
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
  const reset = () => {setCandidates([]);setChecked([]);setConsent(false);setMessage("");};
  const loadStructuredReview = async (incoming: File | null) => {
    setReviewPackage(null);setReviewRowIndex(0);
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
      setMessage("Pacote de revisão carregado com conferência SHA-256 do PDF. Selecione uma linha para pré-preencher apenas o escopo. A legislação vigente ainda precisa ser validada.");
    } catch(e) {setMessage("Pacote não carregado: "+(e instanceof Error?e.message:"erro desconhecido"));}
    finally {setReviewLoading(false);}
  };
  const applyReviewRow = () => {
    const row=reviewPackage?.quadro_I[reviewRowIndex];
    if(!row || !canEdit || busy) return;
    setQuadro("I");setPage(String(row.pagina_pdf));
    setZone(normalizeUrbanCode(row.zona_conforme_tabela));
    setUsage(normalizeUrbanCode(row.uso_predominante_conforme_tabela));
    setEffectiveFrom("");setText("");setOcrDraft(false);setOcrVerified(false);
    setCandidates([]);setChecked([]);setConsent(false);
    setMessage("Página, zona e uso preenchidos para revisão. Os valores abaixo são da lei ORIGINAL e não foram gravados. Confira a linha no PDF e possíveis alterações posteriores; a vigência continua em branco.");
  };

  useEffect(() => {
    let active = true;
    setFile(null);setQuadro("I");setPage("");setText("");setZone("");
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
  const readPageImage = async () => {
    if(visionBusy || busy || !canEdit || !file || !pageImage || !consent ||
      !Number.isSafeInteger(Number(page)) || Number(page)<1 || Number(page)>10000){
      setMessage("Selecione PDF oficial, página física e imagem recortada da tabela. Autorize a consulta à IA antes de prosseguir.");return;
    }
    setVisionBusy(true);setCandidates([]);setChecked([]);setMessage("");
    try {
      if(pageImage.size>12*1024*1024 || !["image/jpeg","image/png"].includes(pageImage.type))
        throw Error("Selecione uma imagem JPG/PNG de até 12 MB (antes de comprimir).");
      const bitmap=await createImageBitmap(pageImage);
      try {
        if(bitmap.width<400 || bitmap.height<140)
          throw Error("Imagem muito pequena. Amplie a tabela e recorte uma linha com os cabeçalhos.");
        const ratio=Math.min(1,1900/Math.max(bitmap.width,bitmap.height));
        const canvas=document.createElement("canvas");
        canvas.width=Math.round(bitmap.width*ratio);
        canvas.height=Math.round(bitmap.height*ratio);
        const ctx=canvas.getContext("2d");
        if(!ctx)throw Error("Seu navegador não conseguiu ler a imagem.");
        ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
        let data=canvas.toDataURL("image/jpeg",0.82);
        if(data.length>1_400_000)data=canvas.toDataURL("image/jpeg",0.65);
        if(data.length>1_400_000)
          throw Error("A imagem ainda está grande. Faça um recorte apenas da linha e do cabeçalho da tabela.");
        const session=await backendClient?.auth?.getSession?.();
        const bearer=String(session?.data?.session?.access_token||session?.data?.session?.accessToken||"");
        if(!bearer)throw Error("Sua sessão expirou. Entre novamente no SIGAPRO.");
        const response=await fetch("/api/ai-assistant",{
          method:"POST",credentials:"same-origin",cache:"no-store",
          headers:{"Content-Type":"application/json",Authorization:"Bearer "+bearer,
            "X-SIGAPRO-VISION":"1"},
          body:JSON.stringify({action:"urban-matrix-vision",quadro,
            pageNumber:Number(page),imageDataUrl:data}),
        });
        const result=await response.json() as {draftText?:unknown;error?:string};
        if(!response.ok)throw Error(result.error||"Falha na leitura visual.");
        if(typeof result.draftText!=="string"||result.draftText.trim().length<20)
          throw Error("A IA não conseguiu transcrever esse recorte com segurança.");
        setText(result.draftText.trim().slice(0,6000));
        setOcrDraft(true);setOcrVerified(false);setMethod("visual_double_transcription");
        setMessage("Texto preenchido automaticamente como PROPOSTA NÃO VERIFICADA. Compare cada coluna e número com o PDF; corrija o texto e confirme a revisão antes de extrair índices.");
      } finally {bitmap.close();}
    } catch(err) {setMessage(err instanceof Error?err.message:"A leitura visual não foi concluída.");}
    finally{setVisionBusy(false);}
  };
  const queryAi = async () => {
    if (busy || !file || !zone.trim() || !usage.trim() ||
      !Number.isSafeInteger(Number(page)) || Number(page)<1 || Number(page)>10000 ||
      text.trim().length<40 || text.length>6000 || !consent ||
      (ocrDraft && (!ocrVerified || ocrHasIllegibleCell))) {
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
        (ocrDraft && (!ocrVerified || ocrHasIllegibleCell))) {
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
      (ocrDraft && (!ocrVerified || ocrHasIllegibleCell))) {
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
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <label className="text-xs font-bold text-slate-800 dark:text-white">Arquivo PDF oficial
        <input type="file" accept=".pdf,application/pdf" className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-slate-900"
          onChange={e=>{setFile(e.target.files?.[0]||null);setReviewPackage(null);setReviewRowIndex(0);setPageImage(null);setText("");setOcrDraft(false);setOcrVerified(false);reset();}}/>
      </label>
      <label className="text-xs font-bold text-slate-800 dark:text-white">Quadro de origem
        <select value={quadro} onChange={e=>{setQuadro(e.target.value as ImportQuadro);reset();}}
          className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950">
          <option value="I">Quadro I — Índices numéricos</option>
          <option value="II">Quadro II — Categorias e condições de uso</option>
        </select>
      </label>
      <label className="text-xs font-bold text-slate-800 dark:text-white">Página física do PDF
        <input aria-label="Número de página do PDF" type="number" min="1" max="10000" value={page}
          onChange={e=>{setPage(e.target.value);setText("");setOcrDraft(false);setOcrVerified(false);reset();}} placeholder="Informe a página visualizada"
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
        <label className="mt-3 block text-xs font-bold text-slate-900">
          Selecione a zona e o uso conforme tabela de origem
          <select aria-label="Linha extraída para pré-preenchimento" value={reviewRowIndex}
            onChange={e=>setReviewRowIndex(Number(e.target.value))}
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
          return <div className="mt-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {values.map(([title,value])=><p key={title} className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs leading-5 text-slate-950">
                <strong className="block font-bold text-slate-700">{title}</strong>{value}
              </p>)}
            </div>
            {row.observacoes_especificas?<p className="mt-2 text-xs leading-5 text-amber-950">Exceções da tabela: {row.observacoes_especificas}</p>:null}
            {row.pendencias_de_leitura?<p role="alert" className="mt-2 text-xs font-bold leading-5 text-rose-900">Leitura pendente: {row.pendencias_de_leitura}</p>:null}
          </div>;
        })() : null}
        <button type="button" data-urban-review-apply="true" data-sigapro-contrast="dark"
          className="sig-premium-dark-action mt-3 min-h-11 max-w-full rounded-xl border border-slate-900 bg-slate-950 px-5 py-3 text-sm font-extrabold !text-white shadow-sm transition-colors hover:bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          onClick={applyReviewRow}>Pré-preencher página, zona e uso para conferência</button>
        <p className="mt-2 text-xs font-semibold leading-5 text-amber-950">Valores históricos apenas para comparação. A transcrição literal, a vigência e a confirmação humana continuam obrigatórias para gravar um rascunho no Neon QA.</p>
      </div>:null}
    </div>
    {previewUrl?<div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
      <p className="mb-2 text-xs font-bold text-slate-800">
        Conferência visual: PDF local selecionado (não enviado ao servidor)
      </p>
      <iframe title="Visualização local do PDF oficial para conferir a página"
        src={previewUrl+"#page="+(Number(page)>0?Number(page):1)}
        loading="lazy" className="h-[360px] w-full rounded-lg border border-slate-200"/>
      <a className="mt-2 block text-sm font-semibold text-sky-800 underline"
        href={previewUrl+"#page="+(Number(page)>0?Number(page):1)}
        target="_blank" rel="noreferrer">Abrir documento local na página selecionada</a>
    </div>:null}
    <div data-urban-matrix-ai-card="true" className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-slate-950">
      <h5 className="text-base font-extrabold leading-6 text-slate-950">Ler tabela digitalizada com IA — preenchimento assistido</h5>
      <p className="mt-1 text-xs leading-5">
        Para Quadros I/II que são imagens: abra o PDF em zoom 100–150%, capture
        somente o cabeçalho e a linha de uma zona (Win + Shift + S), salve como PNG/JPG
        e selecione abaixo. A IA transcreve o recorte; pode confundir células,
        portanto você precisa comparar e corrigir antes de usar qualquer valor.
      </p>
      <label className="mt-3 block text-xs font-bold">
        Imagem recortada da página (não o PDF completo)
        <input aria-label="Imagem da linha do Quadro I ou II" type="file" accept="image/png,image/jpeg"
          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2"
          onChange={e=>{setPageImage(e.target.files?.[0]||null);setOcrDraft(false);
            setOcrVerified(false);setText("");reset();}}/>
      </label>
      {pageImagePreview?<img src={pageImagePreview} alt="Prévia local da linha fotografada do quadro"
        className="mt-2 max-h-60 w-full rounded-lg border border-slate-200 object-contain"/>:null}
      <label data-urban-matrix-vision-consent="true"
        className="mt-3 flex items-start gap-3 rounded-xl border border-sky-300 bg-white p-3 text-sm font-bold leading-5 text-slate-950">
        <input type="checkbox" aria-label="Autorizar leitura da imagem pela IA"
          checked={consent} onChange={e=>setConsent(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-sky-800"/>
        Autorizo enviar somente o recorte da tabela à IA Cloudflare para transcrição.
        O PDF completo permanece local. Ao trocar a imagem, confirmarei a autorização novamente.
      </label>
      <button type="button" data-urban-matrix-action="vision"
        disabled={visionBusy||busy||!file||!pageImage||!consent||!Number.isSafeInteger(Number(page))||Number(page)<1||Number(page)>10000}
        onClick={()=>void readPageImage()}
        className="mt-3 min-h-11 rounded-xl border border-sky-800 bg-sky-800 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed">
        {visionBusy?"Lendo a tabela…":"Ler imagem e pré-preencher a transcrição com IA"}
      </button>
      <p role="status" data-urban-matrix-vision-hint="true" className="mt-2 text-sm font-semibold leading-6 text-slate-900">
        {!file ? "Para habilitar: selecione o PDF oficial acima."
          : !Number.isSafeInteger(Number(page))||Number(page)<1||Number(page)>10000
            ? "Para habilitar: informe a página física do PDF acima."
          : !pageImage ? "Para habilitar: selecione o recorte JPG/PNG da tabela."
          : !consent ? "Imagem carregada. Marque a autorização logo ACIMA do botão para habilitar a leitura."
          : "Leitura liberada: a imagem e a autorização estão prontas. Clique no botão para transcrever."}
      </p>
      <p className="mt-2 text-sm leading-6 text-slate-800">A leitura usa a IA visual Cloudflare da homologação e pode consumir sua franquia. Nenhum dado é ativado ou gravado automaticamente.</p>
    </div>
    <label className="mt-3 block text-xs font-bold text-slate-800 dark:text-white">
      Transcrição literal da página — revise números e cabeçalhos antes de importar
      <textarea rows={7} maxLength={6000} value={text}
        onChange={e=>{setText(e.target.value);setOcrVerified(false);reset();}}
        placeholder="Cole apenas o trecho da página oficial, com sua linha, cabeçalhos e notas..."
        className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-950"/>
    </label>
    {ocrDraft && matchingOriginalScope && matchingOriginalRow ? <OcrReferenceComparison row={matchingOriginalRow}/>:null}
    {ocrDraft && ocrHasIllegibleCell ? <p data-urban-ocr-unresolved="true" role="alert"
      className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm font-bold leading-6 text-rose-950">
      A transcrição contém [ILEGÍVEL]. Não é seguro confirmar nem extrair índices.
      Confira a célula no PDF e substitua o marcador somente se o valor estiver realmente legível.
      Caso contrário, mantenha a linha pendente.
    </p>:null}
    {ocrDraft?<label className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-950">
      <input type="checkbox" checked={ocrVerified} disabled={ocrHasIllegibleCell}
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
    <button type="button" data-urban-matrix-action="extract"
      disabled={busy||(ocrDraft&&(!ocrVerified||ocrHasIllegibleCell))} onClick={()=>void queryAi()}
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
      <button type="button" data-sigapro-contrast="dark" disabled={busy||!checked.length||!qaWriteEnabled||(ocrDraft&&(!ocrVerified||ocrHasIllegibleCell))} onClick={()=>void saveReview()}
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
