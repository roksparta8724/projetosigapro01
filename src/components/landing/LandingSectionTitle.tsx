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
    <div className={cn("max-w-[980px]", align === "center" && "mx-auto text-center")}>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-800">{eyebrow}</p>
      <h2 className="mt-4 text-balance text-[2.12rem] font-semibold leading-[1.06] tracking-[-0.045em] text-slate-950 sm:text-[2.48rem] lg:text-[2.78rem]">
        {title}
      </h2>
      <p className="mt-4 max-w-[64ch] text-[1.03rem] leading-8 text-slate-600">{description}</p>
    </div>
  );
}
