import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <Card className="max-w-lg rounded-[28px] border-slate-200">
        <CardContent className="p-8">
          <p className="text-sm uppercase tracking-[0.35em] text-slate-400">404</p>
          <h1 className="mt-3 text-3xl font-semibold text-slate-950">Rota não encontrada</h1>
          <p className="mt-3 text-sm text-slate-600">A nova arquitetura concentra os portais em `/`, `/master`, `/prefeitura`, `/prefeitura/analise`, `/prefeitura/financeiro` e `/externo`.</p>
          <Button asChild className="mt-6 rounded-full">
            <Link to="/">Voltar para o início</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
