import { ExternalLink, ShieldCheck } from "lucide-react";

/** External services are intentionally not treated as a completed signature.
 * Neither opening the portal nor returning to the application mutates a permit.
 */
export function ExternalCertificateSigningOptions({ disabled = false }: { disabled?: boolean }) {
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
