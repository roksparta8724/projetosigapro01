import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export type AppSidebarItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export type AppSidebarGroup = {
  title: string;
  items: AppSidebarItem[];
};

export function AppSidebar({
  pathname,
  groups,
  expanded = true,
  footer,
  className,
  inverseMain = false,
  darkSurface = true,
}: {
  pathname: string;
  groups: AppSidebarGroup[];
  expanded?: boolean;
  footer?: React.ReactNode;
  className?: string;
  inverseMain?: boolean;
  darkSurface?: boolean;
}) {
  return (
    <aside
      className={cn(
        "relative hidden min-h-[calc(100vh-66px)] shrink-0 self-stretch transition-[width] duration-200 lg:sticky lg:top-[66px] lg:flex lg:flex-col",
        expanded
          ? "w-[244px] after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-white/12"
          : "w-0 overflow-hidden after:hidden",
        className,
      )}
      data-sidebar-mode={inverseMain ? "inverse-main" : "default"}
      style={{ background: "var(--sig-sidebar-fill, #0d1526)" }}
    >
      <div className="flex h-full min-h-0 flex-col bg-[linear-gradient(180deg,rgba(255,255,255,0.025)_0%,rgba(255,255,255,0.012)_34%,rgba(255,255,255,0)_100%)]">
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3.5">
          <nav className="space-y-5">
            {groups.map((group) => {
              if (group.items.length === 0) return null;

              return (
                <div key={group.title} className="space-y-1.5">
                  <p className={cn("px-2 pb-1 text-[10px] font-normal uppercase tracking-[0.2em]", darkSurface ? "text-slate-400/90" : "text-slate-600")}>
                    {group.title}
                  </p>

                  {group.items.map((item) => {
                    const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        data-sidebar-active={active ? "true" : "false"}
                        className={cn(
                          "group flex items-center gap-2.5 rounded-[14px] px-2.5 py-2 text-sm leading-5 transition-all duration-200 ease-out",
                          active
                            ? darkSurface
                              ? "border border-white/20 bg-white/[0.9] text-slate-950"
                              : "border border-slate-300 bg-white text-slate-950"
                            : darkSurface
                              ? "border border-transparent text-slate-300 hover:border-white/30 hover:bg-white/[0.04] hover:text-white"
                              : "border border-transparent text-slate-700 hover:border-slate-300 hover:bg-black/[0.04] hover:text-slate-950",
                        )}
                        style={
                          active
                            ? { boxShadow: "inset 2px 0 0 rgba(15,23,42,0.95)" }
                            : { boxShadow: "none" }
                        }
                      >
                        <span
                          className={cn(
                            "flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[9px] border transition-all duration-200",
                            active
                              ? "border-slate-300 bg-slate-50 text-slate-950"
                              : darkSurface
                                ? "border-white/8 bg-white/[0.025] text-slate-300 group-hover:border-white/10 group-hover:bg-white/[0.05] group-hover:text-white"
                                : "border-slate-300/70 bg-white/80 text-slate-700 group-hover:border-slate-400 group-hover:bg-white group-hover:text-slate-950",
                          )}
                        >
                          <Icon className="h-[15px] w-[15px] shrink-0" />
                        </span>
                        <span
                          className={cn(
                            "min-w-0 flex-1 sig-fit-title text-[13.5px] leading-5 tracking-[0.003em]",
                            active ? "font-semibold text-slate-950" : darkSurface ? "font-medium text-slate-200" : "font-medium text-slate-800",
                          )}
                          title={item.label}
                        >
                          {item.label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </nav>
        </div>

        {footer ? <div className="shrink-0 border-t border-white/8 px-3 pb-3 pt-2.5">{footer}</div> : null}
      </div>
    </aside>
  );
}
