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
        "sig-stat-card group flex h-full min-h-[136px] min-w-0 flex-col overflow-hidden rounded-[20px] border border-slate-200/90 bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-4 shadow-[0_10px_22px_rgba(15,42,68,0.045)] transition duration-200 hover:-translate-y-[1px] hover:shadow-[0_14px_28px_rgba(15,42,68,0.06)] sm:min-h-[148px] sm:rounded-[22px] sm:p-5",
      )}
    >
      <div className="flex h-full items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col sig-text-wrap">
          <p className="sig-fit-title text-[11px] uppercase tracking-[0.14em] text-slate-500" title={label}>{label}</p>
          <p
            className={cn(
              "mt-2 min-w-0 sig-fit-title text-[1rem] font-semibold leading-tight tracking-[-0.01em] text-slate-900 sm:text-lg",
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
            "sig-stat-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border shadow-[0_8px_18px_rgba(15,42,68,0.05)] sm:h-11 sm:w-11 sm:rounded-[14px]",
            tone === "emerald" && "border-emerald-100 bg-emerald-50 text-emerald-700",
            tone === "blue" && "border-sky-100 bg-sky-50 text-[#2F5D8A]",
            tone === "amber" && "border-amber-100 bg-amber-50 text-amber-600 dark:text-amber-400",
            tone === "rose" && "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400",
            tone === "default" && "border-slate-200 bg-slate-50 text-[#2F5D8A]",
          )}
        >
          <Icon className="h-4 w-4 sm:h-4 sm:w-4" />
        </div>
      </div>
    </section>
  );
}
