import { UserAvatar } from "@/components/platform/UserAvatar";
import { cn } from "@/lib/utils";

type SidebarProfilePanelProps = {
  name: string;
  role: string;
  email?: string;
  statusLabel?: string;
  imageUrl?: string;
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
  onClick,
  className,
  darkSurface = true,
}: SidebarProfilePanelProps) {
  const content = (
    <>
      <div className="flex items-center gap-2.5">
        <UserAvatar
          name={name}
          imageUrl={imageUrl}
          size="sm"
          className="border-white/10 bg-white/[0.045]"
        />
        <div className="min-w-0 flex-1">
          <p className={cn("text-[10px] uppercase tracking-[0.14em]", darkSurface ? "text-white/65" : "text-slate-600")}>Conta</p>
          <p className={cn("mt-1 truncate text-sm font-semibold leading-tight", darkSurface ? "text-white" : "text-slate-950")} title={name}>
            {name}
          </p>
          <p className={cn("mt-0.5 truncate text-[11px] font-medium", darkSurface ? "text-white" : "text-slate-700")} title={role}>
            {role}
          </p>
          {email ? (
            <p className={cn("mt-0.5 truncate text-[11px]", darkSurface ? "text-white" : "text-slate-600")} title={email}>
              {email}
            </p>
          ) : null}
        </div>
      </div>

      {(statusLabel || onClick) ? (
        <div className={cn("mt-2 flex items-center justify-between gap-2 pt-2", darkSurface ? "border-t border-white/8" : "border-t border-slate-200")}>
          <p className={cn("truncate text-[10px] uppercase tracking-[0.1em]", darkSurface ? "text-white/65" : "text-slate-500")}>
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
        className={cn(
          "group w-full rounded-[14px] px-3 py-2.5 text-left transition",
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
    <div className={cn(darkSurface ? "rounded-[14px] border border-white/18 bg-white/[0.06] px-3 py-2.5" : "rounded-[14px] border border-slate-200 bg-white/90 px-3 py-2.5", className)}>
      {content}
    </div>
  );
}
