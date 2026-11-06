import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const read=(path:string)=>readFileSync(path,"utf8");

describe("SIGAPRO QA - orientação ao analista e recuos do projeto 04",()=>{
  it("liga a mesa de marcações à leitura de IA existente, sem disparar envio automático",()=>{
    const editor=read("src/pages/saas/DocumentAnalysisPage.tsx");
    const precheck=read("src/components/platform/UrbanPrecheckPanel.tsx");
    expect(editor).toContain('data-sigapro-open-project-ai="true"');
    expect(editor).toContain('navigate(buildProcessPath(process, "analise") + "#sigapro-urban-precheck",');
    expect(editor).toContain('setStatus("Conclua ou cancele a observação em edição antes de abrir a IA.")');
    expect(editor).toContain("if (draftAnnotations.length && !showProjectAi) saveReviewDraft()");
    const openAi=editor.slice(editor.indexOf("const openProjectAi ="),
      editor.indexOf("const sendReviewedDrawingToPrecheck ="));
    expect(openAi).toContain("setShowProjectAi");
    expect(openAi).not.toContain("navigate(");
    expect(precheck).toContain('id="sigapro-urban-precheck"');
    expect(editor).toContain("<ArchitecturalPdfAiPanel");
    expect(precheck).not.toContain("<ArchitecturalPdfAiPanel");
    expect(editor).toContain('data-sigapro-project-reader-workspace="true"');
    expect(editor).toContain('data-sigapro-ai-in-document="true"');
    expect(precheck).toContain("window.location.hash");
  });

  it("destaca a prancha 02 de recuos apenas na planta fictícia de QA",()=>{
    const editor=read("src/pages/saas/DocumentAnalysisPage.tsx");
    const fixture=read("src/lib/qa04ArchitecturalFixture.ts");
    expect(editor).toContain('import.meta.env.VITE_SIGAPRO_NEON_ISOLATED === "true"');
    expect(editor).toContain('document?.fileName === "SIGAPRO-QA04-PLANTA-IMPLANTACAO-V2.pdf"');
    expect(editor).toContain('data-sigapro-qa04-recuos-page="2"');
    expect(editor).toContain("onClick={() => setPage(2)}");
    expect(editor).toContain("Ver prancha 02 · Recuos");
    expect(fixture).toContain('header(2, "02 - PLANTA DE IMPLANTACAO');
    expect(fixture).toContain("Recuo frontal proposto: 5,00 m");
    expect(fixture).toContain("Recuo de fundos proposto: 12,00 m");
  });

  it("não atribui ao R2 a inferência visual nem permite conclusão legal automática",()=>{
    const aiPanel=read("src/components/platform/ArchitecturalPdfAiPanel.tsx");
    const provider=read("server/architectural-pdf-provider.ts");
    const api=read("server/ai-project-extract.ts");
    expect(provider).toContain("R2 provides bytes, not an AI provider.");
    expect(aiPanel).toContain("A Leitura Visual está configurada, mas o saldo do prestador ainda não foi confirmado.");
    expect(api).toContain("billingVerified:false");
    expect(aiPanel).toContain("confirmedTransfer:true");
    expect(api).toContain("humanReviewRequired:true");
  });

  it("identifica recursos SIGAPRO sem confundir rótulos com prestadores externos",()=>{
    const panel=read("src/components/platform/ArchitecturalPdfAiPanel.tsx");
    const api=read("server/ai-project-extract.ts");
    const storage=read("src/components/platform/MunicipalStorageSettings.tsx");
    const assistant=read("src/pages/saas/AiAssistantPage.tsx");
    const master=read("src/pages/saas/MasterAdminPage.tsx");
    const dashboard=read("src/pages/saas/DashboardHomePage.tsx");
    expect(panel).toContain("SIGAPRO IA · Leitura Técnica do Projeto");
    expect(panel).toContain("SIGAPRO IA · Leitura Visual");
    expect(panel).toContain("SIGAPRO IA · Leitura Documental");
    expect(panel).toContain('data-sigapro-ai-processor-disclosure="true"');
    expect(panel).toContain("Prestador: Cloudflare Workers AI (extração textual).");
    expect(panel).toContain("Prestador: Anthropic, serviço Claude (leitura visual).");
    expect(panel).not.toContain("Leitura visual · Claude");
    expect(panel).not.toContain("Leitura textual · Cloudflare");
    expect(panel).not.toContain("Extraindo texto com Cloudflare...");
    expect(panel).toContain("setReadingMode(next);setConsent(false);setDraft(null)");
    expect(api).toContain("O SIGAPRO IA · Leitura Visual está sem créditos");
    expect(api).toContain("SIGAPRO IA · Leitura Documental");
    expect(storage).toContain("SIGAPRO Nuvem · Arquivos Oficiais");
    expect(storage).toContain('data-sigapro-storage-infrastructure="true"');
    expect(assistant).toContain('title="SIGAPRO IA · Assistente"');
    expect(master).toContain("Banco SIGAPRO conectado");
    expect(dashboard).toContain("Consultando limites contratados no SIGAPRO...");
  });

});
