export type AuthorityKind = "secretaria" | "diretoria";
export type MunicipalAuthorityDesignation = {id:string;profileId:string;municipalityId:string;departmentId:string;departmentName:string;departmentCode:string;kind:AuthorityKind;isActive:boolean};
export const authorityUnitPresets = [
 {code:"SEC-ADM",name:"Secretaria de Administração",unitType:"secretaria"},
 {code:"SEC-FIN",name:"Secretaria de Finanças",unitType:"secretaria"},
 {code:"SEC-OBR",name:"Secretaria de Obras",unitType:"secretaria"},
 {code:"SEC-DU",name:"Secretaria de Desenvolvimento Urbano",unitType:"secretaria"},
 {code:"DIR-ADM",name:"Diretoria de Administração",unitType:"diretoria"},
 {code:"DIR-FIN",name:"Diretoria Financeira",unitType:"diretoria"},
 {code:"DIR-OBR",name:"Diretoria de Obras",unitType:"diretoria"},
 {code:"DIR-DU",name:"Diretoria de Desenvolvimento Urbano",unitType:"diretoria"},
] as const;
export function isAuthorityKind(kind:string):kind is AuthorityKind{return kind==="secretaria"||kind==="diretoria";}
export function parseAuthorityDesignations(value:unknown,municipalityId:string,profileId:string):MunicipalAuthorityDesignation[]{
 if(!Array.isArray(value))throw new Error("Designações não confirmadas pelo banco.");
 const ids=new Set<string>();
 return value.map(item=>{
  if(!item||typeof item!=="object"||typeof item.id!=="string"||!item.id||ids.has(item.id)||item.municipalityId!==municipalityId||item.profileId!==profileId||typeof item.departmentId!=="string"||!item.departmentId||typeof item.departmentName!=="string"||typeof item.departmentCode!=="string"&&item.departmentCode!==null||!isAuthorityKind(item.kind)||typeof item.isActive!=="boolean")throw new Error("Designação inválida ou fora do escopo.");
  ids.add(item.id);return {...item,departmentCode:item.departmentCode??""} as MunicipalAuthorityDesignation;
 });
}
