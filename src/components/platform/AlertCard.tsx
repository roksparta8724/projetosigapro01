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
        "h-full rounded-[22px] border p-5 shadow-[0_8px_20px_rgba(15,23,42,0.04)]",
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
            tone === "warning" && "border-amber-200 bg-white text-amber-700",
            tone === "danger" && "border-rose-200 bg-white text-rose-700",
            tone === "success" && "border-emerald-200 bg-white text-emerald-700",
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 max-w-[32rem] sig-text-wrap">
          <p className="sig-section-title line-clamp-2" title={title}>
            {title}
          </p>
          <p className="sig-subtitle mt-1 line-clamp-2" title={description}>
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
