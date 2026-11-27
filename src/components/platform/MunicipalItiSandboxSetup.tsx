import {useEffect,useState} from "react";
import {backendClient} from "@/integrations/backend/databaseClient";
import {Button} from "@/components/ui/button";
type Status={configured:boolean;archiveConfigured:boolean;trustConfigured:boolean;runtimeEnabled:boolean;registeredCallback:string|null;issuanceAuthorized:false};
async function request(municipalityId:string,action:"get"|"save",fields:Record<string,string>={}){
 const session=(await backendClient.auth.getSession())?.data?.session;
 const token=session?.access_token||session?.accessToken||session?.token;
 if(!token)throw Error("Sua sessão expirou.");
 const response=await fetch("/api/e-sign-artifact?action=certified-icp-configuration",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},cache:"no-store",body:JSON.stringify({municipalityId,action,...fields})});
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data?.ok||data.issuanceAuthorized!==false)throw Error(data?.message||"Configuração não confirmada.");
 return data as Status;
}
function MunicipalItiSandboxSetupForm({municipalityId}:{municipalityId:string}){
 const [status,setStatus]=useState<Status|null>(null),[clientId,setClientId]=useState(""),[clientSecret,setClientSecret]=useState(""),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[failed,setFailed]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>{let active=true;setStatus(null);setClientId("");setClientSecret("");setNotice("");setFailed(false);
  void request(municipalityId,"get").then(s=>{if(active)setStatus(s);}).catch(()=>{if(active){setFailed(true);setNotice("Não foi possível consultar o cadastro.");}});return()=>{active=false;};},[municipalityId,reload]);
 const save=async()=>{if(busy||!status||!clientId.trim()||!clientSecret.trim())return;setBusy(true);setNotice("");setFailed(false);
 try{const saved=await request(municipalityId,"save",{clientId:clientId.trim(),clientSecret,redirectUri:status.registeredCallback||""});if(!saved.configured)throw Error("Cadastro não confirmado.");setStatus(saved);setClientSecret("");setClientId("");setNotice(saved.registeredCallback?"Credenciais cadastradas. A conexão real ainda precisa ser homologada.":"Credenciais guardadas com segurança. Aguardando o callback registrado e a homologação externa.");}
 catch(e){setFailed(true);setNotice(e instanceof Error?e.message:"Cadastro não confirmado.");}finally{setBusy(false);}};
 const field="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100";
 return <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
 <div><h3 className="text-sm font-bold">Credenciais ITI · homologação ICP-Brasil</h3><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Cadastro seguro por prefeitura. Não autoriza emissão oficial nem substitui o credenciamento.</p></div>
 {status?<div className="grid gap-2 sm:grid-cols-2">{[["Credenciais municipais",status.configured],["Bucket dedicado configurado",status.archiveConfigured],["Cadeia de confiança informada",status.trustConfigured],["Execução habilitada",status.runtimeEnabled]].map(([label,ok])=><div key={String(label)} className="rounded-lg border border-slate-200 p-2 text-xs dark:border-slate-700"><span className="font-semibold">{String(label)}</span><p className="mt-1 text-slate-600 dark:text-slate-300">{ok?"Configurado — não homologado":"Pendente"}</p></div>)}</div>:null}
 <label className="block space-y-1 text-xs font-semibold">Client ID<input className={field} value={clientId} onChange={e=>setClientId(e.target.value)} autoComplete="off" maxLength={512}/></label>
 <label className="block space-y-1 text-xs font-semibold">Client Secret<input className={field} type="password" value={clientSecret} onChange={e=>setClientSecret(e.target.value)} autoComplete="new-password" maxLength={2048}/></label>
 <label className="block space-y-1 text-xs font-semibold">Callback registrado<input className={field} value={status?.registeredCallback||""} placeholder="Aguardando configuração do endereço oficial" readOnly/></label>
 {status&&!status.registeredCallback?<p role="status" className="text-xs text-slate-600 dark:text-slate-300">Você já pode cadastrar as credenciais. O endereço de retorno será definido pela infraestrutura de homologação antes de iniciar assinaturas.</p>:null}
 {status?.registeredCallback&&new URL(status.registeredCallback).origin!==window.location.origin?<p role="status" className="break-words text-xs text-slate-600 dark:text-slate-300">As credenciais podem ser cadastradas aqui. Para assinar em homologação, abra o SIGAPRO no domínio do callback registrado acima.</p>:null}
 <Button type="button" disabled={busy||!status||!clientId.trim()||!clientSecret.trim()} onClick={()=>void save()}>{busy?"Salvando…":"Cadastrar credenciais"}</Button>
 {!status&&failed?<Button type="button" variant="outline" size="sm" onClick={()=>setReload(n=>n+1)}>Tentar novamente</Button>:null}
 {notice?<p role={failed?"alert":"status"} className="break-words text-xs text-slate-700 dark:text-slate-200">{notice}</p>:null}
 </section>;
}

export function MunicipalItiSandboxSetup(props:{municipalityId:string}){
 return <MunicipalItiSandboxSetupForm key={props.municipalityId} {...props}/>;
}
