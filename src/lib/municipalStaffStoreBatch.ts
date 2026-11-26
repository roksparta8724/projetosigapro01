import type {MunicipalStaffAssignment} from "./municipalStaffAssignments";
export const municipalStaffBatchKeys=["municipalities","municipality_branding","municipality_settings","profiles","tenant_memberships","roles","departments","processes","properties","payment_guides","process_parties","process_documents","process_requirements","process_audit_entries","process_reopen_history","process_movements","interdepartmental_dispatches","process_messages","process_markers","project_owner_requests","project_owner_links","owner_professional_messages","plans","client_plan_assignments"] as const;
type BatchKey=typeof municipalStaffBatchKeys[number];
export type MunicipalStaffStoreBatch=Record<BatchKey,Record<string,unknown>[]>;
export function parseMunicipalStaffStoreBatch(value:unknown,expected:MunicipalStaffAssignment):MunicipalStaffStoreBatch|null{
 if(!value||typeof value!=="object"||Array.isArray(value))return null;
 const v=value as Record<string,unknown>;
 if(v.profileId!==expected.profileId||v.assignmentId!==expected.id||v.municipalityId!==expected.municipalityId||v.departmentId!==expected.departmentId||v.role!==expected.role||!v.rows||typeof v.rows!=="object"||Array.isArray(v.rows))return null;
 const rows=v.rows as Record<string,unknown>;
 if(Object.keys(rows).length!==municipalStaffBatchKeys.length)return null;
 for(const key of municipalStaffBatchKeys){
   const list=rows[key];if(!Array.isArray(list)||list.length>500)return null;
   const ids=new Set<string>();
   for(const item of list){if(!item||typeof item!=="object"||Array.isArray(item)||typeof item.id!=="string"||!item.id||ids.has(item.id))return null;ids.add(item.id);}
 }
 const profile=(rows.profiles as Record<string,unknown>[]).find(p=>p.id===expected.profileId);
 if(!profile||profile.municipality_id!==expected.municipalityId||profile.department_id!==expected.departmentId||profile.role!==expected.role||profile.account_status!=="active"||profile.deleted_at!==null)return null;
 return rows as MunicipalStaffStoreBatch;
}
