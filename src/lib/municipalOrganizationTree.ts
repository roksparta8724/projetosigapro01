export type OrganizationUnit={id:string;name:string;code?:string;parentDepartmentId?:string|null;unitType?:string};
export type OrganizationRow<T extends OrganizationUnit>={unit:T;depth:number;childCount:number;parentId:string|null;detached:boolean};
export function buildOrganizationRows<T extends OrganizationUnit>(units:readonly T[]):OrganizationRow<T>[]{
 const unique=new Map(units.map(unit=>[unit.id,unit]));
 const byParent=new Map<string,T[]>();
 const roots:T[]=[];const detachedRoots:T[]=[];
 for(const unit of unique.values()){
  const parent=unit.parentDepartmentId;
  if(!parent){roots.push(unit);continue;}
  if(!unique.has(parent)||parent===unit.id){detachedRoots.push(unit);continue;}
  const children=byParent.get(parent)||[];children.push(unit);byParent.set(parent,children);
 }
 const rows:OrganizationRow<T>[]=[];const seen=new Set<string>();
 function append(root:T,detached:boolean){
  const stack=[{unit:root,depth:0,parentId:null as string|null}];
  while(stack.length){
   const next=stack.pop()!;if(seen.has(next.unit.id))continue;seen.add(next.unit.id);
   const children=(byParent.get(next.unit.id)||[]).filter(child=>!seen.has(child.id));
   rows.push({...next,childCount:children.length,detached});
   for(let i=children.length-1;i>=0;i--)stack.push({unit:children[i],depth:next.depth+1,parentId:next.unit.id});
  }
 }
 for(const root of roots)append(root,false);
 for(const root of detachedRoots)append(root,true);
 for(const unit of unique.values())if(!seen.has(unit.id))append(unit,true);
 return rows;
}
const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-BR").trim();
export function filterOrganizationRows<T extends OrganizationUnit>(rows:readonly OrganizationRow<T>[],query:string,expanded:ReadonlySet<string>){
 const term=normalize(query);
 if(term){
  const byId=new Map(rows.map(r=>[r.unit.id,r]));const visible=new Set<string>();
  for(const row of rows){
   if(!normalize([row.unit.name,row.unit.code,row.unit.unitType].filter(Boolean).join(" ")).includes(term))continue;
   let current:OrganizationRow<T>|undefined=row;
   while(current&&!visible.has(current.unit.id)){visible.add(current.unit.id);current=current.parentId?byId.get(current.parentId):undefined;}
  }
  return rows.filter(r=>visible.has(r.unit.id));
 }
 const shown=new Set<string>();
 return rows.filter(r=>{const visible=r.parentId===null||(shown.has(r.parentId)&&expanded.has(r.parentId));if(visible)shown.add(r.unit.id);return visible;});
}
