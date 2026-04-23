import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function MetricCard({
  title,
  value,
  helper,
  icon: Icon,
  tone = "default",
  valueClassName,
  valueTitle,
}: {
  title: string;
  value: string;
  helper: string;
  icon: LucideIcon;
  tone?: "default" | "emerald" | "blue" | "amber" | "rose";
  valueClassName?: string;
  valueTitle?: string;
}) {
  return (
    <section
      className={cn(
        "sig-metric-card group flex h-full min-h-[150px] min-w-0 flex-col overflow-hidden rounded-[22px] border border-slate-200/80 bg-white p-4.5 shadow-[0_12px_26px_rgba(15,23,42,0.075)] transition duration-200",
      )}
    >
      <div className="flex h-full min-w-0 items-start justify-between gap-4">
        <div className="sig-text-wrap flex min-w-0 flex-1 flex-col">
          <p className="sig-metric-title line-clamp-2 min-h-[1.15rem] max-w-[calc(100%-0.25rem)] text-[10px] font-semibold uppercase leading-[1.15] tracking-[0.14em] text-slate-500" title={title}>
            {title}
          </p>
          <p
            className={cn(
              "sig-metric-value mt-2 min-w-0 max-w-full break-words text-[1.36rem] font-semibold leading-[1.08] tracking-[-0.018em] text-slate-950",
              valueClassName,
            )}
            title={valueTitle ?? value}
          >
            {value}
          </p>
          <p className="sig-metric-helper mt-auto max-w-full pt-2 text-[13px] font-normal leading-5.5 text-slate-500" title={helper}>
            {helper}
          </p>
        </div>
        <div
          className={cn(
            "sig-stat-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border shadow-[0_8px_18px_rgba(15,23,42,0.075)]",
            tone === "emerald" && "border-emerald-200 bg-emerald-50 text-emerald-700",
            tone === "blue" && "border-sky-200 bg-sky-50 text-sky-700",
            tone === "amber" && "border-amber-200 bg-amber-50 text-amber-700",
            tone === "rose" && "border-rose-200 bg-rose-50 text-rose-700",
            tone === "default" && "border-slate-200 bg-slate-100 text-slate-700",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </section>
  );
}
