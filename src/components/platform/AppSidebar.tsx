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
  expanded?: boolean;
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
  expanded = true,
  darkSurface = true,
  onNavigate,
  showClose = false,
  onClose,
  expandedItems = {},
  onToggleItem,
}: SidebarInnerProps) {
  return (
    <div
      className="sig-sidebar-panel flex h-full min-h-0 flex-col bg-[var(--sig-sidebar-fill,#0d1526)]"
      data-sidebar-expanded={expanded ? "true" : "false"}
    >
      {showClose ? (
        <div className="sig-sidebar-mobile-header flex items-center justify-between border-b border-white/10 px-4 py-3.5">
          <div>
            <p className={cn("text-[10px] font-semibold uppercase tracking-[0.2em]", darkSurface ? "text-slate-400/90" : "text-slate-600")}>
              Navegacao
            </p>
            <p className={cn("mt-1 text-sm font-semibold", darkSurface ? "text-white" : "text-slate-900")}>
              Menu institucional
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

      <div className={cn("sig-sidebar-scroll min-h-0 flex-1 overflow-y-auto py-4", expanded ? "px-3.5" : "px-2.5")}>
        <nav className="sig-sidebar-nav space-y-3">
          {groups.map((group) => {
            if (group.items.length === 0) return null;

            return (
              <div key={group.title} className="sig-sidebar-group space-y-2.5">
                <div
                  className={cn(
                    "sig-sidebar-group-header overflow-hidden transition-all duration-200 ease-out",
                    expanded ? "max-h-10 px-1 opacity-100" : "max-h-0 px-0 opacity-0",
                  )}
                  aria-hidden={!expanded}
                >
                  <div className="flex items-center gap-3">
                    <span className={cn("h-px flex-1", darkSurface ? "bg-white/10" : "bg-slate-200")} />
                    <p className={cn("sig-sidebar-group-title shrink-0 truncate text-[10px] font-semibold uppercase tracking-[0.18em]", darkSurface ? "text-slate-400/85" : "text-slate-500")}>
                      {group.title}
                    </p>
                  </div>
                </div>

                {group.items.map((item) => {
                  const hasChildren = (item.children?.length ?? 0) > 0;
                  const isChildActive = item.children?.some((child) => pathname === child.to || pathname.startsWith(`${child.to}/`));
                  const isExactActive = pathname === item.to;
                  const active = hasChildren ? isExactActive || isChildActive : isExactActive;
                  const isExpanded = expandedItems[item.to] ?? isChildActive ?? false;
                  const Icon = item.icon;

                  return (
                    <div key={item.to} className="sig-sidebar-item-shell space-y-1.5">
                      <Link
                        to={item.to}
                        onClick={(event) => {
                          if (hasChildren && expanded && onToggleItem) {
                            event.preventDefault();
                            onToggleItem(item.to);
                          } else {
                            onNavigate?.();
                          }
                        }}
                        title={!expanded ? item.label : undefined}
                        data-sidebar-active={active ? "true" : "false"}
                        data-sidebar-collapsed={expanded ? "false" : "true"}
                        className={cn(
                          "sig-sidebar-item group flex items-center text-sm leading-5 transition-all duration-300 ease-out",
                          expanded ? "min-h-[52px] gap-3.5 rounded-[18px] px-3 py-3" : "mx-auto min-h-[54px] w-[54px] justify-center gap-0 rounded-[18px] px-0 py-0",
                          active
                            ? darkSurface
                              ? "border border-sky-200/16 bg-[linear-gradient(135deg,rgba(35,66,99,0.98)_0%,rgba(49,104,167,0.94)_100%)] text-white shadow-[0_14px_30px_rgba(2,6,23,0.26)]"
                              : "border border-slate-300 bg-white text-slate-950"
                            : darkSurface
                              ? "border border-white/[0.06] text-slate-300 hover:border-white/10 hover:bg-white/[0.045] hover:text-white hover:shadow-[0_10px_24px_rgba(2,6,23,0.18)]"
                              : "border border-transparent text-slate-700 hover:border-slate-300 hover:bg-black/[0.04] hover:text-slate-950",
                        )}
                      >
                        <span
                          className={cn(
                            "sig-sidebar-icon flex shrink-0 items-center justify-center border transition-all duration-300",
                            expanded ? "h-9 w-9 rounded-[14px]" : "h-10 w-10 rounded-[15px]",
                            active
                              ? darkSurface
                                ? "border-white/16 bg-white/14 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                                : "border-slate-300 bg-slate-50 text-slate-950"
                              : darkSurface
                                ? "border-white/8 bg-white/[0.03] text-sky-100/85 group-hover:border-white/12 group-hover:bg-white/[0.06] group-hover:text-sky-50"
                                : "border-slate-300/70 bg-white/80 text-slate-700 group-hover:border-slate-400 group-hover:bg-white group-hover:text-slate-950",
                          )}
                        >
                          <Icon className={cn("shrink-0", expanded ? "h-[17px] w-[17px]" : "h-[18px] w-[18px]")} />
                        </span>

                        <span
                          className={cn(
                            "sig-sidebar-label overflow-hidden transition-all duration-200 ease-out",
                            expanded ? "min-w-0 flex-1 opacity-100" : "w-0 max-w-0 opacity-0 pointer-events-none",
                          )}
                          aria-hidden={!expanded}
                        >
                          <span
                            className={cn(
                              "block sig-fit-title text-[13px] leading-5 tracking-[0.002em]",
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
                        </span>

                        {hasChildren && expanded ? (
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 shrink-0 transition",
                              isExpanded ? "rotate-180" : "rotate-0",
                              active ? (darkSurface ? "text-white/90" : "text-slate-600") : darkSurface ? "text-sky-200/80" : "text-slate-500",
                            )}
                          />
                        ) : null}
                      </Link>

                      {hasChildren && expanded && isExpanded ? (
                        <div
                          className={cn(
                            "sig-sidebar-submenu ml-5 border-l pl-4",
                            darkSurface ? "border-white/10" : "border-slate-200",
                          )}
                        >
                          <div className="space-y-2">
                            {item.children!.map((child) => {
                              const childActive = pathname === child.to || pathname.startsWith(`${child.to}/`);
                              const ChildIcon = child.icon;

                              return (
                                <Link
                                  key={child.to}
                                  to={child.to}
                                  onClick={onNavigate}
                                  className={cn(
                                    "sig-sidebar-subitem group flex min-h-[40px] items-center gap-2.5 rounded-[14px] px-3 py-2 text-[12px] font-medium transition-all",
                                    childActive
                                      ? darkSurface
                                        ? "border border-white/14 bg-white/[0.08] text-white shadow-[0_10px_24px_rgba(2,6,23,0.16)]"
                                        : "border border-slate-300 bg-white text-slate-950"
                                      : darkSurface
                                        ? "border border-transparent text-slate-300 hover:border-white/10 hover:bg-white/[0.05] hover:text-white"
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

      {footer ? (
        <div
          className={cn(
            "sig-sidebar-footer-shell mt-auto shrink-0 border-t pt-4 transition-all duration-300 ease-out",
            darkSurface ? "border-white/8" : "border-slate-200",
            expanded ? "px-3.5 pb-4" : "px-2.5 pb-4",
          )}
        >
          {footer}
        </div>
      ) : null}
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
          "sig-sidebar-shell relative hidden h-[calc(100vh-68px)] min-h-[calc(100vh-68px)] shrink-0 self-start overflow-hidden transition-[width] duration-300 ease-out lg:sticky lg:top-[68px] lg:flex lg:flex-col",
          expanded
            ? "w-[270px] after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-white/10"
            : "w-[90px] after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-white/8",
          className,
        )}
        data-sidebar-mode={inverseMain ? "inverse-main" : "default"}
        style={{ background: "var(--sig-sidebar-fill, #0d1526)" }}
      >
        <SidebarInner
          pathname={pathname}
          groups={groups}
          footer={footer}
          expanded={expanded}
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
            "absolute left-0 top-0 flex h-full w-[min(88vw,332px)] flex-col border-r border-white/10 shadow-[0_24px_48px_rgba(2,6,23,0.45)] transition-transform duration-200 ease-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
          data-sidebar-mode={inverseMain ? "inverse-main" : "default"}
          style={{ background: "var(--sig-sidebar-fill, #0d1526)" }}
        >
          <SidebarInner
            pathname={pathname}
            groups={groups}
            footer={footer}
            expanded
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
