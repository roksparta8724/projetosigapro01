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

function UnitCard({
  department,
  children,
  onEdit,
}: {
  department: MunicipalDepartmentRecord;
  children: MunicipalDepartmentRecord[];
  onEdit?: (department: MunicipalDepartmentRecord) => void;
}) {
  const acronym = getDepartmentAcronym(department);
  return (
    <article className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-slate-200 bg-slate-50 text-sky-700">
          <Building2 className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{department.unitType}</p>
          <p className="mt-1 text-2xl font-bold tracking-[-0.03em] text-slate-950" title={department.name}>{acronym}</p>
        </div>
      </div>

      {onEdit ? (
        <button
          type="button"
          onClick={() => onEdit(department)}
          className="mt-4 inline-flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Editar unidade
        </button>
      ) : null}

      {children.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {children.map((child) => (
            <div
              key={child.id}
              title={child.name}
              className="inline-flex min-h-10 items-center rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2"
            >
              <span className="text-sm font-semibold tracking-[0.04em] text-slate-900">{getDepartmentAcronym(child)}</span>
              {onEdit ? (
                <button
                  type="button"
                  onClick={() => onEdit(child)}
                  className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Editar
                </button>
              ) : null}
            </div>
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
          <UnitCard
            key={department.id}
            department={department}
            children={active.filter((item) => item.parentDepartmentId === department.id)}
            onEdit={onEdit}
          />
        ))}
      </div>
    </div>
  );
}
