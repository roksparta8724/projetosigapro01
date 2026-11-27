import { useMemo, useState } from "react";
import { Building2, Network, Plus, Pencil, ChevronDown, ChevronRight, Search, X, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import "./municipal-organization-hierarchy.css";
import { buildOrganizationRows, filterOrganizationRows } from "@/lib/municipalOrganizationTree";
import { isAdjunctUnit } from "@/lib/municipalUnitCodes";
import type { MunicipalDepartmentRecord } from "@/integrations/backend/platform";

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

export function MunicipalOrganizationChart({
  departments,
  emptyMessage = "Nenhuma unidade cadastrada no organograma municipal.",
  onEdit,
  onAddChild,
  members = [],
  expandRoots = false,
}: {
  departments: MunicipalDepartmentRecord[];
  emptyMessage?: string;
  onEdit?: (department: MunicipalDepartmentRecord) => void;
  onAddChild?: (parentId:string)=>void;
  members?: readonly {id:string;name:string;department:string}[];
  expandRoots?: boolean;
}) {
  const active = useMemo(()=>departments.filter(item=>item.isActive).sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name,"pt-BR")),[departments]);
  const rows = useMemo(()=>buildOrganizationRows(active),[active]);
  const [query,setQuery]=useState("");
  const [expanded,setExpanded]=useState<Set<string>>(()=>new Set());
  const [defaultRoots,setDefaultRoots]=useState(expandRoots);
  const effectiveExpanded=useMemo(()=>defaultRoots?new Set([...expanded,...rows.filter(r=>r.depth===0).map(r=>r.unit.id)]):expanded,[rows,expanded,defaultRoots]);
  const visible=useMemo(()=>filterOrganizationRows(rows,query,effectiveExpanded),[rows,query,effectiveExpanded]);
  const searching=Boolean(query.trim());
  const staffByDepartment=useMemo(()=>{const map=new Map<string,typeof members[number][]>();for(const member of members){const group=map.get(member.department)||[];group.push(member);map.set(member.department,group);}return map;},[members]);
  const branches=rows.filter(r=>r.childCount>0||(staffByDepartment.get(r.unit.name)||[]).length>0);
  const toggle=(id:string)=>{setDefaultRoots(false);setExpanded(()=>{const next=new Set(effectiveExpanded);if(next.has(id))next.delete(id);else next.add(id);return next;});};
  if (active.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div data-municipal-organogram="true" data-premium-organogram="true">
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
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          {([{tone:"root",label:"Unidade principal"},{tone:"child",label:"Subunidade"},{tone:"nested",label:"Nível adicional"}] as const).map(item=><span key={item.tone} className="flex items-center gap-1.5"><span aria-hidden="true" data-org-hierarchy-tone={item.tone} className="sig-org-hierarchy-swatch"/>{item.label}</span>)}
        </div>
      </div>

      <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-[1_1_220px]">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"/>
          <Input aria-label="Pesquisar unidades do organograma" placeholder="Pesquisar por nome ou sigla" className="h-10 pl-9 pr-10" value={query} onChange={e=>setQuery(e.target.value)}/>
          {query&&<button type="button" aria-label="Limpar pesquisa" onClick={()=>setQuery("")} className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground hover:bg-muted"><X size={16}/></button>}
        </div>
        <Button type="button" variant="outline" size="sm" disabled={searching||branches.length===0} onClick={()=>{setDefaultRoots(false);setExpanded(new Set(branches.map(r=>r.unit.id)));}}>Expandir tudo</Button>
        <Button type="button" variant="outline" size="sm" disabled={searching||branches.length===0} onClick={()=>{setDefaultRoots(false);setExpanded(new Set());}}>Recolher tudo</Button>
      </div>
      <p className="mb-3 text-xs text-muted-foreground" role="status">{active.length} {active.length===1?"unidade":"unidades"} · {visible.length} {visible.length===1?"visível":"visíveis"}{searching?" · Pesquisa inclui a hierarquia superior":""}</p>
      {visible.length===0&&<p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhuma unidade encontrada.</p>}
      <ul aria-label="Hierarquia das unidades administrativas" data-organogram-responsive-grid="true" className="min-w-0 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
        {visible.map(({unit:department,depth,childCount,detached})=>{
          const acronym=getDepartmentAcronym(department);
          const baseIdentity=getInstitutionalUnitIdentity(department.unitType);
          const adjunct=isAdjunctUnit(department.name)&&["secretaria","diretoria"].includes(department.unitType);
          const identity=adjunct?{...baseIdentity,short:department.unitType==="secretaria"?"SAD":"DAD",label:baseIdentity.label+" adjunta"}:baseIdentity;
          const open=searching||effectiveExpanded.has(department.id);
          const staff=staffByDepartment.get(department.name)||[];
          const expandable=childCount>0||staff.length>0;
          const hierarchyTone=depth===0?"root":depth===1?"child":"nested";
          return <li key={department.id} data-organogram-node="true" data-organogram-root={depth===0?"true":"false"} data-unit-type={department.unitType||"unidade"} data-unit-adjunct={adjunct?"true":"false"} data-depth={depth} data-org-hierarchy-row={hierarchyTone} className="min-w-0 bg-card text-card-foreground">
            <div data-organogram-unit-header="true" className="flex min-w-0 items-center gap-2 py-2 pr-2 hover:bg-muted/50" style={{paddingInlineStart:8+Math.min(depth,5)*16}}>
              {expandable?<button type="button" aria-expanded={open} aria-label={(open?"Recolher ":"Expandir ")+department.name} disabled={searching} onClick={()=>toggle(department.id)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{open?<ChevronDown size={17}/>:<ChevronRight size={17}/>}</button>:<span className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground" aria-hidden="true"><Building2 size={16}/></span>}
              <div data-organogram-unit-copy="true" className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span data-organogram-level-badge="true" data-org-hierarchy-tone={hierarchyTone} className="sig-org-hierarchy-code inline-flex shrink-0 items-center rounded-md px-2 py-1 text-xs font-bold" title={identity.label}><strong>{acronym}</strong></span>
                  <span data-organogram-name="true" className={"min-w-0 break-words text-sm text-foreground [overflow-wrap:anywhere] "+(depth===0?"font-bold":"font-medium")}>{department.name}</span>
                </div>
                <div data-organogram-level-label="true" className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground"><span>{identity.label}</span>{childCount>0&&<span>· {childCount} {childCount===1?"subunidade":"subunidades"}</span>}{staff.length>0&&<span>· {staff.length} {staff.length===1?"servidor":"servidores"}</span>}{detached&&<span className="font-semibold text-amber-700 dark:text-amber-300">· Vínculo a revisar</span>}</div>
              </div>
              {(onAddChild||onEdit)&&<div data-organogram-unit-actions="true" className="flex shrink-0 items-center gap-1">
                {onAddChild&&<button type="button" aria-label={"Adicionar unidade em "+department.name} title="Adicionar unidade subordinada" onClick={()=>onAddChild(department.id)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Plus size={16}/></button>}
                {onEdit&&<button type="button" data-organogram-edit="true" aria-label={"Editar "+department.name} title="Editar unidade" onClick={()=>onEdit(department)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-background text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Pencil size={15}/></button>}
              </div>}
            </div>
            {staff.length>0&&open&&<ul aria-label={"Equipe de "+department.name} className="mb-2 space-y-1 pr-2" style={{paddingInlineStart:48+Math.min(depth,5)*12}}>{staff.map(member=><li key={member.id} className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><Users size={13} className="shrink-0"/><span className="break-words [overflow-wrap:anywhere]">{member.name}</span></li>)}</ul>}
          </li>;
        })}
      </ul>
    </div>
  );
}
