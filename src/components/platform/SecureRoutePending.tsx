import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";

/**
 * Autorização continua fechada durante bootstrap e lazy-loading.
 * Não renderizar página falsa, tela azul, modal ou esqueleto durante F5.
 * Somente após demora anormal oferecer recuperação discreta, sem autorizar
 * conteúdo protegido nem modificar a sessão.
 */
export function SecureRoutePending({
  title = "Verificando acesso",
  detail = "Aguardando confirmação da sessão e do módulo.",
  surface = "standard",
  failed = false,
}: {
  title?: string;
  detail?: string;
  surface?: "standard" | "document" | "route";
  failed?: boolean;
}) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), 12000);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <>
      <div role="status" aria-live="polite" data-sigapro-route-pending={surface} className="pointer-events-none fixed inset-x-0 top-0 z-[90] h-[3px] overflow-hidden bg-transparent">
        <div className="h-full w-1/3 rounded-r-full bg-sky-600 motion-safe:animate-pulse dark:bg-sky-400" aria-hidden="true"/>
        <span className="sr-only">{title}: {detail}</span>
      </div>
      {slow || failed ? (
        <aside role="alert" data-sigapro-recovery-notice="compact"
          className="fixed bottom-4 right-4 z-[80] w-[min(350px,calc(100vw-32px))] rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 shadow-[0_10px_30px_rgba(15,23,42,0.18)]">
          <p className="text-sm font-bold text-slate-950 dark:text-slate-100">{failed ? "Não foi possível validar o acesso" : "A conexão está demorando"}</p>
          <p className="mt-1 text-xs leading-5 text-slate-700 dark:text-slate-300">
            {failed ? detail : "A validação continua em andamento. Se a página não abrir, tente novamente."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => window.location.reload()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-800 px-3 text-xs font-bold text-white hover:bg-sky-700">
              <RotateCw aria-hidden="true" className="h-3.5 w-3.5" />
              Recarregar
            </button>
            <a href="/acesso"
              className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3 text-xs font-semibold text-foreground hover:bg-muted">
              Ir para o acesso
            </a>
          </div>
        </aside>
      ) : null}
    </>
  );
}
