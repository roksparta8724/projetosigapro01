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
        "sig-metric-card group flex h-full min-h-[148px] min-w-0 flex-col overflow-hidden rounded-[22px] border border-slate-300/90 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-5 shadow-[0_12px_26px_rgba(15,42,68,0.055)] ring-1 ring-white/70 transition duration-200",
      )}
    >
      <div className="flex h-full items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col sig-text-wrap">
          <p className="sig-fit-title text-[11px] uppercase tracking-[0.12em] text-slate-500" title={title}>
            {title}
          </p>
          <p
            className={cn(
              "mt-2 min-w-0 sig-fit-title text-lg font-semibold leading-tight tracking-[-0.01em] text-slate-900",
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
            "sig-stat-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border shadow-[0_8px_18px_rgba(15,42,68,0.06)]",
            tone === "emerald" && "border-emerald-100 bg-emerald-50 text-emerald-700",
            tone === "blue" && "border-sky-200 bg-sky-50 text-[#2F5D8A]",
            tone === "amber" && "border-amber-100 bg-amber-50 text-amber-600 dark:text-amber-400",
            tone === "rose" && "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400",
            tone === "default" && "border-slate-300 bg-slate-50 text-[#2F5D8A]",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </section>
  );
}
