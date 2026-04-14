import { RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function LoadingFallback({
  title = "Estamos finalizando sua sessão",
  description = "O carregamento demorou um pouco mais que o esperado. Você pode tentar novamente agora.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <Card className="max-w-xl rounded-[28px] border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
        <CardContent className="p-8 text-slate-600">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
            <Sparkles className="h-5 w-5" />
          </div>
          <h1 className="max-w-md break-words text-lg font-semibold leading-tight text-slate-900">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              type="button"
              className="rounded-full bg-slate-900 px-5 text-white hover:bg-slate-800"
              onClick={onRetry}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar novamente
            </Button>
            <Button variant="outline" className="rounded-full px-5" onClick={() => (window.location.href = "/acesso")}>
              Voltar ao acesso
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
