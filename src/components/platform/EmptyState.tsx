import { type LucideIcon, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sig-ui-card rounded-[22px] border border-dashed border-slate-200 bg-slate-50/85 px-5 py-8 text-center shadow-sm",
        className,
      )}
    >
      <div className="sig-section-icon mx-auto flex h-11 w-11 items-center justify-center rounded-[14px] border border-slate-200 bg-white text-[#3b82f6] shadow-sm">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-950">{title}</p>
      <p className="mx-auto mt-2 max-w-[46ch] text-sm leading-6 text-slate-500">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function EmptyStateAction(props: React.ComponentProps<typeof Button>) {
  return <Button className="rounded-full" {...props} />;
}
