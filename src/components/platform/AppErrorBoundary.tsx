import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || "Erro inesperado ao abrir a tela.",
    };
  }

  componentDidCatch(error: Error) {
    console.error("[ErrorBoundary] SIGAPRO runtime error:", error);

    // Se uma tela falhar de verdade, não deixar o snapshot premium cobrindo
    // indefinidamente a interface. Em operação normal esse evento não interfere.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("sigapro-app-stable"));
    }
  }

  render() {
    if (this.state.hasError) {
      let inverseMain = false;
      if (typeof window !== "undefined") {
        try {
          const raw = window.localStorage.getItem("sigapro-layout-theme.v2");
          inverseMain = raw ? Boolean(JSON.parse(raw)?.inverseMain) : false;
        } catch {
          inverseMain = false;
        }
      }

      return (
        <div
          className="flex min-h-screen items-center justify-center p-4 text-slate-50"
          data-layout-mode={inverseMain ? "inverse-main" : "default"}
          style={{
            background: inverseMain
              ? "radial-gradient(circle at top, rgba(7,17,27,0.92) 0%, rgba(8,22,36,0.96) 42%, rgba(6,15,26,0.98) 100%)"
              : "radial-gradient(circle at top,#eef5fd 0%,#e7eff7 34%,#f3f6fb 100%)",
          }}
        >
          <div className="w-full max-w-xl overflow-hidden rounded-[24px] border border-sky-700/40 bg-[#102a40] p-7 text-slate-50 shadow-[0_24px_64px_rgba(2,12,24,0.33)] sm:p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-300/25 bg-rose-300/10 text-rose-200">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <p className="mt-5 text-[11px] font-extrabold uppercase tracking-[0.15em] text-sky-200">SIGAPRO · Acesso protegido</p>
            <h1 className="mt-1 max-w-md text-xl font-extrabold leading-tight text-white">Não foi possível abrir esta página</h1>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              O SIGAPRO identificou uma falha ao abrir esta página. Atualize a tela ou volte ao acesso para continuar.
            </p>
            {import.meta.env.DEV ? (
              <pre className="mt-5 max-h-40 overflow-auto break-words rounded-xl border border-slate-500/30 bg-[#061b2d] px-4 py-3 text-xs text-slate-200">
                {this.state.message}
              </pre>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-3">
              <Button type="button" className="bg-sky-700 !text-white hover:bg-sky-600" onClick={() => window.location.reload()}>
                Atualizar Tela
              </Button>
              <Button type="button" variant="outline" className="border-slate-500 bg-slate-800 !text-white hover:bg-slate-700" onClick={() => (window.location.href = "/acesso")}>
                Voltar Ao Acesso
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
