import {useEffect,useMemo,useState} from "react";
import {BookOpenCheck,FileCheck2,Loader2,ShieldAlert} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {UrbanPdfPageCanvas} from "./UrbanPdfPageCanvas";
import {listUrbanLegalEvidence,saveScopedUrbanLegalEvidence} from "@/integrations/backend/urbanPrecheckClient";
import type {UrbanVerifiedLegalSource} from "@/lib/urbanLegalProof";
import {URBAN_METRICS,normalizeUrbanCode,type UrbanMetric,type UrbanRegulationVersion}
  from "@/lib/urbanPrecheck";
import {verifyUrbanEvidenceInput,
  type UrbanEvidenceMethod,type UrbanLegalSourceContext} from "@/lib/urbanLegalEvidenceRegistration";
import {readUrbanPdfSourcePage} from "@/lib/urbanPdfTextLayer";

type Props={municipalityId:string;canEdit:boolean;versions:UrbanRegulationVersion[];
  sourceContext?:UrbanLegalSourceContext|null};
const validDate=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v);
export function UrbanLegalEvidenceCatalogPanel({municipalityId,canEdit,versions,sourceContext}:Props){
 const [versionId,setVersionId]=useState("");
 const [metric,setMetric]=useState<UrbanMetric|"">("");
 const [file,setFile]=useState<File|null>(null);
 const [title,setTitle]=useState("");
 const [page,setPage]=useState("1");
 const [excerpt,setExcerpt]=useState("");
 const [repeatExcerpt,setRepeatExcerpt]=useState("");
 const [method,setMethod]=useState<UrbanEvidenceMethod>("visual_double_transcription");
 const [validFrom,setValidFrom]=useState("");
 const [validUntil,setValidUntil]=useState("");
 const [attested,setAttested]=useState(false);
 const [evidence,setEvidence]=useState<UrbanVerifiedLegalSource[]>([]);
 const [loading,setLoading]=useState(false);
 const [saving,setSaving]=useState(false);
 const [notice,setNotice]=useState("");
 const matchingLegalVersions=useMemo(()=>sourceContext
   ?versions.filter(v=>v.municipality_id===municipalityId&&["active","draft"].includes(v.status)&&
      normalizeUrbanCode(v.zone_code)===normalizeUrbanCode(sourceContext.zone)&&
      normalizeUrbanCode(v.use_code)===normalizeUrbanCode(sourceContext.usage))
   :[],[versions,sourceContext,municipalityId]);
 useEffect(()=>{
   if(!sourceContext)return;
   // File references stay only in the authenticated browser session.
   setFile(sourceContext.file);
   setTitle(sourceContext.file.name.replace(/\\.pdf$/i,"").slice(0,180));
   setPage(String(sourceContext.physicalPage));
   setExcerpt("");setRepeatExcerpt("");setAttested(false);setMetric("");
   // Do not silently use an unrelated QA test version. Auto-pick only a
   // uniquely matching real zone/use, otherwise require a human choice.
   const versionsForScope=versions.filter(v=>v.municipality_id===municipalityId &&
     ["active","draft"].includes(v.status)&&
     normalizeUrbanCode(v.zone_code)===normalizeUrbanCode(sourceContext.zone)&&
     normalizeUrbanCode(v.use_code)===normalizeUrbanCode(sourceContext.usage));
   setVersionId(versionsForScope.length===1?versionsForScope[0].id:"");
   setValidFrom(versionsForScope.length===1?versionsForScope[0].effective_from:"");
   setValidUntil("");
   setNotice("");
 },[sourceContext,municipalityId,versions]);
 const selected=useMemo(()=>versions.find(x=>x.id===versionId&&x.municipality_id===municipalityId&&
   (x.status==="active"||x.status==="draft"))??null,[versions,municipalityId,versionId]);
 const matching=useMemo(()=>{
   if(!selected)return [];
   const refDate=validDate(validFrom)?validFrom:selected.effective_from;
   return evidence.filter(e=>e.municipality_id===municipalityId &&
     normalizeUrbanCode(e.zone_code)===normalizeUrbanCode(selected.zone_code)&&
     normalizeUrbanCode(e.use_code)===normalizeUrbanCode(selected.use_code)&&
     e.effective_from<=refDate&&(!e.effective_until||e.effective_until>=refDate));
 },[evidence,selected,municipalityId,validFrom]);
 useEffect(()=>{
   let alive=true;setEvidence([]);setVersionId("");setMetric("");setFile(null);setNotice("");
   if(!municipalityId)return;
   setLoading(true);
   void listUrbanLegalEvidence(municipalityId).then(rows=>{
     if(alive)setEvidence(rows);
   }).catch(e=>{if(alive)setNotice("Não foi possível consultar as evidências legais: "+
       (e instanceof Error?e.message:"erro de acesso"));})
     .finally(()=>{if(alive)setLoading(false);});
   return ()=>{alive=false};
 },[municipalityId]);
 const chooseVersion=(id:string)=>{
   setVersionId(id);setMetric("");setAttested(false);setExcerpt("");setRepeatExcerpt("");
   setValidFrom(versions.find(v=>v.id===id)?.effective_from??"");setValidUntil("");setNotice("");
 };
 const chooseFile=(chosen:File|null)=>{
   setFile(chosen);setTitle(chosen?.name.replace(/\.pdf$/i,"").slice(0,180)??"");
   setAttested(false);setNotice("");
 };
 const save=async()=>{
   if(saving||!canEdit)return;
   const pageNumber=Number(page);
   const error=verifyUrbanEvidenceInput({
     version:selected,municipalityId,metric,filename:file?.name??"",
     fileSize:file?.size??0,page:pageNumber,excerpt,repeatExcerpt,method,
     from:validFrom,until:validUntil,confirmed:attested,
   });
   if(error){setNotice(error);return;}
   if(!selected||!file||!metric)return;
   if(title.trim().length<4||title.trim().length>180){
     setNotice("Informe a identificação da lei ou documento oficial (4–180 caracteres).");return;
   }
   setSaving(true);setNotice("");
   try{
     const bytes=await file.arrayBuffer();
     if(new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")
       throw Error("O arquivo selecionado não possui assinatura PDF.");
     // Always open the physical page, even when the analyst transcribed visually.
     const layer=await readUrbanPdfSourcePage(file,pageNumber,selected.zone_code,selected.use_code);
     const textLayer=[...layer.runs].sort((a,b)=>a.y-b.y||a.x-b.x).map(r=>r.text).join(" ");
     const validation=verifyUrbanEvidenceInput({
       version:selected,municipalityId,metric,filename:file.name,fileSize:file.size,
       page:pageNumber,excerpt,repeatExcerpt,method,
       from:validFrom,until:validUntil,confirmed:attested,textLayer,
     });
     if(validation)throw Error(validation);
     if(layer.runCount>3500)throw Error("Camada de texto truncada. Use PDF mais legível para esta página.");
     const digest=await crypto.subtle.digest("SHA-256",bytes);
     const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
     const id=await saveScopedUrbanLegalEvidence({
       versionId:selected.id,title:title.trim(),sha256:hash,page:pageNumber,
       metric,excerpt:excerpt.trim(),from:validFrom,until:validUntil||null,method,
     });
     const refreshed=await listUrbanLegalEvidence(municipalityId);
     if(!refreshed.some(item=>item.id===id&&item.metric===metric&&item.document_sha256===hash))
       throw Error("A fonte foi enviada, mas não foi confirmada na releitura do Neon.");
     setEvidence(refreshed);setAttested(false);setExcerpt("");setRepeatExcerpt("");
     setNotice("Fonte registrada e confirmada no Neon QA. A norma não foi ativada; confira as demais métricas e a vigência.");
   }catch(error){setNotice(error instanceof Error?error.message:"Falha ao vincular documento e índice.");}
   finally{setSaving(false);}
 };
 return <section id="urban-legal-evidence-catalog" data-urban-legal-evidence-catalog="true"
   className="mt-5 min-w-0 rounded-2xl border border-sky-200 bg-white p-4 text-slate-950 dark:border-sky-700 dark:bg-slate-900 dark:text-white">
   <h4 className="flex items-center gap-2 text-sm font-extrabold">
     <BookOpenCheck className="h-4 w-4"/> Fontes legais por zona, uso e índice
   </h4>
   <p className="mt-2 text-xs leading-5 text-slate-700 dark:text-slate-200">
     Selecione uma versão cadastrada e confira a lei oficial no PDF. A vinculação registra
     documento, SHA-256, página física, trecho e método de conferência. Não ativa parâmetros
     nem comprova, por si só, que a legislação continua vigente.
   </p>
   {sourceContext?<div data-urban-source-context="true"
     className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs font-semibold leading-5 text-sky-950">
      <p>Origem reaproveitada da leitura: {sourceContext.file.name}, página física {sourceContext.physicalPage},
        {" "}{sourceContext.zone} · {sourceContext.usage}.
      </p>
      <p className="mt-1">Os dados da leitura são apenas uma referência para comparação:
        não ativam regras, não comprovam vigência e não substituem a conferência do administrador.</p>
      {matchingLegalVersions.length===0?<p className="mt-2 font-extrabold text-amber-950">
        Nenhuma versão cadastrada coincide com esta zona e uso. A versão de teste de outra zona
        não pode receber estes índices. Confira primeiro o cadastro e crie um rascunho
        fundamentado antes de vincular as evidências.
      </p>:null}
     </div>:null}
   <label className="mt-3 block text-xs font-bold">Versão municipal
    <select value={versionId} onChange={e=>chooseVersion(e.target.value)} disabled={!canEdit||loading||saving}
      aria-label="Versão da norma para vincular evidências"
      className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950">
      <option value="">Selecione a zona, o uso e a versão...</option>
      {versions.filter(v=>v.municipality_id===municipalityId&&["active","draft"].includes(v.status))
        .map(v=><option key={v.id} value={v.id}>
          {v.zone_code} · {v.use_code} · v{v.version} · {v.status==="draft"?"rascunho":"ativa"}
        </option>)}
    </select>
   </label>
   {selected?<div className="mt-3 space-y-3">
      <div data-urban-legal-metric-coverage="true"
        className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900">
        <p className="font-extrabold">Índices nesta versão municipal ({selected.status==="active"?"ativa":"rascunho"}): {selected.rules.length} · Fontes vinculadas:
         {" "}{selected.rules.filter(r=>matching.some(e=>e.metric===r.metric)).length} de {selected.rules.length}
        </p>
        <div className="mt-2 grid gap-1 sm:grid-cols-2">
          {selected.rules.map(rule=><p key={rule.metric} className="font-medium">
            {matching.some(e=>e.metric===rule.metric)?"✓":"Pendente ·"}{" "}
            {URBAN_METRICS.find(x=>x.key===rule.metric)?.label??rule.metric}
          </p>)}
        </div>
        {evidence.length>=250?<p className="mt-2 font-bold text-amber-900">
          O catálogo alcançou o limite da consulta. Não considere esta cobertura completa.
        </p>:null}
      </div>
      {canEdit?<div className="grid gap-3 lg:grid-cols-2">
        <label className="text-xs font-bold">Índice urbanístico
          <select value={metric} onChange={e=>{setMetric(e.target.value as UrbanMetric);setAttested(false)}}
            disabled={saving} aria-label="Métrica para vincular fonte"
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950">
            <option value="">Selecione o índice...</option>
            {selected.rules.map(rule=><option key={rule.metric} value={rule.metric}>
              {URBAN_METRICS.find(x=>x.key===rule.metric)?.label??rule.metric}
            </option>)}
          </select>
        </label>
        <label className="text-xs font-bold">PDF oficial (máx. 100 MB)
          <Input type="file" accept=".pdf,application/pdf" disabled={saving}
            className="mt-1" aria-label="Documento oficial em PDF"
            onChange={e=>chooseFile(e.target.files?.[0]??null)}/>
        </label>
        <label className="text-xs font-bold">Lei / título do documento
          <Input value={title} maxLength={180} disabled={saving}
            className="mt-1" onChange={e=>setTitle(e.target.value)}/>
        </label>
        <label className="text-xs font-bold">Página física do arquivo
          <Input type="number" min={1} max={10000} step={1} value={page} disabled={saving}
            className="mt-1" onChange={e=>setPage(e.target.value)}/>
        </label>
        <label className="text-xs font-bold">Vigência verificada desde
          <Input type="date" value={validFrom} disabled={saving}
            className="mt-1" onChange={e=>{setValidFrom(e.target.value);setAttested(false)}}/>
        </label>
        <label className="text-xs font-bold">Fim da vigência (se aplicável)
          <Input type="date" value={validUntil} disabled={saving}
            className="mt-1" onChange={e=>{setValidUntil(e.target.value);setAttested(false)}}/>
        </label>
        <label className="text-xs font-bold lg:col-span-2">Método da conferência
          <select value={method} disabled={saving}
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950"
            onChange={e=>{setMethod(e.target.value as UrbanEvidenceMethod);setAttested(false)}}>
            <option value="visual_double_transcription">Conferência da imagem + dupla transcrição</option>
            <option value="text_layer_verified">Trecho literal da camada de texto</option>
          </select>
        </label>
        <label className="text-xs font-bold lg:col-span-2">Trecho exato da lei na página selecionada
          <textarea rows={3} value={excerpt} maxLength={500} disabled={saving}
            aria-label="Trecho legal transcrito" onChange={e=>{setExcerpt(e.target.value);setAttested(false)}}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-950"/>
        </label>
        {method==="visual_double_transcription"?<label className="text-xs font-bold lg:col-span-2">
          Repita o mesmo trecho para conferência visual
          <textarea rows={2} value={repeatExcerpt} maxLength={500} disabled={saving}
            aria-label="Segunda transcrição visual" onChange={e=>{setRepeatExcerpt(e.target.value);setAttested(false)}}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-950"/>
        </label>:null}
        {file&&Number.isSafeInteger(Number(page))&&Number(page)>0&&Number(page)<=10000?
          <div className="lg:col-span-2">
            <UrbanPdfPageCanvas file={file} pageNumber={Number(page)}/>
          </div>:null}
        <label className="flex items-start gap-2 text-xs font-semibold leading-5 lg:col-span-2">
          <input type="checkbox" checked={attested} disabled={saving}
            className="mt-1 h-4 w-4 accent-sky-800" onChange={e=>setAttested(e.target.checked)}/>
          Conferi pessoalmente o PDF oficial, a página, a zona, o uso, o artigo,
          as alterações e a vigência. Reconheço que esta declaração não ativa normas nem aprova projetos.
        </label>
      </div>:null}
      {canEdit?<Button type="button" disabled={saving||!selected||!file||!metric||!attested}
        onClick={()=>void save()} className="bg-sky-900 text-white hover:bg-sky-800">
         {saving?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<FileCheck2 className="mr-2 h-4 w-4"/>}
         Vincular fonte legal conferida
       </Button>:null}
   </div>:<p className="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-900">
      <ShieldAlert className="h-4 w-4"/> Escolha primeiro a versão cadastrada; zonas compostas exigem verificação individual.
   </p>}
   {notice?<p role="status" className="mt-3 rounded-lg border border-slate-300 bg-slate-50 p-3 text-xs font-semibold text-slate-900">{notice}</p>:null}
 </section>;
}
