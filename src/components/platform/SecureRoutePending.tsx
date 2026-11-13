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
}: {
  title?: string;
  detail?: string;
  surface?: "standard" | "document" | "route";
}) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), 12000);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <>
      <span role="status" aria-live="polite" className="sr-only"
        data-sigapro-route-pending={surface}>
        {title}: {detail}
      </span>
      {slow ? (
        <aside role="alert" data-sigapro-recovery-notice="compact"
          className="fixed bottom-4 right-4 z-[80] w-[min(350px,calc(100vw-32px))] rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.18)]">
          <p className="text-sm font-bold text-slate-950">A conexão está demorando</p>
          <p className="mt-1 text-xs leading-5 text-slate-700">
            Nenhum dado foi alterado. Recarregue somente se não conseguir abrir a página.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => window.location.reload()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-800 px-3 text-xs font-bold text-white hover:bg-sky-700">
              <RotateCw aria-hidden="true" className="h-3.5 w-3.5" />
              Recarregar
            </button>
            <a href="/acesso"
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50">
              Ir para o acesso
            </a>
          </div>
        </aside>
      ) : null}
    </>
  );
}
