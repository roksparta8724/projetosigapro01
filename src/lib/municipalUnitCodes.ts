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
