import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Building2, CornerDownRight } from "lucide-react";

type OrgUnit = { id: string; name: string; unitType: string; parentDepartmentId?: string | null };
type OrgUser = { department?: string | null };

export function MasterOrganogramPanel({ title, description, icon: Icon, actions, children }: {
  title: string; description?: string; icon: LucideIcon; actions?: ReactNode; children: ReactNode;
}) {
  return <section data-organogram-panel="true" aria-label={title}>
    <header data-organogram-panel-header="true">
      <div data-organogram-heading="true">
        <span data-organogram-icon="true"><Icon size={18} aria-hidden="true" /></span>
        <div data-organogram-heading-copy="true">
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </div>
      {actions && <div data-organogram-actions="true">{actions}</div>}
    </header>
    <div data-organogram-panel-body="true">{children}</div>
  </section>;
}

export function MasterOrganogramDirectory({ units, users }: { units: readonly OrgUnit[]; users: readonly OrgUser[] }) {
  const byParent = new Map<string, OrgUnit[]>();
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  const ids = new Set(units.map(unit => unit.id));
  for (const user of users) if (user.department) counts.set(user.department, (counts.get(user.department) || 0) + 1);
  for (const unit of units) {
    const parent = unit.parentDepartmentId || "";
    const group = byParent.get(parent) || [];
    group.push(unit);
    byParent.set(parent, group);
  }
  const rows: { unit: OrgUnit; depth: number; detached: boolean }[] = [];
  function append(unit: OrgUnit, depth: number, detached = false) {
    if (seen.has(unit.id)) return;
    seen.add(unit.id);
    rows.push({unit,depth,detached});
    for (const child of byParent.get(unit.id) || []) append(child, depth + 1, detached);
  }
  for (const unit of byParent.get("") || []) append(unit, 0);
  for (const unit of units) if (unit.parentDepartmentId && !ids.has(unit.parentDepartmentId)) append(unit, 0, true);
  for (const unit of units) if (!seen.has(unit.id)) append(unit, 0, true);
  return <div data-organogram-directory="true">
    <p data-organogram-summary="true">{units.length} unidade(s) · {users.length} usuário(s) na Prefeitura</p>
    <ul aria-label="Unidades administrativas">
      {rows.map(({unit,depth,detached}) => <li key={unit.id} data-organogram-unit="true" data-depth={depth} style={{paddingInlineStart: 12 + Math.min(depth,4)*12}}>
        <span data-organogram-unit-icon="true">{depth ? <CornerDownRight size={15} aria-hidden="true"/> : <Building2 size={16} aria-hidden="true"/>}</span>
        <div data-organogram-unit-copy="true">
          <strong>{unit.name}</strong>
          <span>{unit.unitType}{detached ? " · vínculo a revisar" : ""}</span>
        </div>
        <span data-organogram-unit-count="true">{counts.get(unit.name) || 0} lotado(s)</span>
      </li>)}
    </ul>
  </div>;
}
