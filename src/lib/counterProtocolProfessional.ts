import type { ProtocolDraftForm } from "./protocolDraft";
import { inferProfessionalCouncil } from "./professionalResponsibility";

export interface MunicipalClerkIdentity {
  names: Array<string | null | undefined>;
  emails: Array<string | null | undefined>;
  documents: Array<string | null | undefined>;
  occupations: Array<string | null | undefined>;
}
/** Authenticated municipal employees are the filing CLERK, never an implicit technical lead. */
export function shouldAutofillTechnicalLead(role:string,counter:boolean) {
  return role==="profissional_externo" && !counter;
}
export function isLicensedProfessionalActivity(activity:string|null|undefined) {
  const role=String(activity??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  return Boolean(inferProfessionalCouncil(role) || /profissional habilitad|agronom|geolog/.test(role));
}
const normalize=(value:string|null|undefined)=>
  String(value??"").trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const digits=(value:string|null|undefined)=>String(value??"").replace(/\D/g,"");
/** Clear only legacy counter drafts PROVEN to be copied from a clerk's administrative profile.
 * Never touch saved drafts, live processes, payment orders or manually entered technicians.
 */
export function isolateCounterProfessionalDraft(
  form:ProtocolDraftForm,clerk:MunicipalClerkIdentity,isCounter:boolean
):ProtocolDraftForm {
  if(!isCounter || !form.profissional.trim() || isLicensedProfessionalActivity(form.tipoProfissional))return form;
  const matchesName=clerk.names.some(name=>Boolean(name)&&normalize(name)===normalize(form.profissional));
  if(!matchesName)return form;
  const sameEmail=clerk.emails.some(email=>Boolean(email)&&normalize(email)===normalize(form.email));
  const sameDoc=Boolean(digits(form.profissionalDocumento))&&clerk.documents.some(doc=>
    Boolean(doc)&&digits(doc)===digits(form.profissionalDocumento));
  const sameAdministrativeRole=Boolean(normalize(form.tipoProfissional))&&clerk.occupations.some(role=>
    Boolean(role)&&normalize(role)===normalize(form.tipoProfissional));
  if(!sameEmail && !sameDoc && !sameAdministrativeRole)return form;
  return {...form,profissional:"",profissionalDocumento:"",tipoProfissional:"",
    empresaProfissional:"",registro:"",conselhoProfissional:"",
    inscricaoMunicipalProfissional:"",responsabilidadeProjeto:"",
    telefone:"",email:""};
}
