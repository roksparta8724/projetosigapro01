import { useEffect, useRef, useState } from "react";
import { runCertifiedSandbox, type SandboxSelection } from "@/integrations/esign/certifiedSandboxClient";
import { ExternalLink, ShieldCheck } from "lucide-react";

/** External services are intentionally not treated as a completed signature.
 * Neither opening the portal nor returning to the application mutates a permit.
 */
export function ExternalCertificateSigningOptions({ disabled = false, sandbox }: { disabled?: boolean; sandbox?: SandboxSelection }) {
  const [running,setRunning]=useState(false);
  const [notice,setNotice]=useState("");
  const [failed,setFailed]=useState(false);
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>{controller.current?.abort();},[]);
  const run=async()=>{
    if(!sandbox||controller.current||disabled)return;
    const popup=window.open("about:blank","_blank","popup,width=740,height=760");
    if(!popup){setFailed(true);setNotice("Permita a abertura da janela de autorização.");return;}
    const attempt=new AbortController();controller.current=attempt;setRunning(true);setNotice("");setFailed(false);
    try{
      const result=await runCertifiedSandbox(sandbox,popup,attempt.signal);
      if(!attempt.signal.aborted)setNotice("Prova de homologação arquivada e conferida. SHA-256: "+result.sha256+". Nenhum alvará foi emitido.");
    }catch(e){if(!attempt.signal.aborted){setFailed(true);setNotice(e instanceof Error?e.message:"Homologação não confirmada.");}}
    finally{if(controller.current===attempt){controller.current=null;setRunning(false);}}
  };
  const linkClass = "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-slate-600 dark:bg-slate-800 dark:text-sky-200 dark:hover:bg-slate-700";
  return (
    <details className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
      <summary className="cursor-pointer rounded-md text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
        Assinatura com certificado digital
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">Integração direta ainda não habilitada. As opções abaixo são externas e não emitem nem alteram o status do alvará no SIGAPRO. Utilize apenas se admitidas pelas normas da Prefeitura.</p>
        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
          <p className="text-sm font-bold">GOV.BR <span className="text-xs font-normal text-slate-600 dark:text-slate-300">· Avançada</span></p>
          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Conta prata ou ouro. Para documento autorizado para assinatura externa, obtenha o PDF e utilize o portal oficial.</p>
          {!disabled && <a className={linkClass + " mt-2"} href="https://assinador.iti.br/" target="_blank" rel="noopener noreferrer">Abrir assinador GOV.BR <ExternalLink aria-hidden="true" size={14}/></a>}
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
          <p className="text-sm font-bold">ICP-Brasil <span className="text-xs font-normal text-slate-600 dark:text-slate-300">· Qualificada</span></p>
          <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Utilize um assinador compatível com seu certificado digital, local ou em nuvem. Não envie senhas, chaves privadas ou arquivos de certificado ao SIGAPRO.</p>
          {sandbox && String(import.meta.env.VITE_SIGAPRO_NEON_ISOLATED)==="true" ? <div className="mt-3 space-y-2 rounded-lg border border-sky-200 bg-sky-50 p-3 dark:border-sky-800 dark:bg-sky-950">
            <p className="text-xs font-semibold text-sky-900 dark:text-sky-100">Homologação ICP-Brasil · sem validade de alvará</p>
            <p className="text-xs leading-5 text-slate-700 dark:text-slate-300">Testa autorização, certificado e guarda de uma prova vinculada à solicitação atual, sem alterar a emissão.</p>
            <button type="button" className={linkClass} disabled={disabled||running} onClick={()=>void run()}>{running?"Aguardando autorização…":"Testar integração ICP-Brasil"}</button>
            {running?<button type="button" className={linkClass} onClick={()=>{controller.current?.abort();setFailed(false);setNotice("Homologação cancelada.");}}>Cancelar</button>:null}
            {notice?<p role={failed?"alert":"status"} className={"break-all text-xs leading-5 "+(failed?"text-rose-800 dark:text-rose-200":"text-slate-800 dark:text-slate-200")}>{notice}</p>:null}
          </div>:null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
          <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0" />
          Validação externa de autoria e integridade:
          {!disabled && <a className={linkClass} href="https://validar.iti.gov.br/" target="_blank" rel="noopener noreferrer">VALIDAR — ITI <ExternalLink aria-hidden="true" size={14}/></a>}
        </div>
        <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">O retorno, a conferência automática e a guarda do PDF certificado ainda dependem da integração oficial. Não utilize a senha interna como substituta do certificado exigido.</p>
      </div>
    </details>
  );
}
