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
  const externalDrafts = read("src/pages/saas/ExternalDraftsPage.tsx");
  const financeMigration = read("neon/migrations/20261018_habite_se_finance_after_inspection.sql");

  it("opens Habite-se through its own route and new process mode", () => {
    expect(app).toContain('path="/externo/habite-se"');
    expect(app).toContain('<ProtocolarProjetoPage mode="habite-se" />');
    expect(protocolPage).toContain('mode?: ProtocolEntryMode');
    expect(protocolPage).toContain('const isHabiteSeMode = mode === "habite-se"');
    expect(protocolPage).toContain('"PROCESSO DE HABITE-SE INDEPENDENTE"');
    expect(protocolPage).toContain("standardProcessTypes");
    expect(protocolPage).toContain(
      "Habite-se é um protocolo independente. Use a opção Solicitar Habite-se",
    );
  });

  it("keeps Habite-se drafts isolated from ordinary project drafts", () => {
    expect(protocolDraft).toContain('ProtocolDraftEntryMode = "projeto" | "habite-se"');
    expect(protocolDraft).toContain("inferProtocolDraftEntryMode");
    expect(protocolDraft).toContain('entryMode: inferProtocolDraftEntryMode(payload)');
    expect(protocolDraft).toContain('const prefix = entryMode === "habite-se" ? "HAB" : "PRE"');
    expect(protocolPage).toContain("entryMode: draftEntryMode");
    expect(protocolPage).toContain('const draftStorageFolder = isHabiteSeMode ? "habite-se" : "protocolos"');
    expect(protocolPage).toContain('requestedMode === "habite-se"');
    expect(protocolPage).toContain('"/externo/habite-se"');
  });

  it("resumes each draft from the correct external service", () => {
    expect(externalDrafts).toContain("inferProtocolDraftEntryMode(draft)");
    expect(externalDrafts).toContain('isHabiteSeDraft ? "/externo/habite-se"');
    expect(externalDrafts).toContain('"Continuar Habite-se"');
    expect(externalDrafts).toContain('"Continuar projeto"');
    expect(externalDrafts).toContain("Habite-se independente");
  });

  it("requires an explicit link to the prior approval and permit", () => {
    expect(protocolDraft).toContain("processoAprovacao");
    expect(protocolDraft).toContain("numeroAlvara");
    expect(protocolPage).toContain("Processo de aprovação / regularização de origem");
    expect(protocolPage).toContain("Número do Alvará de origem");
    expect(protocolPage).toContain("área efetivamente concluída");
  });

  it("lets the professional pull an existing SIGAPRO approval and auto-fill the issued permit", () => {
    expect(protocolPage).toContain('data-habite-se-source-process-picker="true"');
    expect(protocolPage).toContain("Puxar processo já aprovado no SIGAPRO");
    expect(protocolPage).toContain("getOfficialConstructionPermit");
    expect(protocolPage).toContain("linkHabiteSeSourceProcess");
    expect(protocolPage).toContain("formatOfficialProcessNumber(source.protocol)");
    expect(protocolPage).toContain("permit.permitNumber");
    expect(protocolPage).toContain("Este processo ainda não possui Alvará oficial emitido e assinado.");
    expect(protocolPage).toContain("os dados oficiais do imóvel foram preenchidos automaticamente");
  });

  it("uses a dedicated Habite-se checklist", () => {
    expect(platform).toContain('processType: "Habite-se"');
    expect(platform).toContain("Alvará de construção ou regularização");
    expect(platform).toContain("Projeto aprovado pela Prefeitura");
    expect(platform).toContain("ART ou RRT de execução ou conclusão da obra");
    expect(platform).toContain('processType: "Carta de Habite-se Parcial"');
    expect(platform).toContain("Planta destacando a etapa concluída");
  });

  it("blocks Habite-se protocol until every mandatory document is persisted", () => {
    const backend = read("src/integrations/backend/platformImpl.ts");
    const migration = read("neon/migrations/20261018_habite_se_submission_preflight.sql");

    expect(protocolPage).toContain('data-habite-se-document-lock="true"');
    expect(protocolPage).toContain('data-protocol-required-documents-locked=');
    expect(protocolPage).toContain("missingRequired.length > 0");
    expect(protocolPage).toContain("Faltam documentos obrigatórios:");
    expect(backend).toContain("validate_habite_se_submission_v1");
    expect(backend).toContain("isOccupancyPermitProcessType(input.type)");
    expect(migration).toContain("Habite-se não pode ser protocolado");
    expect(migration).toContain("Termo de conclusão da obra pelo responsável técnico");
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
    expect(panel).toContain('label: "Financeiro"');
    expect(panel).toContain("Vistoria concluída — seguir para o Financeiro");
    expect(panel).toContain("não reutiliza a guia de aprovação/Alvará");
  });

  it("keeps Habite-se finance separated and inserts Financeiro after inspection", () => {
    expect(platform).toContain('"habite_se"');
    expect(processDetail).toContain("Financeiro do protocolo de Habite-se");
    expect(processDetail).toContain("Guia de Pagamento do Habite-se");
    expect(processDetail).toContain("handleRequestHabiteSeFinance");
    expect(processDetail).toContain("handleIssueHabiteSeGuide");
    expect(processDetail).toContain("handleConfirmHabiteSePayment");
    expect(processDetail).toContain('"Vistoria / conferência",\n        "Financeiro",\n        "Decisão / emissão"');
    expect(financeMigration).toContain("request_habite_se_payment_guide_v1");
    expect(financeMigration).toContain("issue_habite_se_payment_guide_v1");
    expect(financeMigration).toContain("'habite_se'");
    expect(financeMigration).toContain("Decisão / emissão do Habite-se");
  });
});
