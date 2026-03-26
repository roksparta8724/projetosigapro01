import { cn } from "@/lib/utils";

export function SigaproLogo({
  className,
  centered = false,
  compact = false,
  bare = false,
  showInternalWordmark = true,
}: {
  className?: string;
  centered?: boolean;
  compact?: boolean;
  bare?: boolean;
  showInternalWordmark?: boolean;
}) {
  const iconSize = bare ? (compact ? "h-[42px] w-[42px]" : "h-[84px] w-[84px]") : compact ? "h-[56px] w-[56px]" : "h-[126px] w-[126px]";

  return (
    <div className={cn("flex items-center gap-3", centered && "flex-col justify-center text-center", className)}>
      <div
        className={cn(
          "flex shrink-0 items-center justify-center",
          bare
            ? compact
              ? "h-[40px] w-[40px]"
              : "h-[104px] w-[104px]"
            : compact
              ? "h-[64px] w-[64px] rounded-[18px] bg-white p-1.5 shadow-[0_18px_34px_rgba(7,18,31,0.16)]"
              : "h-[138px] w-[138px] rounded-[34px] bg-white p-2.5 shadow-[0_18px_34px_rgba(7,18,31,0.16)]",
        )}
      >
        <svg viewBox="0 0 144 144" className={cn("shrink-0", iconSize)} aria-hidden="true">
          <defs>
            <linearGradient id="sigaproGreenMain" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2b9c6b" />
              <stop offset="100%" stopColor="#145b3f" />
            </linearGradient>
            <linearGradient id="sigaproGreenDark" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#186b4b" />
              <stop offset="100%" stopColor="#104734" />
            </linearGradient>
            <linearGradient id="sigaproAccentWarm" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff8f5b" />
              <stop offset="100%" stopColor="#ffd166" />
            </linearGradient>
          </defs>

          <path d="M20 114V60l16-11v65z" fill="url(#sigaproGreenMain)" />
          <path d="M41 114V40l20-14v88z" fill="#1c7d57" />
          <path d="M66 114V19l24 14v81z" fill="url(#sigaproGreenMain)" />
          <path d="M96 114V51l18 11v52z" fill="url(#sigaproGreenDark)" />
          <path d="M87 37h17l9 10v15" fill="none" stroke="url(#sigaproAccentWarm)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="29" y="68" width="64" height="36" rx="8" fill="#ffffff" />
          <path d="M36 76h50M36 85h50M36 94h50M50 68v36M68 68v36" stroke="#6b7f92" strokeWidth="3" strokeLinecap="round" />
          <path d="M22 119h96" stroke="#15503b" strokeWidth="8" strokeLinecap="round" />
          {showInternalWordmark ? (
            <text x="72" y="139" textAnchor="middle" fill="#15503b" fontSize="18" fontWeight="900" letterSpacing="0.1em">
              SIGAPRO
            </text>
          ) : null}
        </svg>
      </div>

      {!centered && !bare ? (
        <div className="space-y-1">
          <div className={cn("font-semibold uppercase tracking-[0.08em] text-current", compact ? "text-[13px]" : "text-[18px]")}>SIGAPRO</div>
          <div className={cn("font-medium uppercase tracking-[0.14em] text-[#d2dfeb]", compact ? "max-w-[170px] text-[8px]" : "max-w-[260px] text-[10px]")}>
            Sistema Integrado de Gestão e Aprovação de Projetos
          </div>
        </div>
      ) : null}
    </div>
  );
}
