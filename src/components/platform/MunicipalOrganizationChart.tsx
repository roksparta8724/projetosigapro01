import { Building2, Network } from "lucide-react";
import type { MunicipalDepartmentRecord } from "@/integrations/backend/platform";

const STOP_WORDS = new Set(["de","da","do","das","dos","e","para","por","em","na","no"]);

export function getDepartmentAcronym(input: Pick<MunicipalDepartmentRecord, "code" | "name">) {
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

  return input.name.replace(/[^A-Za-zÀ-ÿ0-9]/g, "").toUpperCase().slice(0, 8) || "UN";
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
  const children = allDepartments.filter((item) => item.parentDepartmentId === department.id);

  return (
    <article className={depth === 0 ? "rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm" : "rounded-2xl border border-slate-200 bg-slate-50 p-3"}>
      <div className="flex items-center gap-3">
        <div className={depth === 0 ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-slate-200 bg-slate-50 text-sky-700" : "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-sky-700"}>
          <Building2 className={depth === 0 ? "h-4.5 w-4.5" : "h-4 w-4"} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{department.unitType}</p>
          <p className={depth === 0 ? "mt-1 text-2xl font-bold tracking-[-0.03em] text-slate-950" : "mt-1 text-base font-bold tracking-[0.02em] text-slate-900"} title={department.name}>{acronym}</p>
        </div>
        {onEdit ? (
          <button
            type="button"
            onClick={() => onEdit(department)}
            className="inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Editar
          </button>
        ) : null}
      </div>

      {children.length > 0 ? (
        <div className="mt-3 space-y-2 border-l-2 border-slate-200 pl-3">
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
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR"));
  const roots = active.filter((item) => !item.parentDepartmentId);

  if (active.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 text-sm text-slate-600">
        <Network className="h-4 w-4 text-sky-700" />
        <span>Estrutura institucional por siglas. O organograma não exibe nomes de servidores ou usuários.</span>
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
