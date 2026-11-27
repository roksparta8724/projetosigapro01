import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getMunicipalAssignmentForAccount, isSwitchableMunicipalStaffRole, parseMunicipalStaffAssignments } from "@/lib/municipalStaffAssignments";

const sql=readFileSync("neon/migrations/20261118_municipal_multi_department_staff_v1.sql","utf8");
const portal=readFileSync("src/components/platform/PortalFrame.tsx","utf8");
const admin=readFileSync("src/pages/saas/TenantAdminPage.tsx","utf8");
const switcher=readFileSync("src/components/platform/MunicipalDepartmentSwitcher.tsx","utf8");
const editor=readFileSync("src/components/platform/MunicipalStaffAssignmentsEditor.tsx","utf8");
const api=readFileSync("src/integrations/backend/platformImpl.ts","utf8");
const department=(id:string,profileId="user-1",municipalityId="municipality-1",role="analista")=>({
  id,profileId,municipalityId,departmentId:"dept-"+id,departmentName:"Departamento "+id,departmentCode:"URB",
  role,isActive:true,isCurrent:id==="1",
});
describe("SIGAPRO — um login, múltiplas lotações com permissão real",()=>{
  it("permite somente papéis operacionais e rejeita administrador ou acesso externo",()=>{
    for(const role of ["analista","financeiro","fiscal","setor_intersetorial"])expect(isSwitchableMunicipalStaffRole(role)).toBe(true);
    for(const role of ["prefeitura_admin","master_admin","prefeitura_supervisor","profissional_externo","property_owner"])
      expect(isSwitchableMunicipalStaffRole(role)).toBe(false);
  });
  it("recusa registros estrangeiros, duplicados, revogados ou adulterados no cliente",()=>{
    expect(()=>parseMunicipalStaffAssignments({})).toThrow();
    expect(()=>parseMunicipalStaffAssignments([department("1","u","other","prefeitura_admin")])).toThrow();
    expect(()=>parseMunicipalStaffAssignments([{...department("1"),isActive:false}])).toThrow();
    expect(()=>parseMunicipalStaffAssignments([department("1"),department("1")])).toThrow();
    const own=parseMunicipalStaffAssignments([department("1"),department("2"),department("3","other")]);
    expect(getMunicipalAssignmentForAccount(own,"user-1","municipality-1")).toHaveLength(2);
    expect(getMunicipalAssignmentForAccount(own,"other","municipality-1")).toHaveLength(1);
    expect(getMunicipalAssignmentForAccount(own,"user-1","another")).toHaveLength(0);
  });
  it("a concessão é feita exclusivamente pelo administrador da mesma prefeitura",()=>{
    expect(sql).toContain("v_actor_role='prefeitura_admin' AND v_actor_municipality=_municipality_id");
    expect(sql).toContain("IF v_actor=_profile_id THEN RAISE EXCEPTION");
    expect(sql).toContain("JOIN public.departments d ON d.id=a.department_id");
    expect(sql).toContain("account_status='active'");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("REVOKE ALL ON public.municipal_staff_assignments");
    expect(sql).toContain("municipal_staff_assignment_audit");
  });
  it("a troca exige RPC autorizado, conta ativa, vínculo próprio e confirmação antes de navegar",()=>{
    expect(sql).toContain("a.profile_id=v_actor");
    expect(sql).toContain("a.is_active");
    expect(sql).toContain("a.municipality_id=v_profile.municipality_id");
    expect(sql).toContain("PERFORM public._apply_staff_context_v1");
    expect(sql).toContain("role_id<>v_role_id");
    expect(switcher).toContain("await activateRemoteMunicipalStaffAssignment");
    expect(switcher).toContain("await refreshRemoteStore(null, assignment, confirmAssignment)");
    expect(switcher.indexOf("await refreshRemoteStore(null, assignment, confirmAssignment)")).toBeLessThan(switcher.indexOf("navigate(getSessionLandingPath"));
    expect(switcher).toContain("getMunicipalAssignmentForAccount");
    expect(api).toContain('db.rpc("activate_municipal_staff_assignment_v1"');
  });
  it("topbar fica único; seletor não faz login, reload, mudança de senha ou troca de identidade",()=>{
    expect(portal).toContain("<MunicipalDepartmentSwitcher dark={darkTopbar} />");
    expect(switcher).toContain("if (rows.length < 2 ||");
    expect(switcher).not.toContain("window.location.reload");
    expect(switcher).not.toContain("signOut");
    expect(switcher).not.toContain("signIn");
    expect(switcher).toContain("toast.error");
    expect(switcher).not.toContain("toast.success");
  });
  it("gestão de usuários da Prefeitura inclui autorizações com contraste claro e escuro",()=>{
    expect(admin).toContain("session.role === \"prefeitura_admin\"");
    expect(admin).toContain("<MunicipalStaffAssignmentsEditor");
    expect(editor).toContain("setRemoteMunicipalStaffDepartment");
    expect(editor).toContain("dark:bg-slate-900");
    expect(editor).toContain("dark:text-white");
    expect(editor).toContain('data-municipal-assignment-card="true"');
    expect(editor).toContain('data-assignment-state=');
    expect(editor).toContain("border-emerald-300 bg-emerald-50/90");
    expect(editor).toContain("border-sky-200 bg-sky-50/80");
    expect(editor).toContain("dark:bg-emerald-950/45");
    expect(editor).toContain("dark:bg-sky-950/35");
    expect(editor).toContain("!text-white");
    expect(editor).toContain("dark:!text-white");
    expect(admin).toContain('data-municipal-user-lotation="true"');
    expect(admin).toContain('data-municipal-user-security="true"');
    expect(admin).toContain("dark:text-slate-200");
    expect(sql).toContain("É necessário manter ao menos uma lotação ativa");
  });
  it("confirma o setor ativo no backend antes de mudar perfil e rota", () => {
    const readBack = switcher.indexOf("const verified = getMunicipalAssignmentForAccount(");
    const checkCurrent = switcher.indexOf("const active = verified.filter((item) => item.isCurrent);");
    const verifyRole = switcher.indexOf("active[0].role !== activated.role");
    const refresh = switcher.indexOf("await refreshRemoteStore(null, assignment, confirmAssignment);");
    const publish = switcher.indexOf("flushSync(() => {");
    const navigateAfter = switcher.indexOf("navigate(getSessionLandingPath(nextSession)");
    expect(readBack).toBeGreaterThan(-1);
    expect(switcher).toContain("await listRemoteMunicipalStaffAssignments(), session.id, municipalityId");
    const provider=readFileSync("src/hooks/usePlatformData.tsx","utf8");
    expect(provider).toContain("const [remote] = await Promise.all([");
    expect(provider).toContain("confirmAssignment?.() ?? Promise.resolve()");
    expect(provider.indexOf("const [remote] = await Promise.all([")).toBeLessThan(provider.indexOf("const confirmed = sanitized.sessionUsers.find"));
    expect(checkCurrent).toBeGreaterThan(readBack);
    expect(verifyRole).toBeGreaterThan(checkCurrent);
    expect(refresh).toBeGreaterThan(verifyRole);
    expect(publish).toBeGreaterThan(refresh);
    expect(navigateAfter).toBeGreaterThan(publish);
    expect(switcher).toContain("O departamento ativo não foi confirmado pelo banco");
  });

});
