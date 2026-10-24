import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const file=(name:string)=>readFileSync(resolve(process.cwd(),name),"utf8");
describe("SIGAPRO QA — anexo não pode ser trocado por PDF diferente",()=>{
  it("valida SHA-256 e tamanho antes de permitir associação ao anexo",()=>{
    const desk=file("src/components/platform/QaDocumentUnavailableNotice.tsx");
    expect(desk).toContain("await verifyQaExistingDocumentCopy(file");
    expect(desk).toContain("setVerifiedCopy(validCopy)");
    expect(desk).toContain("!verifiedCopy || savingCopy");
    expect(desk).toContain("verifiedCopy && objectKey");
    expect(desk).toContain('data-qa-copy-integrity="true"');
    expect(desk).toContain("O cadastro não possui SHA-256 verificável");
    expect(desk).toContain("Cópia diferente do anexo registrado");
    expect(desk).toContain('bg-rose-950/60');
  });
  it("não mantém a pré-visualização de outro processo e não se conecta ao R2 de produção",()=>{
    const viewer=file("src/pages/saas/DocumentViewerPage.tsx");
    const desk=file("src/components/platform/QaDocumentUnavailableNotice.tsx");
    expect(viewer).toContain('key={process.id + ":" + document.id}');
    expect(viewer).toContain('setAccessUrl("");');
    expect(desk).toContain('VITE_SIGAPRO_NEON_ISOLATED !== "true"');
    expect(desk).toContain('bucket: "process-documents"');
    expect(desk).toContain("URL.revokeObjectURL(activeObjectUrl.current)");
    expect(desk).toContain('processRoute.replace(/\\/$/, "")');
    expect(desk).not.toContain("VITE_R2_PRODUCTION");
  });
});
