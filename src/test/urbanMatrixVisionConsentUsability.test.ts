import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const ui=readFileSync("src/components/platform/UrbanLegalMatrixImporter.tsx","utf8");
describe("SIGAPRO — leitura visual desbloqueável e autorização visível",()=>{
  it("exibe consentimento imediatamente acima do botão de leitura visual",()=>{
    const consent=ui.indexOf('data-urban-matrix-vision-consent="true"');
    const button=ui.indexOf('data-urban-matrix-action="vision"');
    const preview=ui.indexOf('alt="Prévia local da linha fotografada do quadro"');
    expect(preview).toBeGreaterThan(-1);
    expect(consent).toBeGreaterThan(preview);
    expect(button).toBeGreaterThan(consent);
    expect(button-consent).toBeLessThan(1000);
    expect(ui).toContain('aria-label="Autorizar leitura da imagem pela IA"');
    expect(ui).toContain('Marque a autorização logo ACIMA do botão');
  });
  it("não permite enviar imagem sem PDF, página, recorte e consentimento",()=>{
    expect(ui).toContain('disabled={visionBusy||busy||!file||!pageImage||!consent||!Number.isSafeInteger(Number(page))');
    expect(ui).toContain('if(visionBusy || busy || !canEdit || !file || !pageImage || !consent ||');
    expect(ui).toContain('setOcrDraft(true);setOcrVerified(false);setMethod("visual_double_transcription")');
  });
  it("preserva a autorização opcional do trecho e não ativa nem salva regras",()=>{
    expect(ui).toContain('data-urban-matrix-text-consent="true"');
    expect(ui).toContain('aria-label="Autorizar envio do trecho textual à IA"');
    expect(ui).not.toContain("activateUrbanRegulation(");
  });
});
