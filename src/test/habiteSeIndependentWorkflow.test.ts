import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Habite-se independent workflow", () => {
  const app = read("src/App.tsx");
  const platform = read("src/lib/platform.ts");
  const protocolPage = read("src/pages/saas/ProtocolarProjetoPage.tsx");
  const protocolDraft = read("src/lib/protocolDraft.ts");
  const processDetail = read("src/pages/saas/ProcessDetailPage.tsx");
  const finance = read("src/pages/saas/FinanceDeskPage.tsx");
  const store = read("src/hooks/usePlatformData.tsx");
  const panel = read("src/components/platform/OccupancyPermitProcessPanel.tsx");

  it("opens Habite-se through its own route and new process mode", () => {
    expect(app).toContain('path="/externo/habite-se"');
    expect(app).toContain('<ProtocolarProjetoPage mode="habite-se" />');
    expect(protocolPage).toContain('mode?: ProtocolEntryMode');
    expect(protocolPage).toContain('const isHabiteSeMode = mode === "habite-se"');
    expect(protocolPage).toContain('"PROCESSO DE HABITE-SE INDEPENDENTE"');
  });

  it("requires an explicit link to the prior approval and permit", () => {
    expect(protocolDraft).toContain("processoAprovacao");
    expect(protocolDraft).toContain("numeroAlvara");
    expect(protocolPage).toContain("Processo de aprovação / regularização de origem");
    expect(protocolPage).toContain("Número do Alvará de origem");
    expect(protocolPage).toContain("área efetivamente concluída");
  });

  it("uses a dedicated Habite-se checklist", () => {
    expect(platform).toContain('processType: "Habite-se"');
    expect(platform).toContain("Alvara de construcao ou regularizacao");
    expect(platform).toContain("Projeto aprovado pela Prefeitura");
    expect(platform).toContain("ART ou RRT de execucao ou conclusao da obra");
    expect(platform).toContain('processType: "Carta de Habite-se Parcial"');
    expect(platform).toContain("Planta destacando a etapa concluida");
  });

  it("blocks approval and ISS guides inside a Habite-se process", () => {
    expect(platform).toContain("isOccupancyPermitProcessType");
    expect(store).toContain("isOccupancyPermitProcessType(process.type)");
    expect(store).toContain(
      "Habite-se possui protocolo e workflow próprios",
    );
    expect(finance).toContain(
      "if (isOccupancyPermitProcessType(process.type)) return false",
    );
  });

  it("renders a dedicated Habite-se workflow instead of the Alvara panel", () => {
    expect(processDetail).toContain("isHabiteSeProcess");
    expect(processDetail).toContain("<OccupancyPermitProcessPanel");
    expect(processDetail).toContain(
      'isHabiteSeProcess ? "Habite-se" : "Alvará de Construção"',
    );
    expect(panel).toContain("Processo independente de Habite-se");
    expect(panel).toContain("Workflow do Habite-se");
    expect(panel).toContain("Vistoria / conferência");
    expect(panel).toContain("não reutiliza a guia de aprovação/Alvará");
  });

  it("keeps Habite-se finance separated from approval project finance", () => {
    expect(processDetail).toContain("Financeiro do protocolo de Habite-se");
    expect(processDetail).toContain(
      "Não herda ISSQN, taxa de aprovação",
    );
    expect(processDetail).toContain(
      "Qualquer taxa específica de Habite-se será configurada no workflow próprio",
    );
  });
});
