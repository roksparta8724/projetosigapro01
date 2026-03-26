import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProtocolStepProgressProps {
  currentStep: 1 | 2 | 3;
}

const steps = [
  { key: 1, label: "Dados" },
  { key: 2, label: "Upload de documentos" },
  { key: 3, label: "Revisao" },
] as const;

export function ProtocolStepProgress({ currentStep }: ProtocolStepProgressProps) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((step, index) => {
          const done = currentStep > step.key;
          const active = currentStep === step.key;

          return (
            <div key={step.key} className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-all",
                  done && "border-emerald-200 bg-emerald-50 text-emerald-700",
                  active && "border-[#0F2A44] bg-[#0F2A44] text-white shadow-[0_10px_24px_rgba(15,42,68,0.18)]",
                  !done && !active && "border-slate-200 bg-slate-50 text-slate-500",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : step.key}
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn("break-words text-sm font-medium leading-6", active ? "text-slate-900" : "text-slate-600")}>{step.label}</p>
                {index < steps.length - 1 ? <div className="mt-2 h-px bg-slate-200 md:hidden" /> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
