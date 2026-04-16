import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SigaproLogo } from "@/components/platform/SigaproLogo";

type AppLoadingStateProps = {
  title?: string;
  description?: string;
  municipalityName?: string | null;
  logoUrl?: string | null;
  variant?: "fullscreen" | "overlay";
};

export function AppLoadingState({
  title = "Carregando ambiente",
  description = "Preparando a experiencia institucional do SIGAPRO.",
  municipalityName,
  logoUrl,
  variant = "fullscreen",
}: AppLoadingStateProps) {
  if (variant === "overlay") {
    return (
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[80] flex justify-center px-4">
        <div className="flex w-full max-w-[460px] items-center gap-3 rounded-full border border-blue-900/15 bg-[linear-gradient(135deg,rgba(11,38,65,0.95),rgba(20,88,143,0.92))] px-4 py-3 text-white shadow-[0_16px_38px_rgba(8,25,47,0.22)] backdrop-blur-xl">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/12 ring-1 ring-white/10">
            {logoUrl ? (
              <img src={logoUrl} alt={municipalityName || "SIGAPRO"} className="h-7 w-7 rounded-lg object-contain" />
            ) : (
              <SigaproLogo bare compact showInternalWordmark={false} className="scale-[0.62]" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{title}</p>
            <p className="truncate text-xs text-blue-100/80">
              {municipalityName ? `${municipalityName} · ${description}` : description}
            </p>
          </div>
          <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-blue-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#f3f7fb_0%,#eef4fa_100%)] px-4 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.10),transparent_36%),radial-gradient(circle_at_top_right,rgba(15,23,42,0.05),transparent_28%)]" />
        <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:104px_104px]" />
      </div>

      <div className="relative w-full max-w-[420px] rounded-[32px] border border-white/80 bg-white/88 p-7 shadow-[0_24px_72px_rgba(15,23,42,0.12)] backdrop-blur">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#0b2641_0%,#14588f_100%)] text-white shadow-[0_18px_36px_rgba(8,25,47,0.18)]">
            {logoUrl ? (
              <img src={logoUrl} alt={municipalityName || "SIGAPRO"} className="h-9 w-9 rounded-xl object-contain" />
            ) : (
              <SigaproLogo bare compact showInternalWordmark={false} className="scale-[0.72]" />
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-[0.08em] text-slate-950">SIGAPRO</p>
            <p className="truncate text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
              {municipalityName || "Plataforma institucional"}
            </p>
          </div>
        </div>

        <div className="mt-7 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-800">
            <LoaderCircle className="h-4 w-4 animate-spin" />
          </span>
          <div>
            <p className="text-base font-semibold text-slate-950">{title}</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-full bg-slate-200/80">
          <div className={cn("h-1.5 rounded-full bg-[linear-gradient(90deg,#1d4ed8_0%,#38bdf8_100%)]", "animate-pulse")} />
        </div>
      </div>
    </div>
  );
}
