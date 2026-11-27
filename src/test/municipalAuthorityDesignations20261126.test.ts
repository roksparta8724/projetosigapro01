import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {authorityUnitPresets,parseAuthorityDesignations} from "@/lib/municipalAuthorityDesignations";
describe("Autoridade institucional independente de permissões",()=>{
 it("oferece quatro secretarias e quatro diretorias sem impor estrutura",()=>{expect(authorityUnitPresets.filter(p=>p.unitType==="secretaria")).toHaveLength(4);expect(authorityUnitPresets.filter(p=>p.unitType==="diretoria")).toHaveLength(4);});
 it("recusa designação de outra prefeitura, conta ou tipo",()=>{const row={id:"1",municipalityId:"m",profileId:"p",departmentId:"d",departmentName:"Obras",departmentCode:"SEC-OBR",kind:"secretaria",isActive:true};expect(parseAuthorityDesignations([row],"m","p")).toHaveLength(1);for(const patch of [{municipalityId:"other"},{profileId:"other"},{kind:"master_admin"}])expect(()=>parseAuthorityDesignations([{...row,...patch}],"m","p")).toThrow();expect(()=>parseAuthorityDesignations([row,row],"m","p")).toThrow();});
 it("não modifica role, assinatura nem lotação operacional",()=>{const sql=readFileSync("neon/migrations/20261126_zzzzzzzz_municipal_authority_designations_v1.sql","utf8");expect(sql).toContain("actor.role<>'prefeitura_admin'");expect(sql).toContain("actor.id=_profile_id");expect(sql).toContain("municipal_authority_designation_audit");expect(sql).not.toMatch(/UPDATE public\.profiles|UPDATE public\.tenant_memberships|INSERT INTO public\.municipal_staff_assignments/);});
});
