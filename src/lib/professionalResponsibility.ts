/** Shared professional council terminology; avoids treating architects or technicians as CREA engineers. */
export const professionalActivityOptions = [
  "Engenheiro(a) Civil",
  "Engenheiro(a) de outras especialidades",
  "Arquiteto(a) e Urbanista",
  "Técnico(a) em Edificações",
  "Técnico(a) Industrial",
  "Outro(a) profissional habilitado(a)",
] as const;
export const professionalCouncilOptions = [
  {value:"CREA", label:"CREA — Engenharia e Agronomia"},
  {value:"CAU", label:"CAU — Arquitetura e Urbanismo"},
  {value:"CFT/CRT", label:"CFT / CRT — Técnicos Industriais"},
  {value:"OUTRO", label:"Outro conselho competente"},
] as const;
export function inferProfessionalCouncil(role:string|null|undefined):string {
  const normal=String(role||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  if(/arquiteto|urbanista|cau/.test(normal))return "CAU";
  if(/tecnico|tecnica|cft|crt/.test(normal))return "CFT/CRT";
  if(/engenheiro|engenheira|agronom|crea/.test(normal))return "CREA";
  return "";
}
export function technicalResponsibilityLabel(council:string|null|undefined):string {
  if(council==="CREA")return "ART";
  if(council==="CAU")return "RRT";
  if(council==="CFT/CRT")return "TRT";
  return "ART / RRT / TRT";
}
export function compatibleTechnicalDocumentLabel(label:string):string {
  return /^ART ou RRT$/i.test(label.trim()) ? "ART / RRT / TRT" : label;
}
