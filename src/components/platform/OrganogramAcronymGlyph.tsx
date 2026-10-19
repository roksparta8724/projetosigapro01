import { cn } from "@/lib/utils";

type OrganogramAcronymGlyphProps = {
  code: string;
  className?: string;
};

export function OrganogramAcronymGlyph({
  code,
  className,
}: OrganogramAcronymGlyphProps) {
  const label = String(code || "UNID").trim().toLocaleUpperCase("pt-BR") || "UNID";

  return (
    <svg
      data-organogram-code-glyph="true"
      viewBox="0 0 48 20"
      role="img"
      aria-label={label}
      className={cn("block h-5 w-12 shrink-0 overflow-visible", className)}
      focusable="false"
    >
      <text
        x="24"
        y="13.6"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#ffffff"
        style={{
          fill: "#ffffff",
          color: "#ffffff",
          WebkitTextFillColor: "#ffffff",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          fontSize: "8.7px",
          fontWeight: 900,
          letterSpacing: "0.45px",
          paintOrder: "stroke",
          stroke: "rgba(0,0,0,0.16)",
          strokeWidth: "0.35px",
        }}
      >
        {label}
      </text>
    </svg>
  );
}
