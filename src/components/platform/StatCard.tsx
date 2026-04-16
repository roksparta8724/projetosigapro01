import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  description,
  icon: Icon,
  tone = "default",
  valueClassName,
  valueTitle,
}: {
  label: string;
  value: string;
  description: string;
  icon: LucideIcon;
  tone?: "default" | "emerald" | "blue" | "amber" | "rose";
  valueClassName?: string;
  valueTitle?: string;
}) {
  return (
    <section
      className={cn(
        "sig-stat-card group flex h-full min-h-[140px] min-w-0 flex-col overflow-hidden rounded-[20px] border border-slate-200/80 bg-white p-4 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-[1px] hover:shadow-[0_14px_28px_rgba(15,23,42,0.08)] sm:min-h-[152px] sm:rounded-[22px] sm:p-5",
      )}
    >
      <div className="flex h-full items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col sig-text-wrap">
          <p className="sig-fit-title text-[11px] uppercase tracking-[0.14em] text-slate-500" title={label}>{label}</p>
          <p
            className={cn(
              "mt-2 min-w-0 sig-fit-title text-[1.35rem] font-semibold leading-tight tracking-[-0.015em] text-slate-950 sm:text-[1.5rem]",
              valueClassName,
            )}
            title={valueTitle ?? value}
          >
            {value}
          </p>
          <p className="sig-fit-copy mt-auto max-w-full pt-2 text-[12px] font-normal leading-5 text-slate-500 sm:text-sm sm:leading-6" title={description}>{description}</p>
        </div>
        <div
          className={cn(
            "sig-stat-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border shadow-[0_10px_20px_rgba(15,23,42,0.08)] dark:shadow-[0_12px_26px_rgba(2,6,23,0.18)]",
            tone === "emerald" && "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200",
            tone === "blue" && "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200",
            tone === "amber" && "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200",
            tone === "rose" && "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200",
            tone === "default" && "border-slate-200 bg-slate-100 text-slate-700 dark:border-white/12 dark:bg-white/[0.06] dark:text-slate-100",
          )}
        >
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
    </section>
  );
}
