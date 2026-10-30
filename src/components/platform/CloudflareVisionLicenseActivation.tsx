import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { backendClient } from "@/integrations/backend/databaseClient";
const LICENSE_CONFIRMATION="ACEITO OS TERMOS DO LLAMA 3.2";
const VISION_MODEL="@cf/meta/llama-3.2-11b-vision-instruct";
// Links oficiais publicados pela Cloudflare para o modelo visual.
const LICENSE_URL="https://dev.meta.ai/llama/llama3_2/license";
const POLICY_URL="https://dev.meta.ai/llama/llama3_2/use-policy";

export function CloudflareVisionLicenseActivation() {
  const [accepted,setAccepted]=useState(false);
  const [confirmation,setConfirmation]=useState("");
  const [busy,setBusy]=useState(false);
  const [done,setDone]=useState(false);
  const [message,setMessage]=useState("");
  const canSubmit=accepted && confirmation.trim()===LICENSE_CONFIRMATION && !busy && !done;
  const submit=async()=>{
    if(!canSubmit) return;
    if(!window.confirm("Você confirma que tem poderes para aceitar a licença e a política de uso da Meta em nome do titular da conta Cloudflare? Essa aceitação é para toda a conta, inclusive outros ambientes que a utilizem."))return;
    setBusy(true);setMessage("");
    try {
      const auth=await backendClient?.auth?.getSession?.();
      const token=String(auth?.data?.session?.access_token||auth?.data?.session?.accessToken||"");
      if(!token)throw Error("Sessão expirada. Entre novamente no painel Master.");
      const response=await fetch("/api/ai-assistant",{
        method:"POST",
        credentials:"same-origin",cache:"no-store",
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
        body:JSON.stringify({
          action:"urban-vision-license-accept",accepted:true,
          confirmation:LICENSE_CONFIRMATION,model:VISION_MODEL,
        }),
      });
      const result=await response.json() as {status?:string;message?:string;error?:string};
      if(!response.ok||result.status!=="accepted_by_provider")
        throw Error(result.error||"Não foi possível comprovar a aceitação na Cloudflare.");
      setDone(true);setMessage(result.message||"Aceitação confirmada pela Cloudflare.");
    }catch(e){setMessage(e instanceof Error?e.message:"Falha ao confirmar a licença.");}
    finally{setBusy(false);}
  };
  return <section id="ia-cloudflare" data-master-cloudflare-vision-license="true"
    className="mt-4 rounded-2xl border border-sky-300 bg-white p-5 text-slate-950 shadow-sm">
    <div className="flex items-center gap-3">
      <ShieldCheck aria-hidden="true" className="h-6 w-6 shrink-0 text-sky-800"/>
      <div>
        <h2 className="text-lg font-extrabold text-slate-950">Cloudflare — autorizar modelo de visão (QA)</h2>
        <p className="text-sm leading-6 text-slate-800">Autorização única do modelo Llama 3.2 Vision para a conta Cloudflare do SIGAPRO.</p>
      </div>
    </div>
    <p className="mt-3 text-sm leading-6 text-slate-800">
      A aceitação é da <strong>conta Cloudflare inteira</strong>, não apenas da prefeitura ou da homologação.
      O SIGAPRO não registra nem ativa índices urbanísticos nesta ação. Não é necessário informar tokens.
    </p>
    <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm leading-6 text-amber-950">
      <strong>Leia antes de confirmar:</strong> os documentos oficiais da Meta podem estar em inglês.
      Eles estabelecem direitos, responsabilidades e restrições de uso do modelo de IA.
      A aceitação vale para toda a conta Cloudflare vinculada ao SIGAPRO,
      não ativa regras municipais. Leia e compreenda a licença e a política antes
      de aceitar; uma tradução do navegador pode ajudar na leitura, mas não
      substitui os termos oficiais.
    </p>
    <div className="mt-3 flex flex-wrap gap-4 text-sm font-bold">
      <a href={LICENSE_URL} target="_blank" rel="noopener noreferrer" className="text-sky-900 underline underline-offset-4">Ler licença oficial da Meta</a>
      <a href={POLICY_URL} target="_blank" rel="noopener noreferrer" className="text-sky-900 underline underline-offset-4">Ler política de uso da Meta</a>
    </div>
    <label className="mt-4 flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm font-semibold leading-6 text-slate-950">
      <input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-sky-800"/>
      Li e aceito a licença e a política de uso da Meta e estou autorizado a vincular essa aceitação à conta Cloudflare do SIGAPRO.
    </label>
    <label className="mt-3 block text-sm font-bold text-slate-900">
      Para confirmar, digite exatamente: <strong>{LICENSE_CONFIRMATION}</strong>
      <input type="text" value={confirmation} autoComplete="off" spellCheck={false}
        onChange={e=>setConfirmation(e.target.value)} aria-label="Declaração de aceitação dos termos da Meta"
        placeholder="Digite a declaração de aceitação"
        className="mt-2 min-h-11 w-full rounded-xl border border-slate-400 bg-white px-3 text-slate-950 placeholder:text-slate-600"/>
    </label>
    <button type="button" onClick={()=>void submit()} disabled={!canSubmit}
      data-sigapro-contrast="dark"
      className="sig-premium-dark-action mt-3 min-h-11 rounded-xl border border-slate-800 px-5 py-3 text-sm font-extrabold text-white disabled:cursor-not-allowed">
      {busy?"Confirmando com a Cloudflare…":done?"Autorização confirmada":"Confirmar aceitação na Cloudflare"}
    </button>
    {message?<p role={done?"status":"alert"} className={"mt-3 rounded-lg border p-3 text-sm font-semibold leading-6 "+(done?"border-emerald-300 bg-emerald-50 text-emerald-950":"border-slate-300 bg-slate-50 text-slate-950")}>{message}</p>:null}
    <p className="mt-2 text-xs leading-5 text-slate-700">Restrito à conta Master no Preview de homologação. A licença não será aceita ao entrar nesta página, marcar a caixa ou preencher o texto; somente ao confirmar o botão e a janela final.</p>
  </section>;
}
