import { ChevronDown, ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export type AppSidebarItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: Array<{ to: string; label: string; icon?: React.ComponentType<{ className?: string }> }>;
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
  expandedItems?: Record<string, boolean>;
  onToggleItem?: (itemKey: string) => void;
};

function SidebarInner({
  pathname,
  groups,
  footer,
  darkSurface = true,
  onNavigate,
  showClose = false,
  onClose,
  expandedItems = {},
  onToggleItem,
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

      <div className="sig-sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <nav className="space-y-2">
          {groups.map((group) => {
            if (group.items.length === 0) return null;

            return (
              <div key={group.title} className="space-y-2">
                {group.items.map((item) => {
                  const hasChildren = (item.children?.length ?? 0) > 0;
                  const isChildActive = item.children?.some((child) => pathname === child.to || pathname.startsWith(`${child.to}/`));
                  const isExactActive = pathname === item.to;
                  const active = hasChildren ? (isExactActive || isChildActive) : isExactActive;
                  const isExpanded = expandedItems[item.to] ?? isChildActive ?? false;
                  const Icon = item.icon;

                  return (
                    <div key={item.to} className="space-y-1.5">
                      <Link
                        to={item.to}
                        onClick={(event) => {
                          if (hasChildren && onToggleItem) {
                            event.preventDefault();
                            onToggleItem(item.to);
                          } else {
                            onNavigate?.();
                          }
                        }}
                        data-sidebar-active={active ? "true" : "false"}
                        className={cn(
                          "group flex min-h-[44px] items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm leading-5 transition-all duration-200 ease-out hover:shadow-[0_6px_16px_rgba(2,6,23,0.18)]",
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
                            "sig-sidebar-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-all duration-200",
                            active
                              ? darkSurface
                              ? "border-white/22 bg-white/16 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                              : "border-slate-300 bg-slate-50 text-slate-950"
                            : darkSurface
                              ? "border-white/8 bg-white/[0.025] text-sky-100/80 group-hover:border-white/10 group-hover:bg-white/[0.05] group-hover:text-sky-100"
                              : "border-slate-300/70 bg-white/80 text-slate-700 group-hover:border-slate-400 group-hover:bg-white group-hover:text-slate-950",
                          )}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                        </span>
                        <span
                          className={cn(
                            "sig-sidebar-label min-w-0 flex-1 sig-fit-title text-[13px] leading-5 tracking-[0.003em]",
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
                        {hasChildren ? (
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 transition",
                              isExpanded ? "rotate-180" : "rotate-0",
                              active ? (darkSurface ? "text-white/90" : "text-slate-600") : darkSurface ? "text-sky-200/80" : "text-slate-500",
                            )}
                          />
                        ) : null}
                      </Link>

                      {hasChildren && isExpanded ? (
                        <div
                          className={cn(
                            "ml-6 border-l pl-3",
                            darkSurface ? "border-white/10" : "border-slate-200",
                          )}
                        >
                          <div className="space-y-1.5">
                            {item.children!.map((child) => {
                              const childActive = pathname === child.to || pathname.startsWith(`${child.to}/`);
                              const ChildIcon = child.icon;
                              return (
                                <Link
                                  key={child.to}
                                  to={child.to}
                                  onClick={onNavigate}
                                  className={cn(
                                    "group flex min-h-[36px] items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-all",
                                    childActive
                                      ? darkSurface
                                        ? "border border-white/18 bg-white/10 text-white"
                                        : "border border-slate-300 bg-white text-slate-950"
                                      : darkSurface
                                        ? "border border-transparent text-slate-300 hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                                        : "border border-transparent text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950",
                                  )}
                                >
                                  {ChildIcon ? (
                                    <ChildIcon className={cn("h-3.5 w-3.5", childActive ? (darkSurface ? "text-white/90" : "text-slate-600") : darkSurface ? "text-sky-200/80" : "text-slate-500")} />
                                  ) : (
                                    <ChevronRight className={cn("h-3.5 w-3.5", childActive ? (darkSurface ? "text-white/90" : "text-slate-600") : darkSurface ? "text-sky-200/80" : "text-slate-500")} />
                                  )}
                                  <span className="min-w-0 flex-1 truncate">{child.label}</span>
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </div>

      {footer ? <div className="mt-auto shrink-0 px-3 pb-4 pt-4">{footer}</div> : null}
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
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setExpandedItems((current) => {
      const next = { ...current };
      groups.forEach((group) => {
        group.items.forEach((item) => {
          if (!item.children?.length) return;
          const shouldExpand = pathname === item.to || pathname.startsWith(`${item.to}/`);
          if (shouldExpand) {
            next[item.to] = true;
          }
        });
      });
      return next;
    });
  }, [groups, pathname]);

  return (
    <>
        <aside
          className={cn(
            "relative hidden h-[calc(100vh-56px)] shrink-0 self-stretch transition-[width] duration-200 lg:sticky lg:top-[56px] lg:flex lg:flex-col",
            expanded
              ? "w-[264px] after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-white/12"
              : "w-0 overflow-hidden after:hidden",
            className,
        )}
        data-sidebar-mode={inverseMain ? "inverse-main" : "default"}
        style={{ background: "var(--sig-sidebar-fill, #0d1526)" }}
      >
        <SidebarInner
          pathname={pathname}
          groups={groups}
          footer={footer}
          darkSurface={darkSurface}
          expandedItems={expandedItems}
          onToggleItem={(itemKey) =>
            setExpandedItems((current) => ({
              ...current,
              [itemKey]: !current[itemKey],
            }))
          }
        />
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
            expandedItems={expandedItems}
            onToggleItem={(itemKey) =>
              setExpandedItems((current) => ({
                ...current,
                [itemKey]: !current[itemKey],
              }))
            }
          />
        </aside>
      </div>
    </>
  );
}
