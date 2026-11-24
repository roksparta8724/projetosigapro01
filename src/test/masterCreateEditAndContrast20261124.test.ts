import { readFileSync } from "node:fs";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/pages/saas/MasterAdminPage.tsx","utf8");
const styles = readFileSync("src/styles/sigapro-master-workspace-premium-20261124.css","utf8");
const governance = readFileSync("src/styles/master-user-governance.css","utf8");

describe("SIGAPRO Master — novo cadastro isolado e contraste premium", () => {
  it("abre um formulário vazio ao acessar ?secao=cadastro diretamente", () => {
    expect(page).toContain('get("secao") === "cadastro"');
    expect(page).toContain('const emptyTenantForm = { name: "", city: "", state: "",');
    expect(page).toContain('setForm({ ...emptyTenantForm })');
    expect(page).toContain('setSelectedTenantId("")');
    expect(page).toContain('params.set("secao", "cadastro")');
  });

  it("somente Gerenciar Prefeitura ativa edição e hidrata a Prefeitura escolhida", () => {
    expect(page).toContain('const handleSelectTenant = (tenantId: string) => {');
    expect(page).toContain('setIsCreatingNewInstitution(false)');
    expect(page).toContain('setSelectedTenantId(tenantId)');
    expect(page).toContain('hydratedEditTenantRef.current = null');
    expect(page).toContain('if (!activeTenant || hydratedEditTenantRef.current === activeTenant.id) return');
    expect(page).toContain('if (isCreatingNewInstitution || workspaceView !== "cadastro") return');
    expect(page).toContain('data-master-form-mode={isCreatingNewInstitution ? "create" : "edit"}');
  });

  it("navegação do menu Cadastro não reutiliza a última Prefeitura", () => {
    expect(page).toContain('if (value === "cadastro" && (workspaceView !== "cadastro" || !isCreatingNewInstitution)) resetForNewInstitution()');
    expect(page).toContain('const openMasterSection = (section: WorkspaceView)');
    expect(page).toContain('params.set("secao", section)');
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
