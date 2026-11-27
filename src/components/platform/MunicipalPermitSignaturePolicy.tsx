import { MunicipalItiSandboxSetup } from "./MunicipalItiSandboxSetup";
import { useEffect, useState } from "react";
import { backendClient } from "@/integrations/backend/databaseClient";
import { isNeonBackend } from "@/integrations/backend/config";
import { Button } from "@/components/ui/button";

const kinds = ["construction_permit", "habite_se_permit"] as const;
type Kind = typeof kinds[number];
const labels: Record<Kind,string> = { construction_permit:"Alvará de aprovação", habite_se_permit:"Habite-se" };
const modes = ["internal_allowed","govbr_required","icp_brasil_required"] as const;
type Mode = typeof modes[number];
type Policy = { artifactType: Kind; minimumMode: Mode; legalReference: string; updatedAt: string };
const modeLabels: Record<Mode,string> = { internal_allowed:"Interna admitida pelo ato municipal",govbr_required:"Avançada ou qualificada exigida",icp_brasil_required:"Qualificada ICP-Brasil exigida" };
function parse(value: unknown): Policy[] {
 if (!Array.isArray(value) || value.length>2) throw Error("Política não confirmada.");
 const seen = new Set<string>();
 return value.map(item=>{
  if (!item || !kinds.includes(item.artifactType) || !modes.includes(item.minimumMode) || seen.has(item.artifactType) || typeof item.legalReference!=="string" || typeof item.updatedAt!=="string") throw Error("Política não confirmada.");
  seen.add(item.artifactType); return item as Policy;
 });
}
export function MunicipalPermitSignaturePolicy({municipalityId}:{municipalityId:string}) {
 const [rows,setRows]=useState<Policy[]|null>(null);
 const [kind,setKind]=useState<Kind>("construction_permit");
 const [mode,setMode]=useState<Mode| "">("");
 const [reference,setReference]=useState("");
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  let alive=true;setLoading(true);setRows(null);setError("");setMessage("");setMode("");setReference("");
  if(!isNeonBackend || !backendClient || !municipalityId){setError("Banco municipal indisponível.");setLoading(false);return;}
  void Promise.resolve(backendClient.rpc("get_municipal_permit_signature_policy_v1",{_municipality_id:municipalityId})).then(({data,error})=>{
    if(error) throw Error("Não foi possível consultar a política oficial.");
    const result=parse(data);if(alive)setRows(result);
  }).catch(e=>{if(alive)setError(e instanceof Error?e.message:"Falha na consulta.");}).finally(()=>{if(alive)setLoading(false);});
  return ()=>{alive=false;};
 },[municipalityId,retry]);
 const save=async()=>{
  if(saving||!rows||!mode||reference.trim().length<5)return;
  const warning=mode==="internal_allowed"?"Confirme que o ato normativo municipal admite esta modalidade para este documento. A opção não substitui exigências de lei federal.":"A assinatura certificada ainda não está habilitada. Esta regra bloqueará novas assinaturas e emissões deste alvará até a integração validada. Confirma?";
  if(!window.confirm(warning))return;
  setSaving(true);setMessage("");setError("");
  try {
   const {data,error}=await backendClient.rpc("set_municipal_permit_signature_policy_v1",{_municipality_id:municipalityId,_artifact_type:kind,_minimum_mode:mode,_legal_reference:reference.trim()});
   if(error)throw Error("O banco não confirmou a política. Consulte novamente antes de repetir.");
   setRows(parse(data));setMessage("Política registrada com auditoria.");
  } catch(e){setRows(null);setError(e instanceof Error?e.message:"Falha ao registrar.");}
  finally{setSaving(false);}
 };
 const field="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";
 return <div className="space-y-4 border-t border-slate-200 pt-4 dark:border-slate-700">
  <div><h3 className="text-sm font-bold">Política municipal de assinatura dos alvarás</h3><p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Registre apenas a modalidade prevista em ato normativo vigente. Sem registro, o fluxo legado permanece; isso não certifica sua adequação jurídica. Não há ativação automática.</p></div>
  {loading?<p role="status" className="text-sm">Consultando política oficial…</p>:null}
  {error?<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-100">{error} {!loading&&!rows?<Button type="button" variant="outline" size="sm" onClick={()=>setRetry(v=>v+1)}>Consultar novamente</Button>:null}</div>:null}
  {rows?<><div className="grid gap-2 sm:grid-cols-2">{kinds.map(k=>{const row=rows.find(r=>r.artifactType===k);return <div key={k} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><p className="text-sm font-bold">{labels[k]}</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{row?modeLabels[row.minimumMode]:"Sem política registrada"}</p>{row?<p className="mt-1 break-words text-xs text-slate-600 dark:text-slate-300">{row.legalReference}</p>:null}</div>;})}</div>
   <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-xs font-semibold">Documento<select className={field} disabled={saving} value={kind} onChange={e=>{setKind(e.target.value as Kind);setMode("");setReference("");setMessage("");}}>{kinds.map(k=><option key={k} value={k}>{labels[k]}</option>)}</select></label><label className="space-y-1 text-xs font-semibold">Nível mínimo<select className={field} disabled={saving} value={mode} onChange={e=>setMode(e.target.value as Mode|"")}><option value="">Selecione a modalidade</option>{modes.map(m=><option key={m} value={m}>{modeLabels[m]}</option>)}</select></label></div>
   <label className="block space-y-1 text-xs font-semibold">Ato normativo municipal<input className={field} maxLength={500} disabled={saving} value={reference} onChange={e=>setReference(e.target.value)} placeholder="Número, data e artigo da norma aplicável"/></label>
   {mode&&mode!=="internal_allowed"?<p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-950 dark:bg-amber-950 dark:text-amber-100">A regra bloqueará a emissão e a assinatura interna deste tipo de alvará até a integração certificada estar disponível.</p>:null}
   <Button type="button" disabled={saving||!mode||reference.trim().length<5} onClick={()=>void save()} className="min-h-10 rounded-xl bg-sky-800 !text-white hover:bg-sky-700">{saving?"Registrando…":"Registrar política normativa"}</Button>
  </>:null}
  {String(import.meta.env.VITE_SIGAPRO_NEON_ISOLATED)==="true"?<MunicipalItiSandboxSetup key={municipalityId} municipalityId={municipalityId}/>:null}
  {message?<p role="status" className="text-sm text-emerald-800 dark:text-emerald-200">{message}</p>:null}
 </div>;
}
