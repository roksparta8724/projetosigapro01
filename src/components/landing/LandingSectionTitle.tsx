import { cn } from "@/lib/utils";

type LandingSectionTitleProps = {
  eyebrow: string;
  title: string;
  description: string;
  align?: "left" | "center";
};

export function LandingSectionTitle({
  eyebrow,
  title,
  description,
  align = "left",
}: LandingSectionTitleProps) {
  return (
    <div className={cn("max-w-[900px]", align === "center" && "mx-auto text-center")}>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-800">{eyebrow}</p>
      <h2 className="mt-3 text-balance text-[1.96rem] font-semibold leading-[1.04] tracking-[-0.045em] text-slate-950 sm:text-[2.28rem] lg:text-[2.58rem]">
        {title}
      </h2>
      <p
        className={cn(
          "mt-3 max-w-[60ch] text-[0.98rem] leading-7 text-slate-600",
          align === "center" && "mx-auto",
        )}
      >
        {description}
      </p>
    </div>
  );
}
