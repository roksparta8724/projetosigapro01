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
        "sig-ui-card flex h-full min-w-0 flex-col overflow-hidden rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_12px_26px_rgba(15,23,42,0.06)] md:p-6",
        className,
      )}
    >
      <div className="flex flex-col gap-3 border-b border-slate-200/70 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            {Icon ? (
              <div className="sig-section-icon flex h-10 w-10 items-center justify-center rounded-[14px] border border-slate-200 bg-slate-50 text-[#2563eb] shadow-[0_8px_18px_rgba(15,23,42,0.05)] dark:border-white/12 dark:bg-white/[0.06] dark:text-sky-200">
                <Icon className="h-4.5 w-4.5" />
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
        {actions ? (
          <div className="sig-section-actions flex w-full shrink-0 flex-wrap items-center gap-2 lg:w-auto lg:justify-end [&>*]:w-full sm:[&>*]:w-auto">
            {actions}
          </div>
        ) : null}
      </div>
      <div className="sig-table-content min-w-0 flex-1 pt-5">{children}</div>
    </section>
  );
}
