import { UserAvatar } from "@/components/platform/UserAvatar";
import { formatDisplayText, humanizeRoleLabel } from "@/lib/displayText";
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
  const shortName = formatDisplayText(name, "name", {
    fallback: "Conta institucional",
    maxLength: compact ? 18 : 26,
  });
  const roleTooltip = humanizeRoleLabel(role, "Perfil não informado");
  const roleLabel = formatDisplayText(role, "role", {
    fallback: "Perfil não informado",
    maxLength: compact ? 18 : 28,
  });

  const content = (
    <>
      <div className={cn("flex items-start", compact ? "justify-center" : "gap-3.5")}>
        <UserAvatar
          name={name}
          imageUrl={imageUrl}
          size="sm"
          className="border-white/10 bg-white/[0.045] shadow-[0_10px_22px_rgba(2,6,23,0.18)]"
        />
        <div
          className={cn(
            "min-w-0 flex-1 overflow-hidden transition-all duration-200 ease-out",
            compact ? "max-w-0 opacity-0 pointer-events-none" : "max-w-full opacity-100",
          )}
          aria-hidden={compact}
        >
          <p className={cn("text-[10px] font-semibold uppercase tracking-[0.18em]", darkSurface ? "text-white/55" : "text-slate-500")}>Conta</p>
          <p
            className={cn("mt-1 truncate sig-fit-title text-[15px] font-semibold leading-[1.2]", darkSurface ? "text-white" : "text-slate-950")}
            title={name}
          >
            {shortName}
          </p>
          <p className={cn("mt-1 truncate sig-fit-copy text-[11px] font-medium", darkSurface ? "text-slate-200" : "text-slate-700")} title={roleTooltip}>
            {roleLabel}
          </p>
        </div>
      </div>

      {!compact && (statusLabel || onClick) ? (
        <div className={cn("mt-4 flex items-center justify-between gap-3 pt-3.5", darkSurface ? "border-t border-white/8" : "border-t border-slate-200")}>
          <p className={cn("truncate sig-fit-title text-[10px] font-semibold uppercase tracking-[0.14em]", darkSurface ? "text-white/60" : "text-slate-500")}>
            {statusLabel || ""}
          </p>
          {onClick ? <span className={cn("shrink-0 text-[11px] font-medium transition", darkSurface ? "text-sky-100/80 group-hover:text-white" : "text-slate-500 group-hover:text-slate-800")}>Perfil</span> : null}
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
          "group w-full text-left transition",
          compact ? "rounded-[16px] px-2.5 py-2.5" : "rounded-[22px] px-4 py-4",
          darkSurface
            ? "border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.05)_100%)] shadow-[0_16px_36px_rgba(2,6,23,0.18)] hover:border-white/16 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.11)_0%,rgba(255,255,255,0.07)_100%)]"
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
        darkSurface
          ? "rounded-[22px] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.08)_0%,rgba(255,255,255,0.05)_100%)] shadow-[0_16px_36px_rgba(2,6,23,0.18)]"
          : "rounded-[20px] border border-slate-200 bg-white/90",
        compact ? "rounded-[16px] px-2.5 py-2.5" : "px-4 py-4",
        className,
      )}
      title={compact ? name : undefined}
    >
      {content}
    </div>
  );
}
