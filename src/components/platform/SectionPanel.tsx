import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionPanelProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  headerClassName?: string;
}

export function SectionPanel({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
  contentClassName,
  headerClassName,
}: SectionPanelProps) {
  return (
    <section
      className={cn(
        "rounded-[24px] border border-[#CBD5E1] bg-[#F8FAFC] px-5 py-5 shadow-sm",
        className,
      )}
    >
      <div
        className={cn(
          "flex flex-col gap-4",
          headerClassName,
        )}
      >
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            {Icon ? (
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#D8E0EA] bg-white text-slate-700 shadow-sm">
                <Icon className="h-4.5 w-4.5" />
              </div>
            ) : null}

            <div className="min-w-0 flex-1">
              <h2 className="text-[26px] font-semibold leading-tight tracking-[-0.02em] text-slate-950">
                {title}
              </h2>

              {description ? (
                <p className="mt-2 max-w-[900px] text-[14px] leading-7 text-slate-600">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {actions ? (
          <div className="w-full border-t border-[#D8E0EA] pt-4">
            {actions}
          </div>
        ) : null}
      </div>

      <div className={cn("mt-5", contentClassName)}>{children}</div>
    </section>
  );
}