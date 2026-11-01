import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const ui=readFileSync("src/components/platform/UrbanLegalMatrixImporter.tsx","utf8");
describe("Importação opcional segura de pacote urbanístico da lei original",()=>{
  it("verifica o hash do PDF e valida o esquema do pacote de revisão",()=>{
    expect(ui).toContain("const actualHash=await verifyPdfAndHash(file)");
    expect(ui).toContain("actualHash!==candidate.arquivo_sha256");
    expect(ui).toContain("candidate.quadro_I.every(validReviewRow)");
    expect(ui).toContain('accept=".json,application/json"');
  });
  it("não grava nem ativa regras ao escolher uma linha",()=>{
    const block=ui.slice(ui.indexOf("const applyReviewRow ="),ui.indexOf("useEffect(() =>",ui.indexOf("const applyReviewRow =")));
    expect(block).toContain("setPage(String(row.pagina_pdf))");
    expect(block).toContain("setZone(normalizeUrbanCode(row.zona_conforme_tabela))");
    expect(block).toContain("setUsage(normalizeUrbanCode(row.uso_predominante_conforme_tabela))");
    expect(block).toContain('setEffectiveFrom("")');
    expect(block).toContain("setCandidates([]);setChecked([]);setConsent(false)");
    expect(block).not.toContain("backendClient.rpc");
    expect(ui).toContain("VIGÊNCIA NÃO VERIFICADA");
  });
});
