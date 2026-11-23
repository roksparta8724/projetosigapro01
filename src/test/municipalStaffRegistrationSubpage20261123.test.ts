import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = (path: string) => readFileSync(path, "utf8");
describe("Gestão municipal: cadastro dedicado de servidor", () => {
 const page = source("src/pages/saas/TenantAdminPage.tsx");
 const routes = source("src/App.tsx");
 it("possui rota própria com o mesmo isolamento de permissão e plano", () => {
   const begin = routes.indexOf('path="/prefeitura/usuarios/novo"');
   const end = routes.indexOf('path="/prefeitura/visao-geral/:subpage"');
   expect(begin).toBeGreaterThan(0);
   const route = routes.slice(begin,end);
   expect(route).toContain('permission="manage_tenant_users"');
   expect(route).toContain('module="Configurações"');
   expect(page).toContain('location.pathname === "/prefeitura/usuarios/novo"');
 });
 it("não empilha o formulário sobre o cadastro geral", () => {
   expect(page).toContain('data-sigapro-create-user-page="dedicated"');
   expect(page).not.toContain('createUserOpen');
   const begin = page.indexOf('if (isCreateUserPage) {');
   const end = page.indexOf('  return (\n    <PortalFrame eyebrow="Administração da Prefeitura"',begin);
   expect(begin).toBeGreaterThan(0);
   expect(end).toBeGreaterThan(begin);
   const formOnly = page.slice(begin,end);
   expect(formOnly).not.toContain('<CompactUserRegistry');
   expect(formOnly).not.toContain('<InternalTabs');
   expect(formOnly).toContain('onSubmit={handleCreateUser}');
   expect(formOnly).toContain('navigate("/prefeitura?secao=usuarios")');
 });
 it("mantém vínculo, proteção de senha, limite do plano e sincronização", () => {
   expect(page).toContain('tenantId: effectiveScopeId');
   expect(page).toContain('assignRemoteProfileDepartment');
   expect(page).toContain('planEntitlements.maxUsers');
   expect(page).toContain('await refreshRemoteStore()');
   expect(page).toContain('setMunicipalRegistryRefresh((current) => current + 1)');
 });
});
