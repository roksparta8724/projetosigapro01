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
    <div className={cn("max-w-[720px]", align === "center" && "mx-auto text-center")}>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-800">{eyebrow}</p>
      <h2 className="mt-4 text-balance text-[2rem] font-semibold leading-[1.08] tracking-[-0.04em] text-slate-950 sm:text-[2.45rem]">
        {title}
      </h2>
      <p className="mt-4 max-w-[60ch] text-base leading-8 text-slate-600">{description}</p>
    </div>
  );
}
