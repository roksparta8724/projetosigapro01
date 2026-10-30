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
  const [history,setHistory] = useState<SavedSnapshot[]>([]);
  const reset = () => {setCandidates([]);setChecked([]);setConsent(false);setMessage("");};

  useEffect(() => {
    let active = true;
    setFile(null);setQuadro("I");setPage("");setText("");setZone("");
    setUsage("");setEffectiveFrom("");reset();setHistory([]);
    if (!municipalityId || !canEdit || !backendClient) return () => {active=false;};
    void backendClient.rpc("list_urban_legal_matrix_imports_v1",
      {_municipality_id: municipalityId}).then(({data,error}:{data:unknown;error:unknown})=>{
      if (!active) return;
      if (error) {setMessage("Matriz em homologação: a estrutura de importação precisa ser ativada na base QA.");return;}
      if (Array.isArray(data)) setHistory(data as SavedSnapshot[]);
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
        setOcrDraft(true);setOcrVerified(false);
        setMessage("Texto preenchido automaticamente como PROPOSTA NÃO VERIFICADA. Compare cada coluna e número com o PDF; corrija o texto e confirme a revisão antes de extrair índices.");
      } finally {bitmap.close();}
    } catch(err) {setMessage(err instanceof Error?err.message:"A leitura visual não foi concluída.");}
    finally{setVisionBusy(false);}
  };
  const queryAi = async () => {
    if (busy || !file || !dateValid(effectiveFrom) || !zone.trim() || !usage.trim() ||
      !Number.isSafeInteger(Number(page)) || Number(page)<1 || Number(page)>10000 ||
      text.trim().length<40 || text.length>6000 || !consent ||
      (ocrDraft && !ocrVerified)) {
      setMessage("Informe página, zona, uso, vigência e texto oficial. Se houve leitura por imagem, confira e confirme primeiro a transcrição; só então autorize extrair propostas.");
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
          documentTitle:file.name,pageText:text.trim()}),
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
        Number(page)<1 || !dateValid(effectiveFrom) || !zone.trim() || !usage.trim() ||
        (ocrDraft && !ocrVerified)) {
      setMessage("Selecione o PDF, página, zona, uso, vigência e transcrição antes de registrar uma linha manual.");
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
      (ocrDraft && !ocrVerified)) {
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
      if(Array.isArray(historyResult.data))setHistory(historyResult.data as SavedSnapshot[]);
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
          onChange={e=>{setFile(e.target.files?.[0]||null);setPageImage(null);setText("");setOcrDraft(false);setOcrVerified(false);reset();}}/>
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
    <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-slate-950">
      <h5 className="text-sm font-extrabold">Ler tabela digitalizada com IA — preenchimento assistido</h5>
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
      <button type="button" disabled={visionBusy||busy||!pageImage||!consent}
        onClick={()=>void readPageImage()}
        className="mt-3 min-h-11 rounded-xl bg-sky-800 px-4 py-2 text-sm font-bold !text-white disabled:cursor-not-allowed disabled:opacity-70">
        {visionBusy?"Lendo a tabela…":"Ler imagem e pré-preencher a transcrição com IA"}
      </button>
      <p className="mt-2 text-xs text-slate-700">A leitura usa a IA visual Cloudflare da homologação e pode consumir sua franquia. Sem ativação ou gravação automática.</p>
    </div>
    <label className="mt-3 block text-xs font-bold text-slate-800 dark:text-white">
      Transcrição literal da página — revise números e cabeçalhos antes de importar
      <textarea rows={7} maxLength={6000} value={text}
        onChange={e=>{setText(e.target.value);setOcrVerified(false);reset();}}
        placeholder="Cole apenas o trecho da página oficial, com sua linha, cabeçalhos e notas..."
        className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-950"/>
    </label>
    {ocrDraft?<label className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-950">
      <input type="checkbox" checked={ocrVerified} onChange={e=>setOcrVerified(e.target.checked)}
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
    <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-800 dark:text-slate-200">
      <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} className="mt-1"/>
      Confirmo que selecionei a página do documento oficial. Ao clicar em “Ler imagem” ou “Extrair propostas”, autorizo enviar SOMENTE o recorte ou trecho à IA Cloudflare; o arquivo PDF completo permanece local.
    </label>
    <button type="button" disabled={busy} onClick={()=>void queryAi()}
      className="mt-3 min-h-11 rounded-xl bg-sky-800 px-4 py-2 font-semibold !text-white disabled:opacity-70">
      {busy?<Loader2 aria-hidden className="mr-2 inline h-4 w-4 animate-spin"/>:null}
      Extrair propostas do trecho — sem salvar
    </button>
    <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-slate-900">
      <h5 className="text-sm font-extrabold">Registro manual assistido — sem enviar dados à IA</h5>
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
      <button type="button" disabled={busy} onClick={addManualCandidate}
        className="mt-3 min-h-11 rounded-xl border border-sky-700 bg-white px-4 py-2 font-bold text-sky-950 disabled:opacity-70">
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
      <button type="button" disabled={busy||!checked.length||!qaWriteEnabled||(ocrDraft&&!ocrVerified)} onClick={()=>void saveReview()}
        className="min-h-11 rounded-xl border border-slate-900 bg-slate-950 px-4 py-2 font-bold !text-white disabled:opacity-70">
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
      {history.slice(0,12).map(item=><p key={item.id}
        className="mt-2 rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-900">
        Quadro {item.quadro} · {item.zone_code}/{item.use_code} · página {item.page_number} · versão {item.version} · {item.status}
      </p>)}
    </div>
  </section>;
}
