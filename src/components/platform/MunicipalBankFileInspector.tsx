import {useEffect,useRef,useState} from "react";
import {FileSearch,ShieldAlert} from "lucide-react";
import {Input} from "@/components/ui/input";
import {inspectBankFile,type BankFileInspection} from "@/lib/bankFileInspector";

const MAX_FILE_BYTES=2_000_000;
export function MunicipalBankFileInspector({municipalityId,bankCode,readOnly=false}:{
 municipalityId:string;bankCode:string;readOnly?:boolean;
}){
 const generation=useRef(0);
 const [result,setResult]=useState<BankFileInspection|null>(null);
 const [error,setError]=useState("");
 const [filename,setFilename]=useState("");
 const [busy,setBusy]=useState(false);
 useEffect(()=>{
  generation.current++;
  setResult(null);setError("");setFilename("");setBusy(false);
  return ()=>{generation.current++;};
 },[municipalityId,bankCode]);
 const inspect=async(file:File|null)=>{
  const request=++generation.current;
  setResult(null);setError("");setFilename("");
  if(!file)return;
  setFilename(file.name);
  if(!file.size||file.size>MAX_FILE_BYTES){
   setError("Arquivo vazio ou acima de 2 MB. Selecione um arquivo menor para conferência local.");
   return;
  }
  setBusy(true);
  try {
   // File.text() is local to the browser. No POST, API, R2 or Neon call.
   const next=inspectBankFile(await file.text(),bankCode);
   if(request===generation.current)setResult(next);
  }catch(cause){
   if(request===generation.current)setError(cause instanceof Error?cause.message:"Não foi possível interpretar o arquivo.");
  }finally{if(request===generation.current)setBusy(false);}
 };
 return <section data-municipal-bank-file-inspector="true" className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
  <div className="flex items-start gap-3">
   <FileSearch className="mt-1 h-5 w-5 shrink-0 text-sky-700 dark:text-sky-300"/>
   <div className="min-w-0 space-y-1">
    <h4 className="text-sm font-bold text-slate-950 dark:text-white">Leitura multibanco — conferência preliminar</h4>
    <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">Reconhece extratos OFX e estruturas CNAB 240/400. O arquivo não sai deste navegador, não cria cobranças e não confirma pagamentos.</p>
   </div>
  </div>
  <Input type="file" accept=".ofx,.ret,.txt,.cnab" aria-label="Selecionar retorno CNAB ou extrato OFX"
   disabled={readOnly||busy} className="mt-3 h-11 cursor-pointer"
   onChange={e=>{void inspect(e.target.files?.[0]??null);}}/>
  {busy?<p role="status" className="mt-2 text-xs text-slate-600">Conferindo o arquivo no navegador...</p>:null}
  {error?<p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{error}</p>:null}
  {result?<div role="status" data-bank-file-readonly="true" className="mt-3 space-y-2 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
   <p className="break-all font-bold">{filename} · {result.format.toUpperCase()}</p>
   <p>Registros: {result.records} · detalhes estruturais: {result.details}</p>
   {result.bankCode?<p>Banco identificado: {result.bankCode}{bankCode?" · banco configurado: "+bankCode:""}</p>:null}
   {result.incomingCredits!==null?<p>Lançamentos positivos no OFX: {result.incomingCredits} (inclui possíveis duplicados) · FITID repetidos: {result.duplicateIdentifiers}</p>:null}
   {result.warnings.map((v,i)=><p key={i} className="text-xs leading-5 text-amber-950">{v}</p>)}
   <p className="flex items-start gap-2 border-t border-sky-200 pt-2 text-xs font-semibold"><ShieldAlert className="h-4 w-4 shrink-0"/>Conferência local, sem autenticação bancária ou baixa automática. A Tesouraria deve verificar a origem e a liquidação oficial.</p>
  </div>:null}
 </section>;
}
