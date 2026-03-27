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
        "h-full min-w-0 overflow-hidden rounded-[22px] border p-5 shadow-[0_8px_16px_rgba(15,23,42,0.032)]",
        tone === "default" && "border-slate-200 bg-white",
        tone === "warning" && "border-amber-200/90 bg-white",
        tone === "danger" && "border-rose-200/90 bg-white",
        tone === "success" && "border-emerald-200/90 bg-white",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border",
            tone === "default" && "border-slate-200 bg-slate-50 text-slate-700",
            tone === "warning" && "border-amber-200 bg-amber-50 text-amber-600 dark:text-amber-400",
            tone === "danger" && "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400",
            tone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-700",
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
