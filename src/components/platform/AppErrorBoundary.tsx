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
    console.error("SIGAPRO runtime error:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#eef5fd_0%,#e7eff7_34%,#f3f6fb_100%)] p-4">
          <div className="w-full max-w-xl rounded-[28px] border border-rose-100 bg-white p-8 shadow-[0_24px_64px_rgba(15,23,42,0.12)]">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h1 className="mt-5 max-w-md text-xl font-semibold leading-tight text-slate-900">A tela encontrou um erro</h1>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              O SIGAPRO identificou uma falha ao abrir esta página. Atualize a tela ou volte ao acesso para continuar.
            </p>
            <div className="mt-5 break-words rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
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
