import { UserAvatar } from "@/components/platform/UserAvatar";
import { cn } from "@/lib/utils";

type SidebarProfilePanelProps = {
  name: string;
  role: string;
  email?: string;
  statusLabel?: string;
  imageUrl?: string;
  compact?: boolean;
  onClick?: () => void;
  className?: string;
  darkSurface?: boolean;
};

export function SidebarProfilePanel({
  name,
  role,
  email,
  statusLabel,
  imageUrl,
  compact = false,
  onClick,
  className,
  darkSurface = true,
}: SidebarProfilePanelProps) {
  const content = (
    <>
      <div className={cn("flex items-center", compact ? "justify-center" : "gap-2.5")}>
        <UserAvatar
          name={name}
          imageUrl={imageUrl}
          size="sm"
          className="border-white/10 bg-white/[0.045]"
        />
        <div
          className={cn(
            "min-w-0 flex-1 overflow-hidden transition-all duration-200 ease-out",
            compact ? "max-w-0 opacity-0 pointer-events-none" : "max-w-full opacity-100",
          )}
          aria-hidden={compact}
        >
          <p className={cn("text-[10px] uppercase tracking-[0.14em]", darkSurface ? "text-white/65" : "text-slate-600")}>Conta</p>
          <p className={cn("mt-1 sig-fit-title text-sm font-semibold leading-tight", darkSurface ? "text-white" : "text-slate-950")} title={name}>
            {name}
          </p>
          <p className={cn("mt-0.5 sig-fit-copy text-[11px] font-medium", darkSurface ? "text-white" : "text-slate-700")} title={role}>
            {role}
          </p>
          {email ? (
            <p className={cn("mt-0.5 sig-fit-copy text-[11px]", darkSurface ? "text-white" : "text-slate-600")} title={email}>
              {email}
            </p>
          ) : null}
        </div>
      </div>

      {!compact && (statusLabel || onClick) ? (
        <div className={cn("mt-2 flex items-center justify-between gap-2 pt-2", darkSurface ? "border-t border-white/8" : "border-t border-slate-200")}>
          <p className={cn("sig-fit-title text-[10px] uppercase tracking-[0.1em]", darkSurface ? "text-white/65" : "text-slate-500")}>
            {statusLabel || ""}
          </p>
          {onClick ? <span className={cn("text-[11px] transition", darkSurface ? "text-white/80 group-hover:text-white" : "text-slate-500 group-hover:text-slate-800")}>Perfil</span> : null}
        </div>
      ) : null}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={compact ? name : undefined}
        className={cn(
          "group w-full rounded-[14px] text-left transition",
          compact ? "px-2 py-2" : "px-3 py-2.5",
          darkSurface
            ? "border border-white/18 bg-white/[0.06] hover:bg-white/[0.1]"
            : "border border-slate-200 bg-white/90 hover:bg-white",
          className,
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={cn(
        darkSurface ? "rounded-[14px] border border-white/18 bg-white/[0.06]" : "rounded-[14px] border border-slate-200 bg-white/90",
        compact ? "px-2 py-2" : "px-3 py-2.5",
        className,
      )}
      title={compact ? name : undefined}
    >
      {content}
    </div>
  );
}
