const stop = new Set(["DE","DA","DO","DAS","DOS","E","PARA","POR","EM","NA","NO","SECRETARIA","SECRETARIO","DIRETORIA","DIRETOR","DEPARTAMENTO","SETOR","COORDENADORIA","DIVISAO","UNIDADE","ADJUNTA","ADJUNTO"]);
const prefix:Record<string,string>={secretaria:"SEC",diretoria:"DIR",departamento:"DEP",setor:"SET",coordenadoria:"COO",divisao:"DIV",unidade:"UNI"};
const normalize=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
export const isAdjunctUnit=(name:string)=>/\bADJUNT[AO]S?\b/.test(normalize(name));
export const adjunctUnitTemplates=[
 {name:"Secretaria Adjunta de ",unitType:"secretaria",label:"Secretário(a) adjunto(a)"},
 {name:"Diretoria Adjunta de ",unitType:"diretoria",label:"Diretor(a) adjunto(a)"},
] as const;
export function suggestMunicipalUnitCode(name:string,unitType:string,existing:readonly {id:string;code:string}[],excludeId?:string|null){
 if(!name.trim())return "";
 const basePrefix=isAdjunctUnit(name)&&unitType==="secretaria"?"SAD":isAdjunctUnit(name)&&unitType==="diretoria"?"DAD":prefix[unitType]||"UNI";
 const words=normalize(name).split(/[^A-Z0-9]+/).filter(w=>w&&!stop.has(w));
 const part=(words.length>1?words.map(w=>w[0]).join(""):words[0]?.slice(0,3))||"GER";
 const base=(basePrefix+"-"+part).slice(0,8);
 const used=new Set(existing.filter(x=>x.id!==excludeId).map(x=>x.code.trim().toUpperCase()));
 if(!used.has(base))return base;
 for(let i=2;i<=9999;i++){const suffix=String(i),candidate=base.slice(0,8-suffix.length)+suffix;if(!used.has(candidate))return candidate;}
 return "";
}

/** The persisted base type retains existing scoped authority rules. The explicit
 * editor subtype is represented by the canonical adjunct designation in the name.
 * Merely choosing an adjunct type never grants a competence or a staff role. */
export function municipalUnitEditorType(name:string,unitType:string){
 return isAdjunctUnit(name)&&unitType==="secretaria"?"secretaria_adjunta":isAdjunctUnit(name)&&unitType==="diretoria"?"diretoria_adjunta":unitType;
}
export function changeMunicipalUnitEditorType(name:string,oldType:string,nextType:string,parentName=""){
 const adjunct=nextType==="secretaria_adjunta"||nextType==="diretoria_adjunta";
 const unitType=nextType==="secretaria_adjunta"?"secretaria":nextType==="diretoria_adjunta"?"diretoria":nextType;
 const previous=municipalUnitEditorType(name,oldType);
 if(previous===nextType)return {name,unitType};
 if(adjunct){
  const subject=name.trim().replace(/^(secretaria|secretári[oa]|secretari[oa]|diretoria|diretor[a]?)[\s-]*(adjunt[oa])?[\s-]*(de|da|do|das|dos)?\s*/i,"").trim();
  const parentSubject=parentName.trim().replace(/^(secretaria|diretoria)(?:\s+(?:de|da|do|das|dos))?\s+/i,"");
  const base=subject||parentSubject;
  return {unitType,name:(unitType==="secretaria"?"Secretaria Adjunta":"Diretoria Adjunta")+(base?" de "+base:" de ")};
 }
 if(previous.endsWith("_adjunta")){
  const subject=name.replace(/^(secretaria|secretári[oa]|secretari[oa]|diretoria|diretor[a]?)[\s-]*adjunt[oa][\s-]*(de|da|do|das|dos)?\s*/i,"").trim();
  const label=unitType==="secretaria"?"Secretaria":unitType==="diretoria"?"Diretoria":"";
  return {unitType,name:label?label+(subject?" de "+subject:" de "):subject};
 }
 return {name,unitType};
}
