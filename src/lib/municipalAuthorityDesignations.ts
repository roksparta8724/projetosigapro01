export type AuthorityKind = "secretaria" | "diretoria";
export type MunicipalAuthorityDesignation = {id:string;profileId:string;municipalityId:string;departmentId:string;departmentName:string;departmentCode:string;kind:AuthorityKind;isActive:boolean;isPrimary:boolean;urbanismAuthorized:boolean};
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
  ids.add(item.id);return {...item,departmentCode:item.departmentCode??"",isPrimary:item.isPrimary===true,urbanismAuthorized:item.urbanismAuthorized===true} as MunicipalAuthorityDesignation;
 });
}

export type MunicipalIdentityBadge={profileId:string;municipalityId:string;departmentId:string|null;code:string;name:string;kind:string;fixed:boolean;authority:boolean};
export function parseMunicipalIdentityBadges(value:unknown,municipalityId:string,profileIds:readonly string[]):MunicipalIdentityBadge[]{
 if(!Array.isArray(value))throw Error("Identificação institucional não confirmada.");
 const seen=new Set<string>();
 return value.map((item:unknown)=>{
  if(!item||typeof item!=="object")throw Error("Identificação inválida.");
  const row=item as Record<string,unknown>;
  if(typeof row.profileId!=="string"||!profileIds.includes(row.profileId)||seen.has(row.profileId)||row.municipalityId!==municipalityId||typeof row.code!=="string"||typeof row.name!=="string"||typeof row.kind!=="string"||typeof row.fixed!=="boolean"||typeof row.authority!=="boolean"||(row.departmentId!==null&&typeof row.departmentId!=="string"))throw Error("Identificação institucional fora do escopo.");
  seen.add(row.profileId);return row as MunicipalIdentityBadge;
 });
}
export type MunicipalAuthorityCapabilities={director:boolean;secretary:boolean;supervision:boolean;directorNames:string[]};
export const noMunicipalAuthority:MunicipalAuthorityCapabilities={director:false,secretary:false,supervision:false,directorNames:[]};
export function parseMunicipalAuthorityCapabilities(value:unknown):MunicipalAuthorityCapabilities{
 if(!value||typeof value!=="object")return noMunicipalAuthority;
 const v=value as Record<string,unknown>;
 if(typeof v.director!=="boolean"||typeof v.secretary!=="boolean"||typeof v.supervision!=="boolean"||!Array.isArray(v.directorNames)||v.directorNames.length>100||v.directorNames.some(x=>typeof x!=="string"))return noMunicipalAuthority;
 return {director:v.director,secretary:v.secretary,supervision:v.supervision,directorNames:v.directorNames as string[]};
}
