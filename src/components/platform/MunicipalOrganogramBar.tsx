import { ChevronRight, Network } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useMunicipalOrganogram } from "@/hooks/useMunicipalOrganogram";

function normalizeHint(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function fallbackHierarchy(hint: string | null | undefined) {
  const normalized = normalizeHint(hint);
  if (!normalized) return [] as Array<{ code: string; name: string }>;

  if (/iptu|cadastro imobiliario/.test(normalized)) {
    return [
      { code: "FIN", name: "Financeiro" },
      { code: "TRIB", name: "Tributos" },
      { code: "IPTU", name: "Cadastro Imobiliário / IPTU" },
    ];
  }
  if (/tribut/.test(normalized)) {
    return [
      { code: "FIN", name: "Financeiro" },
      { code: "TRIB", name: "Tributos" },
    ];
  }
  if (/fisc/.test(normalized)) {
    return [
      { code: "URB", name: "Urbanismo e Obras" },
      { code: "FISC", name: "Fiscalização" },
    ];
  }
  if (/urban|analise|obra|engenharia/.test(normalized)) {
    return [
      { code: "URB", name: "Urbanismo e Obras" },
      { code: "ANU", name: "Análise Urbanística" },
    ];
  }
  if (/protocol|triagem|recep/.test(normalized)) {
    return [
      { code: "ADM", name: "Administração" },
      { code: "PROT", name: "Protocolo" },
    ];
  }
  if (/financ|tesour|arrecad/.test(normalized)) {
    return [{ code: "FIN", name: "Financeiro" }];
  }
  return [] as Array<{ code: string; name: string }>;
}

type MunicipalOrganogramBarProps = {
  municipalityId: string | null | undefined;
  departmentHint?: string | null;
  title?: string;
  description?: string;
  className?: string;
  compact?: boolean;
  showLink?: boolean;
};

export function MunicipalOrganogramBar({
  municipalityId,
  departmentHint,
  title = "Organograma municipal",
  description = "Estrutura oficial da Prefeitura usada para identificar a unidade e orientar os despachos.",
  className,
  compact = false,
  showLink = true,
}: MunicipalOrganogramBarProps) {
  const { departments, status, getPathRecords } = useMunicipalOrganogram(municipalityId);
  const chain = getPathRecords(departmentHint);
  const fallbackChain = fallbackHierarchy(departmentHint);
  const fallbackLabel = String(departmentHint || "").trim();

  if (!municipalityId) return null;

  return (
    <section
      data-municipal-organogram="true"
      className={cn(
        "sig-organogram-card overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_10px_28px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_14px_34px_rgba(0,0,0,0.24)]",
        className,
      )}
    >
      <div className={cn("sig-organogram-card-header flex flex-col gap-3 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-4 py-3 dark:bg-[linear-gradient(180deg,#132338_0%,#0d1b2b_100%)] sm:flex-row sm:items-center sm:justify-between", !compact && "md:px-5 md:py-4")}>
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700 shadow-sm dark:border-sky-500/30 dark:bg-sky-950/60 dark:text-sky-200">
            <Network className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-600 dark:text-slate-200">
              {title}
            </p>
            {!compact ? (
              <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">{description}</p>
            ) : null}
          </div>
        </div>

        {showLink ? (
          <Link
            to="/prefeitura/organograma"
            className="inline-flex h-9 shrink-0 items-center rounded-full border border-slate-200 bg-white px-3.5 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-sky-500/50 dark:hover:bg-sky-950/60 dark:hover:text-sky-100"
          >
            Ver organograma completo
          </Link>
        ) : null}
      </div>

      <div className="sig-organogram-card-body border-t border-slate-100 bg-[linear-gradient(180deg,#fbfdff_0%,#f5f9fd_100%)] px-4 py-3 dark:border-slate-700 dark:bg-[linear-gradient(180deg,#0d1b2b_0%,#0a1624_100%)] md:px-5">
        {chain.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {chain.map((department, index) => (
              <div key={department.id} className="flex min-w-0 items-center gap-2">
                {index > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" /> : null}
                <span
                  data-organogram-unit-chip="true"
                  data-contrast-surface="dark"
                  className={cn(
                    "inline-flex max-w-full items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-bold !text-white shadow-[0_6px_16px_rgba(2,6,23,0.18)] transition",
                    index === chain.length - 1
                      ? "border-sky-400/40 bg-[linear-gradient(135deg,#0b4f7a_0%,#075985_100%)]"
                      : "border-slate-700 bg-[linear-gradient(135deg,#0f172a_0%,#111827_100%)]",
                  )}
                  title={department.name}
                >
                  {department.code?.trim() ? (
                    <span
                      data-organogram-code="true"
                      data-contrast-surface="dark"
                      className="sig-dark-chip inline-flex min-w-[30px] items-center justify-center rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5 text-[9px] font-extrabold tracking-[0.08em] !text-white shadow-sm"
                    >
                      {department.code.trim()}
                    </span>
                  ) : null}
                  <span className="truncate !text-white">{department.name}</span>
                </span>
              </div>
            ))}
          </div>
        ) : fallbackChain.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {fallbackChain.map((department, index) => (
              <div key={`${department.code}-${department.name}`} className="flex min-w-0 items-center gap-2">
                {index > 0 ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" /> : null}
                <span
                  data-organogram-unit-chip="true"
                  data-contrast-surface="dark"
                  className={cn(
                    "inline-flex max-w-full items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-bold !text-white shadow-[0_6px_16px_rgba(2,6,23,0.18)] transition",
                    index === fallbackChain.length - 1
                      ? "border-sky-400/40 bg-[linear-gradient(135deg,#0b4f7a_0%,#075985_100%)]"
                      : "border-slate-700 bg-[linear-gradient(135deg,#0f172a_0%,#111827_100%)]",
                  )}
                >
                  <span
                      data-organogram-code="true"
                      data-contrast-surface="dark"
                      className="sig-dark-chip inline-flex min-w-[30px] items-center justify-center rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5 text-[9px] font-extrabold tracking-[0.08em] !text-white shadow-sm"
                    >
                    {department.code}
                  </span>
                  <span className="truncate !text-white">{department.name}</span>
                </span>
              </div>
            ))}
          </div>
        ) : fallbackLabel ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700">
              {fallbackLabel}
            </span>
          </div>
        ) : departments.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {departments
              .filter((department) => !department.parentDepartmentId)
              .slice(0, 6)
              .map((department) => (
                <span
                  key={department.id}
                  data-organogram-unit-chip="true"
                  data-contrast-surface="dark"
                  className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-[linear-gradient(135deg,#0f172a_0%,#111827_100%)] px-3.5 py-2 text-[11px] font-bold !text-white shadow-[0_6px_16px_rgba(2,6,23,0.18)]"
                >
                  {department.code?.trim() ? (
                    <span
                      data-organogram-code="true"
                      data-contrast-surface="dark"
                      className="sig-dark-chip inline-flex min-w-[30px] items-center justify-center rounded-md border border-white/15 bg-white/10 px-1.5 py-0.5 text-[9px] font-extrabold tracking-[0.08em] !text-white shadow-sm"
                    >
                      {department.code.trim()}
                    </span>
                  ) : null}
                  {department.name}
                </span>
              ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500">
            {status || "Organograma municipal não disponível neste momento."}
          </p>
        )}
      </div>
    </section>
  );
}
