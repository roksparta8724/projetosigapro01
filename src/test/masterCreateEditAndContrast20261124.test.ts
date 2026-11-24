import { readFileSync } from "node:fs";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/pages/saas/MasterAdminPage.tsx","utf8");
const styles = readFileSync("src/styles/sigapro-master-workspace-premium-20261124.css","utf8");
const governance = readFileSync("src/styles/master-user-governance.css","utf8");

describe("SIGAPRO Master — novo cadastro isolado e contraste premium", () => {
  it("abre um formulário vazio ao acessar ?secao=cadastro diretamente", () => {
    expect(page).toContain('resolveMasterFormMode(location.search) === "novo"');
    expect(page).toContain('const emptyTenantForm = { name: "", city: "", state: "",');
    expect(page).toContain('setForm({ ...emptyTenantForm })');
    expect(page).toContain('masterWorkspaceSearch(location.search, "cadastro", selectedTenantId, "novo")');
    expect(page).not.toContain('setSelectedTenantId("")');
  });

  it("somente Gerenciar Prefeitura ativa edição e hidrata a Prefeitura escolhida", () => {
    expect(page).toContain('const handleSelectTenant = (tenantId: string) => {');
    expect(page).not.toContain('setIsCreatingNewInstitution(');
    expect(page).toContain('masterWorkspaceSearch(location.search, "cadastro", tenantId, "editar")');
    expect(page).toContain('hydratedEditTenantRef.current = null');
    expect(page).toContain('if (!activeTenant || hydratedEditTenantRef.current === activeTenant.id) return');
    expect(page).toContain('if (isCreatingNewInstitution || workspaceView !== "cadastro") return');
    expect(page).toContain('data-master-form-mode={isCreatingNewInstitution ? "create" : "edit"}');
  });

  it("navegação do menu Cadastro não reutiliza a última Prefeitura", () => {
    expect(page).toContain('if (value === "cadastro" && (!isCreatingNewInstitution || formIdentityRef.current !== "novo")) resetForNewInstitution()');
    expect(page).toContain('const openMasterSection = (section: WorkspaceView, scopeId = selectedTenantId)');
    expect(page).toContain('masterWorkspaceSearch(location.search, section, scopeId');
    expect(page).toContain('label: "Nova Prefeitura"');
  });

  it("apresenta Atualizar plano somente na edição e rotula a operação corretamente", () => {
    expect(page).toContain('{!isCreatingNewInstitution ? (<div data-master-plan-inline-save="dedicated"');
    expect(page).toContain('"Criar Prefeitura" : "Salvar alterações"');
    expect(page).toContain('institutionId: isCreatingNewInstitution ? undefined');
  });

  it("usa cores explícitas e CSS válido no tema inverso para ambos painéis", () => {
    expect(() => postcss.parse(styles)).not.toThrow();
    expect(() => postcss.parse(governance)).not.toThrow();
    expect(styles).toContain('[data-master-prefeitura-form="premium-standalone"]');
    expect(styles).toContain('color:#cbdff0!important');
    expect(styles).toContain('background:#10263b!important');
    expect(governance).toContain('--master-muted:#c7e1f1');
    expect(governance).toContain('color:#f5fbff!important');
    expect(governance).toContain('-webkit-text-fill-color:#c6e0f0!important');
  });
});


describe("Master — edição protegida durante sincronização", () => {
  it("não substitui a Prefeitura explicitamente selecionada durante o refresh", () => {
    expect(page).toContain('resolveMasterWorkspaceScope(explicitTenantId, institutionCatalog)');
    expect(page).not.toContain('setSelectedTenantId("")');
  });
  it("bloqueia gravação institucional e contratual quando a seleção não está hidratada", () => {
    expect(page).toContain('if (!isCreatingNewInstitution && (!activeTenant || hydratedEditTenantRef.current !== selectedTenantId))');
    expect(page).toContain('if (!activeTenant || hydratedEditTenantRef.current !== selectedTenantId)');
    expect(page).toContain('Nenhuma alteração foi gravada.');
  });
  it("mantém contraste explícito dos campos", () => {
    expect(() => postcss.parse(styles)).not.toThrow();
    expect(styles).toContain('--master-field-ink:#173650');
    expect(styles).toContain('--master-field-ink:#f4fbff');
  });
});


describe("Master — proteção do organograma por município", () => {
  it("não exibe setores de outro município durante troca de seleção", () => {
    expect(page).toContain('departmentScopeId === selectedTenantId ? masterDepartments.filter');
    expect(page).toContain('setDepartmentScopeId(selectedTenantId)');
    expect(page).toContain('setDepartmentScopeId("")');
  });
  it("valida a unidade e o usuário antes de gravar lotação", () => {
    expect(page).toContain('departmentScopeId !== selectedTenantId');
    expect(page).toContain('!activeTenantUsers.some((user) => user.id === assignmentUserId)');
    expect(page).toContain('!activeMasterDepartments.some((item) => item.id === assignmentDepartmentId)');
    expect(page).toContain('Selecione um usuário e uma unidade da Prefeitura atual.');
  });
});


it("usa a URL como fonte única das subpáginas Master", () => {
  expect(page).toContain('const requestedSection = new URLSearchParams(location.search).get("secao")');
  expect(page).toContain('persistInUrl={false} items=');
  expect(page).not.toContain('setWorkspaceView(');
});
