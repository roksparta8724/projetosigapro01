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
        "sig-metric-card group flex h-full min-h-[152px] min-w-0 flex-col overflow-hidden rounded-[22px] border border-slate-200/80 bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition duration-200",
      )}
    >
      <div className="flex h-full items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col sig-text-wrap">
          <p className="sig-fit-title text-[11px] uppercase tracking-[0.12em] text-slate-500" title={title}>
            {title}
          </p>
          <p
            className={cn(
              "mt-2 min-w-0 sig-fit-title text-[1.5rem] font-semibold leading-tight tracking-[-0.015em] text-slate-950",
              valueClassName,
            )}
            title={valueTitle ?? value}
          >
            {value}
          </p>
          <p className="sig-fit-copy mt-auto max-w-full pt-2 text-sm font-normal leading-6 text-slate-500" title={helper}>
            {helper}
          </p>
        </div>
        <div
          className={cn(
            "sig-stat-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border shadow-[0_10px_20px_rgba(15,23,42,0.08)]",
            tone === "emerald" && "border-emerald-200 bg-emerald-50 text-emerald-700",
            tone === "blue" && "border-sky-200 bg-sky-50 text-sky-700",
            tone === "amber" && "border-amber-200 bg-amber-50 text-amber-700",
            tone === "rose" && "border-rose-200 bg-rose-50 text-rose-700",
            tone === "default" && "border-slate-200 bg-slate-100 text-slate-700",
          )}
        >
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
    </section>
  );
}
