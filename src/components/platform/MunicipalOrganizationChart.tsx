import { Building2, Network } from "lucide-react";
import type { MunicipalDepartmentRecord } from "@/integrations/backend/platform";
import { cn } from "@/lib/utils";

const STOP_WORDS = new Set(["de", "da", "do", "das", "dos", "e", "para", "por", "em", "na", "no"]);

const UNIT_IDENTITY: Record<
  string,
  { short: string; label: string; tone: string; iconTone: string }
> = {
  secretaria: {
    short: "SEC",
    label: "Secretaria",
    tone: "border-indigo-200 bg-indigo-50 text-indigo-800",
    iconTone: "border-indigo-200 bg-indigo-100 text-indigo-700",
  },
  diretoria: {
    short: "DIR",
    label: "Diretoria",
    tone: "border-sky-200 bg-sky-50 text-sky-800",
    iconTone: "border-sky-200 bg-sky-100 text-sky-700",
  },
  departamento: {
    short: "DEP",
    label: "Departamento",
    tone: "border-cyan-200 bg-cyan-50 text-cyan-800",
    iconTone: "border-cyan-200 bg-cyan-100 text-cyan-700",
  },
  coordenadoria: {
    short: "COORD",
    label: "Coordenadoria",
    tone: "border-violet-200 bg-violet-50 text-violet-800",
    iconTone: "border-violet-200 bg-violet-100 text-violet-700",
  },
  setor: {
    short: "SET",
    label: "Setor",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
    iconTone: "border-emerald-200 bg-emerald-100 text-emerald-700",
  },
  divisao: {
    short: "DIV",
    label: "Divisão",
    tone: "border-amber-200 bg-amber-50 text-amber-800",
    iconTone: "border-amber-200 bg-amber-100 text-amber-700",
  },
  unidade: {
    short: "UNI",
    label: "Unidade",
    tone: "border-slate-200 bg-slate-50 text-slate-700",
    iconTone: "border-slate-200 bg-slate-100 text-slate-700",
  },
};

export function getDepartmentAcronym(
  input: Pick<MunicipalDepartmentRecord, "code" | "name">,
) {
  const explicit = input.code?.trim().toUpperCase();
  if (explicit) return explicit.slice(0, 8);

  const words = input.name
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-zÀ-ÿ0-9]/g, ""))
    .filter(Boolean)
    .filter((word) => !STOP_WORDS.has(word.toLocaleLowerCase("pt-BR")));

  const initials = words.map((word) => word[0]).join("").toUpperCase();
  if (initials.length >= 2) return initials.slice(0, 8);

  return (
    input.name.replace(/[^A-Za-zÀ-ÿ0-9]/g, "").toUpperCase().slice(0, 8) || "UN"
  );
}

export function getInstitutionalUnitIdentity(unitType?: string | null) {
  return UNIT_IDENTITY[(unitType || "").trim().toLocaleLowerCase("pt-BR")] ?? {
    short: "UNI",
    label: "Unidade",
    tone: "border-slate-200 bg-slate-50 text-slate-700",
    iconTone: "border-slate-200 bg-slate-100 text-slate-700",
  };
}

function UnitNode({
  department,
  allDepartments,
  onEdit,
  depth = 0,
}: {
  department: MunicipalDepartmentRecord;
  allDepartments: MunicipalDepartmentRecord[];
  onEdit?: (department: MunicipalDepartmentRecord) => void;
  depth?: number;
}) {
  const acronym = getDepartmentAcronym(department);
  const identity = getInstitutionalUnitIdentity(department.unitType);
  const children = allDepartments.filter(
    (item) => item.parentDepartmentId === department.id,
  );
  const isRoot = depth === 0;

  return (
    <article
      data-organogram-node="true"
      data-organogram-root={isRoot ? "true" : "false"}
      data-unit-type={(department.unitType || "unidade").toLocaleLowerCase("pt-BR")}
      className={cn(
        "relative overflow-hidden border transition-shadow",
        isRoot
          ? "rounded-[26px] border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbfe_100%)] shadow-[0_14px_34px_rgba(15,23,42,0.07)] dark:border-slate-700 dark:bg-[linear-gradient(180deg,#12283a_0%,#0b1927_100%)]"
          : "rounded-[18px] border-slate-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.04)] dark:border-slate-700 dark:bg-slate-900/80",
      )}
    >
      <div
        className={cn(
          "absolute inset-y-0 left-0",
          isRoot ? "w-1.5 bg-[linear-gradient(180deg,#0b5f8a_0%,#14b8a6_100%)]" : "w-1 bg-slate-300 dark:bg-slate-600",
        )}
        aria-hidden="true"
      />

      <div className={cn(isRoot ? "p-5 pl-6" : "p-3.5 pl-5")}>
        <div className="flex items-start gap-3">
          <div
            data-organogram-icon="true"
            className={cn(
              "flex shrink-0 items-center justify-center border",
              identity.iconTone,
              isRoot
                ? "h-11 w-11 rounded-[14px]"
                : "h-9 w-9 rounded-xl",
            )}
          >
            <Building2 className={isRoot ? "h-[18px] w-[18px]" : "h-4 w-4"} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                data-organogram-level-badge="true"
                className={cn(
                  "inline-flex min-w-11 items-center justify-center rounded-lg border px-2 py-1 text-[10px] font-black tracking-[0.12em]",
                  identity.tone,
                )}
                title={identity.label}
              >
                {identity.short}
              </span>
              <span
                data-organogram-level-label="true"
                className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-300"
              >
                {identity.label}
              </span>
            </div>

            <p
              data-organogram-acronym="true"
              className={cn(
                "mt-2 font-black tracking-[-0.02em] text-slate-950 dark:text-white",
                isRoot ? "text-[22px] leading-7" : "text-[16px] leading-6",
              )}
              title={department.name}
            >
              {acronym}
            </p>
            <p
              data-organogram-name="true"
              className={cn(
                "mt-0.5 truncate text-slate-500 dark:text-slate-300",
                isRoot ? "text-xs" : "text-[11px]",
              )}
              title={department.name}
            >
              {department.name}
            </p>
          </div>

          {onEdit ? (
            <button
              type="button"
              data-organogram-edit="true"
              onClick={() => onEdit(department)}
              className="inline-flex h-9 shrink-0 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-sky-500 dark:hover:bg-slate-700"
            >
              Editar
            </button>
          ) : null}
        </div>

        {children.length > 0 ? (
          <div
            data-organogram-children="true"
            className={cn(
              "mt-4 space-y-2.5 border-l",
              isRoot ? "ml-5 border-sky-200 pl-4 dark:border-sky-800" : "ml-4 border-slate-200 pl-3 dark:border-slate-700",
            )}
          >
            {children.map((child) => (
              <UnitNode
                key={child.id}
                department={child}
                allDepartments={allDepartments}
                onEdit={onEdit}
                depth={depth + 1}
              />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function MunicipalOrganizationChart({
  departments,
  emptyMessage = "Nenhuma unidade cadastrada no organograma municipal.",
  onEdit,
}: {
  departments: MunicipalDepartmentRecord[];
  emptyMessage?: string;
  onEdit?: (department: MunicipalDepartmentRecord) => void;
}) {
  const active = departments
    .filter((item) => item.isActive)
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR"),
    );
  const roots = active.filter((item) => !item.parentDepartmentId);

  if (active.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div data-municipal-organogram="true">
      <div
        data-organogram-toolbar="true"
        className="mb-4 flex flex-col gap-3 rounded-[20px] border border-slate-200 bg-[linear-gradient(180deg,#fbfdff_0%,#f3f8fc_100%)] p-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)] sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:bg-[linear-gradient(180deg,#10263a_0%,#0b1927_100%)]"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
          <Network className="h-4 w-4 text-sky-700" />
          <span>
            Hierarquia institucional por siglas, níveis e unidades oficiais da Prefeitura.
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["secretaria", "diretoria", "departamento", "setor"].map((type) => {
            const identity = getInstitutionalUnitIdentity(type);
            return (
              <span
                key={type}
                data-organogram-legend="true"
                data-unit-type={type}
                className={cn(
                  "rounded-lg border px-2 py-1 text-[9px] font-black tracking-[0.1em]",
                  identity.tone,
                )}
                title={identity.label}
              >
                {identity.short}
              </span>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {roots.map((department) => (
          <UnitNode
            key={department.id}
            department={department}
            allDepartments={active}
            onEdit={onEdit}
          />
        ))}
      </div>
    </div>
  );
}
