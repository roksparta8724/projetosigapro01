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
        "mx-auto flex w-full max-w-[1600px] flex-col gap-5 px-1 pb-8 sm:gap-6 sm:px-2 md:gap-7 md:px-3 xl:px-4 2xl:max-w-[1700px]",
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
        "sig-page-header relative overflow-hidden rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-[0_14px_28px_rgba(15,23,42,0.07)] md:p-6",
        className,
      )}
    >
      <div className="relative flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          {breadcrumb ? <div className="mb-2.5">{breadcrumb}</div> : null}
          <div className="flex items-start gap-3">
            {Icon ? (
              <div className="sig-header-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-slate-200 bg-slate-50 text-[#2563eb] shadow-[0_8px_18px_rgba(15,23,42,0.05)] backdrop-blur-sm dark:border-white/12 dark:bg-white/[0.06] dark:text-sky-200">
                <Icon className="h-5 w-5" />
              </div>
            ) : null}
            <div className="min-w-0 sig-text-wrap">
              {eyebrow ? <p className="sig-section-label">{eyebrow}</p> : null}
              <h1 className="sig-page-title mt-1.5 max-w-full text-balance" title={title}>
                {title}
              </h1>
              {description ? (
                <p className="sig-subtitle mt-2 line-clamp-3 max-w-[72ch]" title={description}>
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        </div>
        {actions ? (
          <div className="sig-header-actions flex w-full shrink-0 flex-wrap items-center gap-2 xl:w-auto xl:justify-end [&>*]:w-full sm:[&>*]:w-auto">
            {actions}
          </div>
        ) : null}
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
        "sig-stats-row grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 md:gap-5 min-[1500px]:grid-cols-4 min-[1500px]:auto-rows-fr [&>*]:h-full",
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
        "sig-section-card flex h-full min-w-0 flex-col overflow-hidden rounded-[24px] border border-slate-200/80 bg-white p-5 shadow-[0_12px_26px_rgba(15,23,42,0.06)] transition duration-200 md:p-6",
        className,
      )}
    >
      <div className={cn("flex flex-col gap-3 border-b border-slate-200/90 pb-4 lg:flex-row lg:items-start lg:justify-between", headerClassName)}>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            {Icon ? (
              <div className="sig-section-icon mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border border-slate-200 bg-slate-50 text-[#2563eb] shadow-[0_8px_18px_rgba(15,23,42,0.05)] dark:border-white/12 dark:bg-white/[0.06] dark:text-sky-200">
                <Icon className="h-4.5 w-4.5" />
              </div>
            ) : null}
            <div className="min-w-0 sig-text-wrap">
              <h2 className="sig-section-title line-clamp-3 max-w-[42ch]" title={title}>{title}</h2>
              {description ? <p className="sig-subtitle mt-1 line-clamp-3 max-w-[72ch]" title={description}>{description}</p> : null}
            </div>
          </div>
        </div>
        {actions ? (
          <div className="sig-section-actions flex w-full shrink-0 flex-wrap items-center gap-2 lg:w-auto lg:justify-end [&>*]:w-full sm:[&>*]:w-auto">
            {actions}
          </div>
        ) : null}
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
        "sig-main-grid grid grid-cols-1 gap-6 min-[1480px]:grid-cols-[minmax(0,2.1fr)_minmax(320px,0.92fr)] min-[1480px]:items-start min-[1680px]:grid-cols-[minmax(0,2.25fr)_minmax(380px,1fr)]",
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
  return <div className={cn("sig-main-content min-w-0 flex flex-col gap-5", className)}>{children}</div>;
}

export function SideContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <aside className={cn("sig-side-content min-w-0 flex flex-col gap-5 xl:self-start", className)}>{children}</aside>;
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
        "sig-section-nav rounded-[20px] border border-slate-300/90 bg-[linear-gradient(180deg,#ffffff_0%,#fbfcfe_100%)] p-2 shadow-[0_10px_24px_rgba(15,23,42,0.05)] ring-1 ring-white/70 sm:rounded-[24px] sm:p-2.5",
        className,
      )}
  >
      <div className="-mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:[grid-template-columns:repeat(auto-fit,minmax(220px,1fr))] md:overflow-visible md:px-0 md:pb-0">
        {items.map((item) => {
          const active = item.value === value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onChange(item.value)}
              data-nav-active={active ? "true" : "false"}
              className={cn(
                "sig-nav-item flex min-h-[72px] min-w-[220px] snap-start flex-col items-start justify-center rounded-[16px] border px-4 py-3 text-left transition duration-200 md:min-w-0 md:rounded-[18px] md:py-3.5",
                active
                  ? "sig-nav-item-active !border-sky-300/30 !bg-[linear-gradient(135deg,#0f4a7a_0%,#2f6ea8_100%)] !text-white shadow-[0_12px_24px_rgba(15,23,42,0.24)]"
                  : "border-slate-200/80 bg-slate-50/92 text-slate-700 hover:border-slate-300 hover:bg-white",
              )}
            >
              <span
                className={cn(
                  "sig-nav-item-label sig-fit-title text-sm font-medium",
                  active ? "!text-white" : "text-slate-900",
                )}
                title={item.label}
              >
                {item.label}
              </span>
              {item.helper ? (
                <span
                  className={cn(
                    "sig-nav-item-helper mt-1 sig-fit-copy text-[11px]",
                    active ? "!text-sky-100" : "text-slate-500",
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
