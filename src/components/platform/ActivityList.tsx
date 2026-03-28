import { ArrowUpRight, Clock3, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type ActivityItem = {
  id: string;
  title: string;
  description?: string;
  meta?: string;
  badge?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
};

export function ActivityList({
  items,
  className,
}: {
  items: ActivityItem[];
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {items.map((item) => {
        const Icon = item.icon ?? Clock3;
        return (
          <div key={item.id} className="sig-ui-card rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="sig-section-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-slate-200 bg-slate-50 text-[#3b82f6]">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="sig-fit-title text-sm font-semibold text-slate-950" title={item.title}>
                    {item.title}
                  </p>
                  {item.badge ? (
                    <Badge variant="outline" className="rounded-full border-slate-200 text-slate-600">
                      {item.badge}
                    </Badge>
                  ) : null}
                </div>
                {item.description ? (
                  <p className="sig-fit-copy mt-1 text-sm leading-6 text-slate-500" title={item.description}>
                    {item.description}
                  </p>
                ) : null}
                {item.meta ? <p className="mt-2 text-xs uppercase tracking-[0.14em] text-slate-400">{item.meta}</p> : null}
              </div>
              {item.action ? <div className="shrink-0">{item.action}</div> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ActivityCardLink({ children }: { children: React.ReactNode }) {
  return (
    <span className="sig-dark-ghost-btn inline-flex h-9 items-center gap-1 rounded-full border px-3 text-xs font-medium text-slate-700">
      {children}
      <ArrowUpRight className="h-3.5 w-3.5" />
    </span>
  );
}
