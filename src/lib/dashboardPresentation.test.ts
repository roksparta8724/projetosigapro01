import { describe, expect, it } from "vitest";
import { displayDashboardCategoryLabel } from "./dashboardPresentation";

describe("Dashboard SIGAPRO — rótulos profissionais em português", () => {
  it("não deixa os códigos técnicos de processo aparecerem no visual premium", () => {
    expect(displayDashboardCategoryLabel("aprovacao_projeto")).toBe("Aprovação de projeto");
    expect(displayDashboardCategoryLabel("licenciamento")).toBe("Licenciamento");
    expect(displayDashboardCategoryLabel("analise_tecnica")).toBe("Análise técnica");
    expect(displayDashboardCategoryLabel("habite_se")).toBe("Habite-se");
    expect(displayDashboardCategoryLabel("processo_administrativo")).toBe("Processo administrativo");
  });

  it("respeita a descrição original já conferida e não altera categorias", () => {
    expect(displayDashboardCategoryLabel("Aprovação de Projeto Residencial")).toBe("Aprovação de Projeto Residencial");
    expect(displayDashboardCategoryLabel("Correção documental do profissional")).toBe("Correção documental do profissional");
    expect(displayDashboardCategoryLabel("")).toBe("Não informado");
  });
});
