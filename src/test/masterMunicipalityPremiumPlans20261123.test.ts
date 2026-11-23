import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = readFileSync("src/pages/saas/MasterAdminPage.tsx", "utf8");
describe("SIGAPRO Master: cadastro premium e troca isolada de contrato", () => {
  it("dispensa cards embutidos e a barra comercial abaixo do formulario", () => {
    const a = source.indexOf('{workspaceView === "cadastro" ? (');
    const b = source.indexOf('{workspaceView === "organograma" ? (', a);
    const form = source.slice(a,b);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(form).toContain('data-master-prefeitura-form="premium-standalone"');
    expect(form).toContain('data-master-prefeitura-overview="compact"');
    expect(form).toContain('data-master-plan-inline-save="dedicated"');
    expect(form).toContain('form="master-municipality-form"');
    expect(form).not.toContain('<TableCard');
    expect(form).not.toContain('Apoio comercial');
    expect(form).not.toContain('<PageSideContent');
  });
  it("altera contrato sem alterar os dados da Prefeitura e exige confirmacao do banco", () => {
    expect(source).toContain("const handleSavePlanOnly = async () => {");
    expect(source).toContain('await withTimeout(saveClientPlanAssignment({');
    expect(source).toContain('.from("client_plan_assignments")');
    expect(source).toContain('confirmed.plan_id !== selectedPlan.id');
    expect(source).toContain('let saveStage = "Dados da Prefeitura";');
    expect(source).toContain('adminWarnings');
  });
});
