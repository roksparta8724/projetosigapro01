import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";

/**
 * Security-gated background state for cold starts, refresh and lazy chunks.
 *
 * A route's content is NEVER mounted before PermissionRoute / PlanModuleRoute
 * authorize it; however, a transient verification must not replace the entire
 * page with a second "SIGAPRO is loading" screen.
 *
 * On normal refresh this renders only screen-reader status. After 9 seconds,
 * a small fixed non-modal recovery notice appears. Real access-denial and app
 * errors remain separately visible through their existing guards.
 */
export function SecureRoutePending({
  title = "Preparando o SIGAPRO",
  detail = "Verificando acesso e carregando o módulo solicitado.",
  surface = "standard",
}: {
  title?: string;
  detail?: string;
  surface?: "standard" | "document" | "route";
}) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), 9000);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <>
      <span
        role="status"
        aria-live="polite"
        className="sr-only"
        data-sigapro-route-pending={surface}
      >
        {title}: {detail}
      </span>
      {slow ? (
        <aside
          role="alert"
          data-sigapro-recovery-notice="compact"
          className="fixed bottom-4 right-4 z-[80] w-[min(350px,calc(100vw-32px))] rounded-[14px] border border-sky-200/25 bg-[#102a40] px-4 py-3 text-slate-100 shadow-[0_12px_32px_rgba(2,14,28,0.24)]"
        >
          <p className="text-xs font-extrabold text-white">{title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-200">
            A conexão ainda não concluiu. Nenhum dado foi alterado.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-700 px-3 text-xs font-bold text-white hover:bg-sky-600"
            >
              <RotateCw aria-hidden="true" className="h-3.5 w-3.5" />
              Recarregar
            </button>
            <a
              href="/acesso"
              className="inline-flex h-9 items-center rounded-lg border border-slate-400/40 px-3 text-xs font-semibold text-slate-100 hover:bg-white/10"
            >
              Ir para o acesso
            </a>
          </div>
        </aside>
      ) : null}
    </>
  );
}
