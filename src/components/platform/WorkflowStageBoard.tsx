import { ArrowRight, CheckCircle2, CircleDashed, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  defaultMunicipalWorkflowStages,
  type MunicipalStageCode,
  type MunicipalWorkflowStage,
} from "@/lib/govtech";
import { getWorkflowProgress } from "@/lib/workflowEngine";

interface WorkflowStageBoardProps {
  title?: string;
  description?: string;
  currentStageCode: MunicipalStageCode;
  stages?: MunicipalWorkflowStage[];
}

export function WorkflowStageBoard({
  title = "Fluxo configurado da Prefeitura",
  description = "Visualize o encadeamento das etapas do processo municipal e identifique rapidamente o ponto atual do workflow.",
  currentStageCode,
  stages,
}: WorkflowStageBoardProps) {
  const orderedStages = stages ?? defaultMunicipalWorkflowStages;
  const snapshot = getWorkflowProgress(currentStageCode, orderedStages);

  return (
    <Card className="rounded-[28px] border-slate-200">
      <CardHeader>
        <CardTitle className="sig-fit-title max-w-[34ch] text-base font-semibold leading-tight text-slate-950">
          {title}
        </CardTitle>
        <p className="sig-fit-copy max-w-[62ch] text-sm leading-6 text-slate-600">{description}</p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-500">Etapa atual</p>
              <p
                className="sig-fit-title max-w-[26ch] text-lg font-semibold leading-7 text-slate-950"
                title={snapshot.current?.label ?? "Não definida"}
              >
                {snapshot.current?.label ?? "Não definida"}
              </p>
            </div>
            <Badge className="rounded-full bg-slate-950 text-white hover:bg-slate-950">
              {snapshot.progressPercent}% do fluxo
            </Badge>
          </div>
        </div>

        <div className="grid gap-3">
          {orderedStages.map((stage, index) => {
            const isCompleted = snapshot.completed.some((item) => item.code === stage.code);
            const isCurrent = snapshot.current?.code === stage.code;

            return (
              <div key={stage.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    ) : stage.requiresPayment ? (
                      <Wallet className="h-5 w-5 text-amber-600" />
                    ) : (
                      <CircleDashed className="h-5 w-5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="sig-fit-title max-w-[30ch] text-base font-semibold leading-6 text-slate-950" title={stage.label}>
                        {stage.label}
                      </p>
                      {isCurrent ? (
                        <Badge className="rounded-full bg-sky-100 text-sky-800 hover:bg-sky-100">Atual</Badge>
                      ) : null}
                      {isCompleted ? (
                        <Badge className="rounded-full bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                          Concluída
                        </Badge>
                      ) : null}
                    </div>

                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600" title={stage.description}>
                      {stage.description}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-500">
                      <span className="sig-fit-title">Fila: {stage.queueCode}</span>
                      <span className="sig-fit-title">Tipo: {stage.stageType}</span>
                    </div>
                  </div>

                  <div className="shrink-0 text-sm font-medium text-slate-400">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                </div>

                {index < orderedStages.length - 1 ? (
                  <div className="mt-3 flex justify-center text-slate-300">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
