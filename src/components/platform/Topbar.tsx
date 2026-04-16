import { type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Topbar({
  title,
  subtitle,
  icon: Icon,
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("sig-topbar flex flex-col gap-4 rounded-[22px] border border-slate-200 bg-white px-5 py-4 shadow-sm md:flex-row md:items-start md:justify-between", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {Icon ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-[14px] border border-slate-200 bg-slate-50 text-[#3b82f6]">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="sig-fit-title text-base font-semibold text-slate-950">{title}</p>
          {subtitle ? <p className="sig-fit-copy mt-1 text-sm text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {actions ? <div className="sig-topbar-actions flex w-full shrink-0 flex-wrap items-center gap-2 md:w-auto md:justify-end [&>*]:w-full sm:[&>*]:w-auto">{actions}</div> : null}
    </div>
  );
}

export function TopbarAction(props: React.ComponentProps<typeof Button>) {
  return <Button variant="outline" className="rounded-full" {...props} />;
}
