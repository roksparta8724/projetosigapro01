import { X } from "lucide-react";
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

type SidebarInnerProps = {
  pathname: string;
  groups: AppSidebarGroup[];
  footer?: React.ReactNode;
  darkSurface?: boolean;
  onNavigate?: () => void;
  showClose?: boolean;
  onClose?: () => void;
};

function SidebarInner({
  pathname,
  groups,
  footer,
  darkSurface = true,
  onNavigate,
  showClose = false,
  onClose,
}: SidebarInnerProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--sig-sidebar-fill,#0d1526)]">
      {showClose ? (
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <p className={cn("text-[10px] font-normal uppercase tracking-[0.2em]", darkSurface ? "text-slate-400/90" : "text-slate-600")}>
              Navegação
            </p>
            <p className={cn("mt-1 text-sm font-medium", darkSurface ? "text-white" : "text-slate-900")}>
              Menu principal
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "inline-flex h-10 w-10 items-center justify-center rounded-full border transition",
              darkSurface
                ? "border-white/14 bg-white/[0.06] text-white hover:bg-white/[0.1]"
                : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50",
            )}
            aria-label="Fechar menu"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3.5">
        <nav className="space-y-5">
          {groups.map((group) => {
            if (group.items.length === 0) return null;

            return (
              <div key={group.title} className="space-y-1.5">
                <p
                  className={cn(
                    "px-2 pb-1 text-[10px] font-normal uppercase tracking-[0.2em]",
                    darkSurface ? "text-slate-400/90" : "text-slate-600",
                  )}
                >
                  {group.title}
                </p>

                {group.items.map((item) => {
                  const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={onNavigate}
                      data-sidebar-active={active ? "true" : "false"}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-[14px] px-3 py-2.5 text-sm leading-5 transition-all duration-200 ease-out",
                        active
                          ? darkSurface
                            ? "border border-sky-200/18 bg-[linear-gradient(135deg,rgba(32,78,125,0.98)_0%,rgba(59,130,246,0.92)_100%)] text-white"
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
                          "sig-sidebar-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border transition-all duration-200",
                          active
                            ? darkSurface
                              ? "border-white/22 bg-white/16 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                              : "border-slate-300 bg-slate-50 text-slate-950"
                            : darkSurface
                              ? "border-white/8 bg-white/[0.025] text-slate-300 group-hover:border-white/10 group-hover:bg-white/[0.05] group-hover:text-white"
                              : "border-slate-300/70 bg-white/80 text-slate-700 group-hover:border-slate-400 group-hover:bg-white group-hover:text-slate-950",
                        )}
                      >
                        <Icon className="h-[15px] w-[15px] shrink-0" />
                      </span>
                      <span
                        className={cn(
                          "sig-sidebar-label min-w-0 flex-1 sig-fit-title text-[13.5px] leading-5 tracking-[0.003em]",
                          active
                            ? darkSurface
                              ? "font-semibold text-white"
                              : "font-semibold text-slate-950"
                            : darkSurface
                              ? "font-medium text-slate-200"
                              : "font-medium text-slate-800",
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

      {footer ? <div className="mt-auto shrink-0 px-3 pb-5 pt-6">{footer}</div> : null}
    </div>
  );
}

export function AppSidebar({
  pathname,
  groups,
  expanded = true,
  footer,
  className,
  inverseMain = false,
  darkSurface = true,
  mobileOpen = false,
  onMobileClose,
}: {
  pathname: string;
  groups: AppSidebarGroup[];
  expanded?: boolean;
  footer?: React.ReactNode;
  className?: string;
  inverseMain?: boolean;
  darkSurface?: boolean;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  return (
    <>
        <aside
          className={cn(
            "relative hidden h-[calc(100vh-56px)] shrink-0 self-stretch transition-[width] duration-200 lg:sticky lg:top-[56px] lg:flex lg:flex-col",
            expanded
              ? "w-[244px] after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-white/12"
              : "w-0 overflow-hidden after:hidden",
            className,
        )}
        data-sidebar-mode={inverseMain ? "inverse-main" : "default"}
        style={{ background: "var(--sig-sidebar-fill, #0d1526)" }}
      >
        <SidebarInner pathname={pathname} groups={groups} footer={footer} darkSurface={darkSurface} />
      </aside>

      <div
        className={cn(
          "fixed inset-0 z-[70] lg:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!mobileOpen}
      >
        <div
          className={cn(
            "absolute inset-0 bg-[#020617]/55 backdrop-blur-[2px] transition-opacity",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={onMobileClose}
        />
        <aside
          className={cn(
            "absolute left-0 top-0 flex h-full w-[min(88vw,320px)] flex-col border-r border-white/10 shadow-[0_24px_48px_rgba(2,6,23,0.45)] transition-transform duration-200 ease-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
          data-sidebar-mode={inverseMain ? "inverse-main" : "default"}
          style={{ background: "var(--sig-sidebar-fill, #0d1526)" }}
        >
          <SidebarInner
            pathname={pathname}
            groups={groups}
            footer={footer}
            darkSurface={darkSurface}
            onNavigate={onMobileClose}
            showClose
            onClose={onMobileClose}
          />
        </aside>
      </div>
    </>
  );
}
