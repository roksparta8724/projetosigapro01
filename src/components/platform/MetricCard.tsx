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
        "sig-metric-card group flex h-full min-h-[146px] flex-col overflow-hidden rounded-[24px] border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,42,68,0.05)] transition duration-200",
      )}
    >
      <div className="flex h-full items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col sig-text-wrap">
          <p className="line-clamp-1 text-xs uppercase tracking-[0.08em] text-slate-500" title={title}>
            {title}
          </p>
          <p
            className={cn(
              "mt-2 min-w-0 line-clamp-2 text-lg font-semibold leading-tight tracking-[-0.01em] text-slate-900",
              valueClassName,
            )}
            title={valueTitle ?? value}
          >
            {value}
          </p>
          <p className="mt-auto max-w-full pt-2 line-clamp-2 text-sm font-normal leading-snug text-slate-500" title={helper}>
            {helper}
          </p>
        </div>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border shadow-[0_6px_16px_rgba(15,42,68,0.05)]",
            tone === "emerald" && "border-emerald-100 bg-emerald-50 text-emerald-700",
            tone === "blue" && "border-sky-100 bg-sky-50 text-[#2F5D8A]",
            tone === "amber" && "border-amber-100 bg-amber-50 text-amber-700",
            tone === "rose" && "border-rose-100 bg-rose-50 text-rose-700",
            tone === "default" && "border-slate-200 bg-slate-50 text-[#2F5D8A]",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </section>
  );
}
