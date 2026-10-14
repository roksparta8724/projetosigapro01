import {
  Building2,
  ChevronRight,
  Mail,
  Network,
  Phone,
  ShieldCheck,
} from "lucide-react";
import type { MunicipalDepartmentRecord } from "@/integrations/backend/platform";
import { cn } from "@/lib/utils";

const STOP_WORDS = new Set(["de", "da", "do", "das", "dos", "e", "para", "por", "em", "na", "no"]);

const UNIT_LABELS: Record<string, string> = {
  secretaria: "Secretaria",
  diretoria: "Diretoria",
  departamento: "Departamento",
  setor: "Setor",
  coordenadoria: "Coordenadoria",
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function getUnitLabel(value: string) {
  const normalized = normalizeText(value);
  return UNIT_LABELS[normalized] || value || "Unidade";
}

function getRootTone(department: MunicipalDepartmentRecord) {
  const value = normalizeText(`${department.code} ${department.name}`);
  if (/administr|protocolo|expediente/.test(value)) {
    return {
      rail: "border-blue-300/80",
      badge: "border-blue-200 bg-blue-50 text-blue-800",
      icon: "border-blue-200 bg-blue-50 text-blue-700",
      glow: "from-blue-500/[0.09]",
    };
  }
  if (/urban|obra|analise|fiscal|engenh|licenc/.test(value)) {
    return {
      rail: "border-cyan-300/80",
      badge: "border-cyan-200 bg-cyan-50 text-cyan-800",
      icon: "border-cyan-200 bg-cyan-50 text-cyan-700",
      glow: "from-cyan-500/[0.09]",
    };
  }
  if (/financ|tribut|iptu|receita|tesour/.test(value)) {
    return {
      rail: "border-emerald-300/80",
      badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
      icon: "border-emerald-200 bg-emerald-50 text-emerald-700",
      glow: "from-emerald-500/[0.09]",
    };
  }
  return {
    rail: "border-slate-300/80",
    badge: "border-slate-200 bg-slate-50 text-slate-700",
    icon: "border-slate-200 bg-slate-50 text-slate-700",
    glow: "from-slate-500/[0.07]",
  };
}

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
  lineage = new Set<string>(),
  inheritedTone,
}: {
  department: MunicipalDepartmentRecord;
  allDepartments: MunicipalDepartmentRecord[];
  onEdit?: (department: MunicipalDepartmentRecord) => void;
  depth?: number;
  lineage?: Set<string>;
  inheritedTone?: ReturnType<typeof getRootTone>;
}) {
  const acronym = getDepartmentAcronym(department);
  const tone = inheritedTone || getRootTone(department);
  const children = allDepartments
    .filter((item) => item.parentDepartmentId === department.id)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR"));
  const isRoot = depth === 0;
  const hasCycle = lineage.has(department.id);
  const nextLineage = new Set(lineage);
  nextLineage.add(department.id);

  if (hasCycle) {
    return (
      <div className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        Vínculo circular detectado em <strong>{department.name}</strong>. Ajuste a unidade superior no cadastro do organograma.
      </div>
    );
  }

  return (
    <article
      className={cn(
        "min-w-0",
        isRoot
          ? "overflow-hidden rounded-[28px] border border-slate-200/90 bg-white shadow-[0_18px_42px_rgba(15,23,42,0.07)]"
          : "relative rounded-[20px] border border-slate-200/90 bg-white/95 p-4 shadow-[0_8px_20px_rgba(15,23,42,0.045)]",
      )}
    >
      {isRoot ? (
        <div className={cn("bg-gradient-to-br to-white via-white px-5 py-5 sm:px-6", tone.glow)}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border shadow-sm", tone.icon)}>
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]", tone.badge)}>
                    {acronym}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    {getUnitLabel(department.unitType)}
                  </span>
                </div>
                <h3 className="mt-2 text-xl font-semibold leading-tight tracking-[-0.025em] text-slate-950">
                  {department.name}
                </h3>
                {department.description ? (
                  <p className="mt-2 max-w-[54ch] text-sm leading-6 text-slate-600">
                    {department.description}
                  </p>
                ) : null}
              </div>
            </div>

            {onEdit ? (
              <button
                type="button"
                onClick={() => onEdit(department)}
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
              >
                Editar unidade
              </button>
            ) : null}
          </div>

          {(department.email || department.phone || children.length > 0) ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {children.length > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-600">
                  <Network className="h-3.5 w-3.5 text-sky-600" />
                  {children.length} unidade{children.length === 1 ? "" : "s"} subordinada{children.length === 1 ? "" : "s"}
                </span>
              ) : null}
              {department.email ? (
                <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs text-slate-600">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span className="truncate">{department.email}</span>
                </span>
              ) : null}
              {department.phone ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs text-slate-600">
                  <Phone className="h-3.5 w-3.5 text-slate-500" />
                  {department.phone}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border", tone.icon)}>
            {depth === 1 ? <Building2 className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em]", tone.badge)}>
                {acronym}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                {getUnitLabel(department.unitType)}
              </span>
            </div>
            <p className="mt-1.5 text-sm font-semibold leading-5 text-slate-950">{department.name}</p>
            {department.description ? (
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{department.description}</p>
            ) : null}
          </div>
          {onEdit ? (
            <button
              type="button"
              onClick={() => onEdit(department)}
              className="inline-flex h-8 shrink-0 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              Editar
            </button>
          ) : null}
        </div>
      )}

      {children.length > 0 ? (
        <div className={cn(isRoot ? "border-t border-slate-200/80 bg-slate-50/55 px-5 py-5 sm:px-6" : "mt-4")}>
          <div className={cn("relative space-y-3 border-l-2 pl-4", tone.rail)}>
            {children.map((child) => (
              <div key={child.id} className="relative">
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute -left-[17px] top-5 h-px w-4 border-t-2",
                    tone.rail,
                  )}
                />
                <UnitNode
                  department={child}
                  allDepartments={allDepartments}
                  onEdit={onEdit}
                  depth={depth + 1}
                  lineage={nextLineage}
                  inheritedTone={tone}
                />
              </div>
            ))}
          </div>
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
  const activeIds = new Set(active.map((item) => item.id));
  const roots = active.filter(
    (item) => !item.parentDepartmentId || !activeIds.has(item.parentDepartmentId),
  );
  const subordinateCount = Math.max(0, active.length - roots.length);

  if (active.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[18px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Estruturas principais</p>
          <p className="mt-1 text-xl font-semibold text-slate-950">{roots.length}</p>
        </div>
        <div className="rounded-[18px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Subunidades</p>
          <p className="mt-1 text-xl font-semibold text-slate-950">{subordinateCount}</p>
        </div>
        <div className="rounded-[18px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Unidades ativas</p>
          <p className="mt-1 text-xl font-semibold text-slate-950">{active.length}</p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-[20px] border border-sky-200/80 bg-sky-50/65 px-4 py-3.5 text-sm leading-6 text-slate-700">
        <Network className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
        <p>
          A hierarquia abaixo respeita a unidade superior cadastrada no banco. Departamentos e setores aparecem dentro da estrutura à qual realmente pertencem; nenhuma unidade subordinada é exibida como secretaria independente.
        </p>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-3">
        {roots.map((department) => (
          <UnitNode
            key={department.id}
            department={department}
            allDepartments={active}
            onEdit={onEdit}
          />
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
        O organograma exibe unidades institucionais e contatos oficiais; nomes de servidores continuam fora desta visão.
      </div>
    </div>
  );
}
