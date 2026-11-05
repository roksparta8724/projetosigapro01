import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const code = (path:string) => readFileSync(path,"utf8");

describe("SIGAPRO QA — atalho seguro entre projeto arquitetônico e IA visual",()=>{
  it("mostra atalho somente ao analista que pode editar e tem acesso técnico",()=>{
    const source=code("src/pages/saas/ProcessDetailPage.tsx");
    expect(source).toContain('data-sigapro-ai-review-shortcut="true"');
    expect(source).toContain('document.label === "Projeto Arquitetônico"');
    expect(source).toContain("canUseMunicipalChecklist &&");
    expect(source).toContain("canEditAnalysisChecklist &&");
    expect(source).toContain("stableAnalysisAccess");
    expect(source).toContain('${buildProcessPath(process, "analise")}#sigapro-urban-precheck');
    expect(source).toContain("Ir para leitura com IA");
    expect(source).toContain('data-primary-action="document"');
    expect(source).toContain("!text-white");
  });
  it("navega ao formulário sem acionar leitura paga nem aprovar processo",()=>{
    const detail=code("src/pages/saas/ProcessDetailPage.tsx");
    const panel=code("src/components/platform/UrbanPrecheckPanel.tsx");
    const extract=detail.slice(detail.indexOf('data-sigapro-ai-review-shortcut="true"'),detail.indexOf("Ir para leitura com IA")+100);
    expect(extract).toContain("to={");
    expect(extract).not.toContain("fetch(");
    expect(extract).not.toContain("scan()");
    expect(panel).toContain('id="sigapro-urban-precheck"');
    expect(panel).toContain("scrollIntoView");
    expect(panel).toContain("Esta tela está em modo de consulta");
    expect(panel).toContain("Ler projeto arquitetônico com IA");
  });
});
