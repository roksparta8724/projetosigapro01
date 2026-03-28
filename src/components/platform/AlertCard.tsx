import { AlertTriangle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function AlertCard({
  title,
  description,
  tone = "default",
  icon: Icon = AlertTriangle,
  className,
}: {
  title: string;
  description: string;
  tone?: "default" | "warning" | "danger" | "success";
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sig-ui-card h-full min-w-0 overflow-hidden rounded-[22px] border bg-[linear-gradient(180deg,#ffffff_0%,#fbfdff_100%)] p-5 shadow-[0_10px_22px_rgba(15,23,42,0.04)] ring-1 ring-white/70",
        tone === "default" && "border-slate-300/90",
        tone === "warning" && "border-amber-200/90",
        tone === "danger" && "border-rose-200/90",
        tone === "success" && "border-emerald-200/90",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "sig-section-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border shadow-[0_8px_18px_rgba(15,23,42,0.055)]",
            tone === "default" && "border-slate-300/90 bg-[linear-gradient(180deg,#ffffff_0%,#f4f8fc_100%)] text-[#2563eb]",
            tone === "warning" && "border-amber-200 bg-amber-50 text-amber-600 dark:text-amber-300",
            tone === "danger" && "border-rose-200 bg-rose-50 text-rose-600 dark:text-rose-300",
            tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700 dark:text-emerald-300",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 max-w-[32rem] sig-text-wrap">
          <p className="sig-section-title line-clamp-2" title={title}>
            {title}
          </p>
          <p className="sig-subtitle mt-1 line-clamp-2 leading-6" title={description}>
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
