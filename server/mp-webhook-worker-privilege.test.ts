import {describe,expect,it,vi} from "vitest";
import {
  assertMpWorkerLeastPrivilege,MP_WORKER_PRIVILEGE_AUDIT_SQL,
  workerHasLeastPrivilege,MP_WORKER_ROLE,type MpWorkerPrivilegeEvidence,
} from "./mp-webhook-worker-privilege";
import {readFileSync} from "node:fs";

const compliant:MpWorkerPrivilegeEvidence={
  role_name:MP_WORKER_ROLE,bypass_rls:false,superuser:false,admin_membership:false,
  profiles_update:false,document_delete:false,
};
describe("SIGAPRO bancos — worker financeiro sem permissões administrativas",()=>{
  it("recusa configuração real detectada na QA: BYPASSRLS e herança neon_superuser",()=>{
    expect(workerHasLeastPrivilege({...compliant,bypass_rls:true,admin_membership:true})).toBe(false);
    expect(workerHasLeastPrivilege({...compliant,bypass_rls:true})).toBe(false);
    expect(workerHasLeastPrivilege({...compliant,admin_membership:true})).toBe(false);
  });
  it("recusa SELECT/UPDATE de perfis e DELETE de arquivos mesmo sem BYPASSRLS",()=>{
    expect(workerHasLeastPrivilege({...compliant,profiles_update:true})).toBe(false);
    expect(workerHasLeastPrivilege({...compliant,document_delete:true})).toBe(false);
    expect(workerHasLeastPrivilege({...compliant,superuser:true})).toBe(false);
    expect(workerHasLeastPrivilege({...compliant,role_name:"neondb_owner"})).toBe(false);
    expect(workerHasLeastPrivilege(null)).toBe(false);
    expect(workerHasLeastPrivilege(compliant)).toBe(true);
  });
  it("verifica o papel na conexão Postgres real antes de consultar credenciais financeiras",async()=>{
    const db={query:vi.fn().mockResolvedValue({rows:[compliant]})};
    await expect(assertMpWorkerLeastPrivilege(db)).resolves.toBeUndefined();
    expect(db.query).toHaveBeenCalledWith(MP_WORKER_PRIVILEGE_AUDIT_SQL,[]);
    db.query.mockResolvedValue({rows:[{...compliant,bypass_rls:true}]});
    await expect(assertMpWorkerLeastPrivilege(db)).rejects.toThrow("MP_WORKER_EXCESSIVE_PRIVILEGES");
    db.query.mockRejectedValue(new Error("permission denied"));
    await expect(assertMpWorkerLeastPrivilege(db)).rejects.toThrow();
  });
  it("produz barreira de autorização antes de callback e de reconciliação",()=>{
    const server=readFileSync("server/mp-prod-webhook.ts","utf8");
    expect(server).toContain('import {assertMpWorkerLeastPrivilege}');
    expect(server.indexOf("await assertMpWorkerLeastPrivilege(client);")).toBeGreaterThan(server.indexOf("await client.connect();"));
    expect(server.indexOf("await assertMpWorkerLeastPrivilege(client);")).toBeLessThan(server.indexOf("return await fn(client);"));
    expect(MP_WORKER_PRIVILEGE_AUDIT_SQL).toContain("rolbypassrls");
    expect(MP_WORKER_PRIVILEGE_AUDIT_SQL).toContain("profiles");
  });
});
