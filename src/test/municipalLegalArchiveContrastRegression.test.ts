import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/** Regression for the live municipal legislation screen recording. */
describe("SIGAPRO municipal legal archive premium layout",()=>{
  const rules=readFileSync("src/components/platform/MunicipalUrbanRulesSettings.tsx","utf8");
  const settings=readFileSync("src/pages/saas/ConfiguracoesPage.tsx","utf8");
  const css=readFileSync("src/index.css","utf8");

  it("keeps the complete save button label visible on dark background",()=>{
    expect(rules).toContain('data-sigapro-urban-rules-save="true"');
    expect(rules).toContain('aria-label="Salvar nova versão como rascunho"');
    expect(rules).toContain('sig-force-dark-action');
    expect(rules).toContain('!text-white');
    expect(rules).toContain('Salvar nova versão como rascunho');
    expect(css).toContain('button[data-sigapro-urban-rules-save="true"]');
    expect(css).toContain('-webkit-text-fill-color: #ffffff !important;');
    expect(css).toContain('visibility: visible !important;');
  });
  it("keeps legal document cards readable with two desktop columns rather than four cramped columns",()=>{
    expect(settings).toContain('grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2');
    expect(settings).not.toContain('md:grid-cols-2 2xl:grid-cols-4');
    expect(settings).toContain('minutas e propostas não são normas vigentes');
    for(const title of ['Plano Diretor','Lei de Uso e Ocupação do Solo','Zoneamento','Leis complementares'])
      expect(settings).toContain('title="'+title+'"');
  });
  it("preserves explicit human verification and existing upload/save flows",()=>{
    expect(rules).toContain('await saveUrbanRegulationDraft(');
    expect(rules).toContain('await activateUrbanRegulation(');
    expect(settings).toContain('<MunicipalUrbanRulesSettings municipalityId={selectedTenantId} canEdit={canManageTenantSettings} />');
    expect(settings).toContain('Salvar arquivos oficiais');
  });
});
