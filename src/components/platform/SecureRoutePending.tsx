import { useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle, RotateCw, ShieldCheck } from "lucide-react";

/**
 * Visible, non-authorizing fallback during auth/plan resolution or lazy chunk loading.
 * This component must never render protected children or assume a valid session.
 */
export function SecureRoutePending({
  title = "Preparando o SIGAPRO",
  detail = "Validando o acesso e carregando esta página com segurança.",
}: {
  title?: string;
  detail?: string;
}) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setSlow(true), 9000);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <main data-sigapro-route-pending="visible" role="status" aria-live="polite"
      className="flex min-h-screen min-h-[100dvh] items-center justify-center bg-slate-50 px-4 py-8 text-slate-950 dark:bg-[#081828] dark:text-slate-50">
      <section className="w-full max-w-lg overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_22px_70px_rgba(15,23,42,0.10)] dark:border-slate-700 dark:bg-[#102637]">
        <div className="h-1.5 bg-[linear-gradient(90deg,#075985,#0284c7,#0e7490)]" aria-hidden="true" />
        <div className="p-6 sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200">
            <ShieldCheck aria-hidden="true" className="h-6 w-6" />
          </div>
          <p className="mt-6 text-xs font-bold uppercase tracking-[0.12em] text-sky-800 dark:text-sky-200">SIGAPRO • Acesso protegido</p>
          <h1 className="mt-2 text-xl font-extrabold tracking-tight text-slate-950 dark:text-white">{title}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{detail}</p>
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
            <LoaderCircle aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin text-sky-700 dark:text-sky-300 motion-reduce:animate-none" />
            {slow ? "A verificação está demorando mais que o normal." : "Conferindo a sessão e as permissões…"}
          </div>
          {slow ? (
            <p className="mt-3 text-xs leading-5 text-amber-800 dark:text-amber-200">
              Se a conexão não concluir, você pode recarregar ou entrar novamente. A operação atual não altera seus processos.
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={() => window.location.reload()}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white hover:bg-slate-800 dark:bg-sky-700 dark:hover:bg-sky-600">
              <RotateCw aria-hidden="true" className="h-4 w-4" /> Recarregar
            </button>
            <a href="/acesso" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
              <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Voltar ao acesso
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
