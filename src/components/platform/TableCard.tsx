import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function TableCard({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex h-full flex-col rounded-[24px] border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] md:p-6",
        className,
      )}
    >
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            {Icon ? (
              <div className="flex h-9 w-9 items-center justify-center rounded-[12px] border border-slate-200 bg-slate-50 text-slate-700">
                <Icon className="h-4 w-4" />
              </div>
            ) : null}
            <div className="min-w-0 max-w-[44rem] sig-text-wrap">
              <p className="sig-section-title line-clamp-2 max-w-[34ch]" title={title}>
                {title}
              </p>
              {description ? (
                <p className="sig-subtitle mt-1 line-clamp-2" title={description}>
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className="min-w-0 flex-1 pt-5">{children}</div>
    </section>
  );
}
