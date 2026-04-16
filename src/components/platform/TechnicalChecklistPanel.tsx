import { CheckCircle2, MessageSquareMore, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type TechnicalChecklistResultItem } from "@/lib/govtech";

interface TechnicalChecklistPanelProps {
  title?: string;
  subtitle?: string;
  items: TechnicalChecklistResultItem[];
}

function badgeForDecision(decision: TechnicalChecklistResultItem["decision"]) {
  switch (decision) {
    case "de_acordo":
      return <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-400/12 dark:text-emerald-200">De acordo</Badge>;
    case "apresentar":
      return <Badge className="rounded-full bg-amber-100 text-amber-700 dark:bg-amber-400/12 dark:text-amber-200 hover:bg-amber-100">Apresentar</Badge>;
    case "corrigir":
      return <Badge className="rounded-full border border-red-500/20 bg-red-500/10 text-red-600 dark:bg-red-400/12 dark:text-red-200 hover:bg-red-500/10">Corrigir</Badge>;
    default:
      return (
        <Badge variant="outline" className="rounded-full border-slate-300 text-slate-600 dark:border-white/15 dark:bg-white/[0.04] dark:text-slate-100">
          Pendente
        </Badge>
      );
  }
}

export function TechnicalChecklistPanel({
  title = "Checklist técnico digital",
  subtitle = "Organize a análise com critérios, decisões e observações técnicas.",
  items,
}: TechnicalChecklistPanelProps) {
  const summary = {
    ok: items.filter((item) => item.decision === "de_acordo").length,
    present: items.filter((item) => item.decision === "apresentar").length,
    fix: items.filter((item) => item.decision === "corrigir").length,
  };

  return (
    <Card className="rounded-[28px] border-slate-200">
      <CardHeader className="space-y-2">
        <CardTitle className="sig-fit-title max-w-[34ch] text-base font-semibold leading-tight text-slate-900">
          {title}
        </CardTitle>
        <p className="sig-fit-copy max-w-[62ch] text-sm leading-6 text-slate-500">{subtitle}</p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 dark:border-emerald-400/16 dark:bg-emerald-400/10">
            <p className="text-xs uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-200">Itens conformes</p>
            <p className="mt-2 text-lg font-semibold leading-tight text-emerald-800 dark:text-emerald-100">{summary.ok}</p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 dark:border-amber-400/16 dark:bg-amber-400/10">
            <p className="text-xs uppercase tracking-[0.16em] text-amber-700 dark:text-amber-200">Itens a apresentar</p>
            <p className="mt-2 text-lg font-semibold leading-tight text-amber-700 dark:text-amber-100">{summary.present}</p>
          </div>
          <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 dark:border-rose-400/16 dark:bg-rose-400/10">
            <p className="text-xs uppercase tracking-[0.16em] text-red-600 dark:text-red-200">Itens a corrigir</p>
            <p className="mt-2 text-lg font-semibold leading-tight text-red-600 dark:text-red-100">{summary.fix}</p>
          </div>
        </div>

        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="sig-fit-title text-base font-semibold leading-tight text-slate-900" title={item.title}>
                    {item.title}
                  </p>
                  {item.guidance ? (
                    <p className="sig-fit-copy mt-1 text-sm leading-6 text-slate-500" title={item.guidance}>
                      {item.guidance}
                    </p>
                  ) : null}
                  {item.reference ? (
                    <p className="sig-fit-copy mt-1 text-sm leading-6 text-slate-500" title={`Referência: ${item.reference}`}>
                      Referência: {item.reference}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0">{badgeForDecision(item.decision)}</div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-500">
                  <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                    <MessageSquareMore className="h-4 w-4" />
                    Observações
                  </div>
                  <p className="line-clamp-3">{item.notes || "Nenhuma observação registrada para este item."}</p>
                </div>

                <div className="rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-500">
                  <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                    {item.decision === "corrigir" ? (
                      <TriangleAlert className="h-4 w-4" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Responsável
                  </div>
                  <p className="line-clamp-2">
                    {item.reviewedBy
                      ? `${item.reviewedBy}${item.reviewedAt ? ` em ${item.reviewedAt}` : ""}`
                      : "Aguardando revisão"}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
