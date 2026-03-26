import { type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-[1480px] flex-col gap-6 px-1 pb-4 2xl:max-w-[1540px]",
      className,
    )}
  >
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  breadcrumb,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "sig-page-header relative overflow-hidden rounded-[28px] border border-slate-200/90 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.08),transparent_28%),linear-gradient(135deg,#ffffff_0%,#fbfcfe_46%,#f2f7fb_100%)] p-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)] md:p-6",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-y-0 right-0 w-[30%] bg-[radial-gradient(circle_at_top_right,rgba(15,23,42,0.05),transparent_60%)]" />
      <div className="relative flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          {breadcrumb ? <div className="mb-2.5">{breadcrumb}</div> : null}
          <div className="flex items-start gap-3">
            {Icon ? (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-slate-200 bg-white/95 text-[#14532d] shadow-[0_6px_16px_rgba(15,23,42,0.05)] backdrop-blur-sm">
                <Icon className="h-4.5 w-4.5" />
              </div>
            ) : null}
            <div className="min-w-0 sig-text-wrap">
              {eyebrow ? <p className="sig-section-label text-[#64748b]">{eyebrow}</p> : null}
              <h1 className="sig-page-title mt-1.5 max-w-full text-[#0f172a]" title={title}>
                {title}
              </h1>
              {description ? (
                <p className="sig-subtitle mt-2 line-clamp-2 max-w-[62ch] text-[#6b7280]" title={description}>
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">{actions}</div> : null}
      </div>
    </section>
  );
}

export function StatsCards({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-4 xl:auto-rows-fr [&>*]:h-full",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  icon: Icon,
  actions,
  children,
  className,
  contentClassName,
  headerClassName,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  headerClassName?: string;
}) {
  return (
    <section
      className={cn(
        "sig-section-card flex h-full flex-col rounded-[24px] border border-slate-200/90 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)] transition duration-200 md:p-6",
        className,
      )}
    >
      <div className={cn("flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between", headerClassName)}>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            {Icon ? (
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfd_100%)] text-[#14532d] shadow-[0_6px_16px_rgba(15,23,42,0.04)]">
                <Icon className="h-4 w-4" />
              </div>
            ) : null}
            <div className="min-w-0 sig-text-wrap">
              <h2 className="sig-section-title line-clamp-2 max-w-[34ch]" title={title}>{title}</h2>
              {description ? <p className="sig-subtitle mt-1 line-clamp-2 max-w-[60ch]" title={description}>{description}</p> : null}
            </div>
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className={cn("min-w-0 flex-1 pt-5", contentClassName)}>{children}</div>
    </section>
  );
}

export function MainGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.75fr)_minmax(320px,0.95fr)] xl:items-start",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function MainContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("min-w-0 flex flex-col gap-6", className)}>{children}</div>;
}

export function SideContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <aside className={cn("min-w-0 flex flex-col gap-6 xl:self-start", className)}>{children}</aside>;
}

export function InternalSectionNav({
  items,
  value,
  onChange,
  className,
}: {
  items: Array<{ value: string; label: string; helper?: string }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "sig-section-nav rounded-[24px] border border-slate-200/90 bg-white p-2 shadow-[0_8px_24px_rgba(15,23,42,0.04)]",
      className,
    )}
  >
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onChange(item.value)}
              className={cn(
                "flex min-w-0 min-h-[76px] flex-col items-start justify-center rounded-[18px] border px-4 py-3 text-left transition",
                active
                  ? "border-slate-300 bg-slate-950 text-white shadow-[0_8px_20px_rgba(15,23,42,0.12)]"
                  : "border-transparent bg-slate-50 text-slate-700 hover:border-slate-200 hover:bg-white",
              )}
            >
              <span
                className={cn(
                  "line-clamp-1 text-sm font-medium",
                  active ? "text-white" : "text-slate-900",
                )}
                title={item.label}
              >
                {item.label}
              </span>
              {item.helper ? (
                <span
                  className={cn(
                    "mt-1 line-clamp-1 text-xs",
                    active ? "text-white/72" : "text-slate-500",
                  )}
                  title={item.helper}
                >
                  {item.helper}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
