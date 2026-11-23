import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");
describe("SIGAPRO — cadastro municipal independente, escalável e sem formulário embutido", () => {
  const app = source("src/App.tsx");
  const admin = source("src/pages/saas/TenantAdminPage.tsx");
  const page = source("src/pages/saas/MunicipalStaffCreationPage.tsx");

  it("usa página própria carregada sob a permissão municipal e o limite contratual", () => {
    const route = app.slice(app.indexOf('path="/prefeitura/usuarios/novo"'), app.indexOf('path="/prefeitura/visao-geral/:subpage"'));
    expect(route).toContain('permission="manage_tenant_users"');
    expect(route).toContain('module="Configurações"');
    expect(route).toContain("<MunicipalStaffCreationPage />");
    expect(app).toContain('pathname.startsWith("/prefeitura/usuarios/novo")');
    expect(admin).toContain('navigate("/prefeitura/usuarios/novo")');
  });

  it("não carrega nem filtra 1500 servidores na tela de criação", () => {
    expect(page).toContain('data-sigapro-create-user-page="dedicated"');
    expect(page).toContain('data-municipal-staff-create-form="standalone"');
    expect(page).not.toContain("<CompactUserRegistry");
    expect(page).not.toContain("listRemoteMunicipalUserRegistry");
    expect(page).not.toContain("sessionUsers");
    expect(page).not.toContain("tenantProcesses");
    expect(admin).not.toContain("isCreateUserPage");
    expect(admin).not.toContain("handleCreateUser");
    expect(admin).not.toContain("data-sigapro-create-user-panel");
    expect(page).toContain("document.scrollingElement.scrollTop = 0");
  });

  it("preserva segurança, direitos, limite do plano e vinculação ao órgão autenticado", () => {
    expect(page).toContain("session.municipalityId ?? session.tenantId ?? null");
    expect(page).toContain("fetchPlanCapacityDashboard(municipalityId)");
    expect(page).toContain("capacity.usage.users >= maxUsers");
    expect(page).toContain("tenantId: municipalityId");
    expect(page).toContain("assignRemoteProfileDepartment");
    expect(page).toContain("await refreshRemoteStore()");
    expect(page).toContain("rolePresets");
    expect(page).toContain("aria-live=\"polite\"");
  });
});
