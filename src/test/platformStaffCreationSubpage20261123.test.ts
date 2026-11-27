import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = (path: string) => readFileSync(path, "utf8");
describe("SIGAPRO Master — cadastro de equipe em subpágina independente", () => {
 const app = source("src/App.tsx");
 const staff = source("src/components/platform/PlatformStaffCreator.tsx");
 it("restringe a página Master com permissionamento anterior e checagem de perfil", () => {
   const start = app.indexOf('path="/master/equipe/novo"');
   const end = app.indexOf('path="/master/planos"', start);
   expect(start).toBeGreaterThan(0);
   expect(app.slice(start,end)).toContain('permission="view_master_dashboard"');
   expect(staff).toContain('session.role !== "master_admin"');
 });
 it("separa formulário de lista sem perder regras do backend", () => {
   expect(staff).toContain('data-platform-staff-creator={standalone ? "dedicated" : "summary"}');
   expect(staff).toContain('onClick={() => navigate(standalone ? "/master?secao=usuarios" : "/master/equipe/novo")}');
   expect(staff).not.toContain('setOpen(');
   expect(staff).toContain('createRemotePlatformStaffAccount');
   expect(staff).toContain('data-platform-staff-form="dedicated"');
   expect(source("src/pages/saas/PlatformStaffCreationPage.tsx")).toContain('<PlatformStaffCreator standalone');
 });
});
