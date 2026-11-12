import { useEffect, useState } from "react";
import { ArrowLeft, LoaderCircle, RotateCw, ShieldCheck } from "lucide-react";

/**
 * Visible, non-authorizing fallback during auth/plan resolution or lazy chunk loading.
 * This component must never render protected children or assume a valid session.
 */
export function SecureRoutePending({
  title = "Preparando o SIGAPRO",
  detail = "Validando o acesso e carregando esta página com segurança.",
  surface = "standard",
}: {
  title?: string;
  detail?: string;
  surface?: "standard" | "document" | "route";
}) {
  const documentSurface = surface === "document";
  const routeSurface = surface === "route";
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setSlow(true), 9000);
    return () => window.clearTimeout(timeoutId);
  }, []);

  if (routeSurface) {
    return (
      <main data-sigapro-route-pending="route" role="status" aria-live="polite"
        className="flex min-h-screen min-h-[100dvh] flex-col items-center justify-center gap-5 bg-[radial-gradient(circle_at_top,#154761_0%,#08263c_54%,#061a2b_100%)] px-6 text-slate-100">
        <div className="flex items-center gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-[13px] border border-sky-300/20 bg-white/10 text-sky-200">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-black tracking-[0.16em] text-white">SIGAPRO</p>
            <p className="mt-1 text-xs text-slate-300">Plataforma municipal</p>
          </div>
        </div>
        <div className="h-[3px] w-48 overflow-hidden rounded-full bg-white/15">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-sky-300 motion-reduce:animate-none" />
        </div>
        <span className="text-xs text-slate-300">{slow ? "A conexão está demorando mais que o normal." : "Abrindo módulo…"}</span>
        {slow ? (
          <a href="/acesso" className="rounded-lg border border-white/20 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10">Retornar ao acesso</a>
        ) : null}
      </main>
    );
  }

  return (
    <main data-sigapro-route-pending="visible" data-sigapro-document-mode={documentSurface ? "true" : "false"} role="status" aria-live="polite"
      style={{ background: documentSurface ? "#2b3037" : "linear-gradient(145deg,#071d2e,#103952)", color: "#f8fafc" }}
      className="flex min-h-screen min-h-[100dvh] items-center justify-center px-4 py-8 text-slate-50">
      <section style={{ backgroundColor: "#102637", borderColor: "#36566e", color: "#f8fafc" }}
        className="w-full max-w-lg overflow-hidden rounded-[24px] border shadow-[0_22px_70px_rgba(3,12,23,0.35)]">
        <div className="h-1.5 bg-[linear-gradient(90deg,#075985,#0284c7,#0e7490)]" aria-hidden="true" />
        <div className="p-6 sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200">
            <ShieldCheck aria-hidden="true" className="h-6 w-6" />
          </div>
          <p style={documentSurface ? { color: "#bae6fd" } : undefined} className="mt-6 text-xs font-bold uppercase tracking-[0.12em] text-sky-200">SIGAPRO • Acesso protegido</p>
          <h1 style={documentSurface ? { color: "#ffffff" } : undefined} className="mt-2 text-xl font-extrabold tracking-tight text-white">{title}</h1>
          <p style={documentSurface ? { color: "#cbd5e1" } : undefined} className="mt-3 text-sm leading-6 text-slate-300">{detail}</p>
          <div style={{ backgroundColor: "#20364b", borderColor: "#475569", color: "#f8fafc" }} className="mt-5 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold">
            <LoaderCircle aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin text-sky-700 dark:text-sky-300 motion-reduce:animate-none" />
            {slow ? "A verificação está demorando mais que o normal." : "Conferindo a sessão e as permissões…"}
          </div>
          {slow ? (
            <p style={documentSurface ? { color: "#fde68a" } : undefined} className="mt-3 text-xs leading-5 text-amber-200">
              Se a conexão não concluir, você pode recarregar ou entrar novamente. A operação atual não altera seus processos.
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={() => window.location.reload()}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 text-sm font-bold text-white hover:bg-sky-600">
              <RotateCw aria-hidden="true" className="h-4 w-4" /> Recarregar
            </button>
            <a href="/acesso" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-500 bg-slate-800 px-5 text-sm font-semibold text-white hover:bg-slate-700">
              <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Voltar ao acesso
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
