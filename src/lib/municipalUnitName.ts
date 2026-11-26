type Unit = {id:string;name:string;code:string;isActive:boolean;parentDepartmentId?:string|null};
export function findMunicipalUnitNameConflict(name:string,units:readonly Unit[],excludeId?:string|null){
 const key=name.trim().toLocaleLowerCase("pt-BR");
 return key?units.find(u=>u.id!==excludeId&&u.name.trim().toLocaleLowerCase("pt-BR")===key):undefined;
}
const labels:Record<string,string>={secretaria:"Secretaria",diretoria:"Diretoria",departamento:"Departamento",setor:"Setor",coordenadoria:"Coordenadoria",divisao:"Divisão",unidade:"Unidade"};
export function suggestDistinctMunicipalUnitName(name:string,type:string,units:readonly Unit[],excludeId?:string|null,parentId?:string|null,code?:string){
 const label=labels[type]||"Unidade";
 const clean=name.trim();
 if(!clean)return "";
 const qualified=clean.toLocaleLowerCase("pt-BR").startsWith(label.toLocaleLowerCase("pt-BR")+" ")?clean:label+" de "+clean;
 const parent=units.find(u=>u.id===parentId);
 const candidates=[qualified,parent?qualified+" — "+parent.name:"",code?.trim()?qualified+" ("+code.trim()+")":""];
 return candidates.find(candidate=>candidate&&candidate!==clean&&!findMunicipalUnitNameConflict(candidate,units,excludeId))||"";
}
export function municipalUnitSaveError(message:unknown){
 const raw=typeof message==="string"?message:"";
 if(/departments_municipality_id_name_key/i.test(raw)||/duplicate key value/i.test(raw))return "Já existe uma unidade com este nome nesta Prefeitura. Verifique também as unidades inativas e escolha um nome distinto.";
 if(/^[\s\S]*?(violates|SQLSTATE|PostgREST|constraint|relation .* does not exist|permission denied)/i.test(raw))return "Não foi possível salvar a unidade. Confira os dados e tente novamente.";
 return raw||"Não foi possível salvar a unidade do organograma.";
}
