import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {municipalStaffBatchKeys,parseMunicipalStaffStoreBatch} from "@/lib/municipalStaffStoreBatch";
import type {MunicipalStaffAssignment} from "@/lib/municipalStaffAssignments";
const expected:MunicipalStaffAssignment={id:"assignment",profileId:"profile",municipalityId:"municipality",departmentId:"department",departmentName:"Financeiro",departmentCode:"FIN",role:"financeiro",isCurrent:true,isActive:true};
const payload=()=>({profileId:expected.profileId,assignmentId:expected.id,municipalityId:expected.municipalityId,departmentId:expected.departmentId,role:expected.role,rows:{...Object.fromEntries(municipalStaffBatchKeys.map(key=>[key,[]])),profiles:[{id:expected.profileId,municipality_id:expected.municipalityId,department_id:expected.departmentId,role:expected.role,account_status:"active",deleted_at:null}]} as Record<string,Record<string,unknown>[]>});
describe("Leitura agrupada da troca de departamento",()=>{
 it("accepts only a complete bounded snapshot",()=>{expect(parseMunicipalStaffStoreBatch(payload(),expected)).not.toBeNull();});
 it("rejects wrong profile, assignment, department, tenant, role and incomplete data",()=>{
  for(const key of ["profileId","assignmentId","municipalityId","departmentId","role"])expect(parseMunicipalStaffStoreBatch({...payload(),[key]:"other"},expected)).toBeNull();
  const partial=payload();delete partial.rows.process_documents;expect(parseMunicipalStaffStoreBatch(partial,expected)).toBeNull();
 });
 it("rejects overflow, duplicate rows and stale or blocked canonical profiles",()=>{
  const oversized=payload();oversized.rows.processes=Array.from({length:501},(_,i)=>({id:String(i)}));expect(parseMunicipalStaffStoreBatch(oversized,expected)).toBeNull();
  const duplicated=payload();duplicated.rows.processes=[{id:"1"},{id:"1"}];expect(parseMunicipalStaffStoreBatch(duplicated,expected)).toBeNull();
  const blocked=payload();blocked.rows.profiles[0].account_status="blocked";expect(parseMunicipalStaffStoreBatch(blocked,expected)).toBeNull();
 });
 it("retains RLS, exact current assignment, overflow fallback and direct-read pagination",()=>{
  const sql=readFileSync("neon/migrations/20261126_zzzzzzz_municipal_staff_store_batch_v1.sql","utf8");
  expect(sql).toContain("SECURITY INVOKER");expect(sql).toContain("row_security");expect(sql).toContain("LIMIT 501");expect(sql).toContain("FROM PUBLIC, anonymous");expect(sql).toContain("j->>'isCurrent'");
  const api=readFileSync("src/integrations/backend/platformImpl.ts","utf8");expect(api).toContain("if(isNeonBackend && expectedAssignment && !focusProcessRouteKey)");expect(api).toContain('db.rpc("municipal_staff_store_batch_v1"');expect(api).toContain("switchBatch ? Promise.resolve({data:switchBatch[key],error:null}) : load()");
 });
});
