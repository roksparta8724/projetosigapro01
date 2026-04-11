import React from "react";
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
  }

  render() {
    if (this.state.hasError) {
      let inverseMain = false;
      if (typeof window !== "undefined") {
        try {
          const raw = window.localStorage.getItem("sigapro-layout-theme");
          inverseMain = raw ? Boolean(JSON.parse(raw)?.inverseMain) : false;
        } catch {
          inverseMain = false;
        }
      }

      return (
        <div
          className="flex min-h-screen items-center justify-center p-4"
          data-layout-mode={inverseMain ? "inverse-main" : "default"}
          style={{
            background: inverseMain
              ? "radial-gradient(circle at top, rgba(7,17,27,0.92) 0%, rgba(8,22,36,0.96) 42%, rgba(6,15,26,0.98) 100%)"
              : "radial-gradient(circle at top,#eef5fd 0%,#e7eff7 34%,#f3f6fb 100%)",
          }}
        >
          <div className="sig-ui-card w-full max-w-xl rounded-[28px] border border-rose-100 p-8 shadow-[0_24px_64px_rgba(15,23,42,0.12)]">
            <div className="sig-section-icon flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h1 className="mt-5 max-w-md text-xl font-semibold leading-tight text-slate-900">A tela encontrou um erro</h1>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              O SIGAPRO identificou uma falha ao abrir esta página. Atualize a tela ou volte ao acesso para continuar.
            </p>
            <div className="sig-dark-panel mt-5 break-words rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {this.state.message}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button type="button" onClick={() => window.location.reload()}>
                Atualizar Tela
              </Button>
              <Button type="button" variant="outline" onClick={() => (window.location.href = "/acesso")}>
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
