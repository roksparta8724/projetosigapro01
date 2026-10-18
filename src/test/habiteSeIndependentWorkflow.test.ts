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
  const financeDesk = finance;
  const financeProtocols = read("src/pages/saas/FinanceProtocolsPage.tsx");
  const store = read("src/hooks/usePlatformData.tsx");
  const panel = read("src/components/platform/OccupancyPermitProcessPanel.tsx");
  const externalDrafts = read("src/pages/saas/ExternalDraftsPage.tsx");
  const financeMigration = read("neon/migrations/20261018_habite_se_finance_after_inspection.sql");
  const autoAdvanceMigration = read("neon/migrations/20261018_habite_se_auto_advance_to_inspection.sql");
  const inspectionPanel = read("src/components/platform/HabiteSeInspectionPanel.tsx");
  const inspectionClient = read("src/integrations/backend/habiteSeInspectionClient.ts");
  const databaseClient = read("src/integrations/backend/databaseClient.ts");
  const inspectionMigration = read("neon/migrations/20261018_habite_se_inspection_evidence.sql");

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
    expect(panel).toContain("Vistoria / conferência em andamento");
    expect(panel).toContain("Termo de Vistoria abaixo");
    expect(panel).toContain("não reutiliza a guia de aprovação/Alvará");
  });

  it("waits for the authenticated Neon session before loading or saving the inspection", () => {
    expect(processDetail).toContain("dataReadyForCurrentUser");
    expect(processDetail).toContain("!platformDataLoading");
    expect(panel).toContain("dataReady={dataReady}");
    expect(inspectionPanel).toContain("if (!process.id || !dataReady) return");
    expect(inspectionPanel).toContain("Validando sessão segura da Fiscalização");
    expect(inspectionClient).toContain("ensureAuthenticatedDatabaseSession");
    expect(inspectionClient).toContain("for (let attempt = 0; attempt < 8; attempt += 1)");
    expect(inspectionClient).toContain("databaseErrorMessage");
    expect(inspectionClient).toContain("callInspectionRpc");
    expect(databaseClient).toContain("export const neonDataApiUrl = NEON_DATA_API_URL");
    expect(inspectionClient).toContain("neonDataApiUrl");
    expect(inspectionClient).toContain("body: JSON.stringify(args)");
    expect(inspectionClient).toContain("PGRST202");
    expect(inspectionClient).toContain("for (let attempt = 0; attempt < 5; attempt += 1)");
  });

  it("uses an institutional inspection term with photographic evidence before Financeiro", () => {
    expect(panel).toContain("<HabiteSeInspectionPanel");
    expect(inspectionPanel).toContain("Termo de Vistoria / Conferência — Habite-se");
    expect(inspectionPanel).toContain("Checklist técnico da vistoria");
    expect(inspectionPanel).toContain("Evidências fotográficas da vistoria");
    expect(inspectionPanel).toContain("Concluir conforme e encaminhar ao Financeiro");
    expect(inspectionPanel).toContain("Concluir com pendências");
    expect(inspectionPanel).toContain("Justificar vistoria sem evidência fotográfica");
    expect(inspectionClient).toContain("uploadHabiteSeInspectionPhoto");
    expect(inspectionClient).toContain("completeHabiteSeInspection");
    expect(inspectionMigration).toContain("process_habite_se_inspection_photos");
    expect(inspectionMigration).toContain("Fotos são evidência complementar");
    expect(inspectionMigration).not.toContain("Anexe ao menos 3 evidências fotográficas");
    expect(inspectionMigration).toContain("request_habite_se_payment_guide_v1");
    expect(inspectionMigration).toContain("Pendências da vistoria do Habite-se");
  });

  it("matches the Analysis/Ficha Técnica selection language in the inspection checklist", () => {
    expect(inspectionPanel).toContain('data-habite-se-inspection-checklist="true"');
    expect(inspectionPanel).toContain('data-habite-se-inspection-legend="true"');
    expect(inspectionPanel).toContain('data-inspection-status={option.value}');
    expect(inspectionPanel).toContain('data-selected={selected ? "true" : "false"}');
    expect(inspectionPanel).toContain('aria-pressed={selected}');
    expect(inspectionPanel).toContain("border-emerald-800 bg-emerald-600 !text-white");
    expect(inspectionPanel).toContain("border-amber-800 bg-amber-600 !text-white");
    expect(inspectionPanel).toContain("border-slate-800 bg-slate-700 !text-white");
    expect(inspectionPanel).toContain('selected ? <CheckCircle2');
    expect(inspectionPanel).toContain('[item.key]: selected ? "" : option.value');
  });

  it("locks the inspection term after the process leaves Fiscalização", () => {
    expect(inspectionMigration).toContain("'analista'");
    expect(inspectionMigration).toContain("'prefeitura_supervisor'");
    expect(inspectionMigration).toContain("'setor_intersetorial'");
    expect(inspectionMigration).toContain("_folder ~ '(fiscal|vistoria|inspec|conferencia)'");
    expect(inspectionMigration).not.toContain("fiscal|vistoria|inspec|conferencia|financ|decis|emiss");
    expect(inspectionPanel).toContain("const readOnly = externalView || !canManage");
  });

  it("surfaces Habite-se requests to the Financeiro before the guide exists", () => {
    expect(financeDesk).toContain('data-finance-habite-se-pending-queue="true"');
    expect(financeDesk).toContain("Habite-se aguardando emissão pelo Financeiro");
    expect(financeDesk).toContain("Abrir e emitir Guia de Habite-se");
    expect(financeProtocols).toContain('if (kind === "habite_se") return "Guia de Habite-se"');
    expect(financeProtocols).toContain('if (kind === "habite_se") return "Emissão e baixa: Financeiro"');
  });

  it("automatically advances a fully completed Habite-se analysis to Fiscalização / Vistoria", () => {
    expect(autoAdvanceMigration).toContain("try_advance_habite_se_to_inspection_v1");
    expect(autoAdvanceMigration).toContain("pending_documents");
    expect(autoAdvanceMigration).toContain("analysis_sheet_pending");
    expect(autoAdvanceMigration).toContain("Análise documental concluída — Vistoria / conferência");
    expect(autoAdvanceMigration).toContain("current_department='Fiscalização'");
    expect(autoAdvanceMigration).toContain("current_queue='Vistoria / conferência'");
    expect(autoAdvanceMigration).toContain("trg_try_advance_habite_se_from_document_v1");
    expect(autoAdvanceMigration).toContain("trg_try_advance_habite_se_from_requirement_v1");
    expect(autoAdvanceMigration).toContain("trg_try_advance_habite_se_from_analysis_sheet_v1");
    expect(processDetail).toContain('"Vistoria / conferência"');
  });

  it("keeps Habite-se finance separated and inserts Financeiro after inspection", () => {
    expect(platform).toContain('"habite_se"');
    expect(processDetail).toContain("Financeiro do protocolo de Habite-se");
    expect(processDetail).toContain("Guia de Pagamento do Habite-se");
    expect(processDetail).not.toContain("handleRequestHabiteSeFinance");
    expect(processDetail).toContain("handleIssueHabiteSeGuide");
    expect(processDetail).toContain("handleConfirmHabiteSePayment");
    const inspectionStageIndex = panel.indexOf('label: "Vistoria / conferência"');
    const financeStageIndex = panel.indexOf('label: "Financeiro"');
    const decisionStageIndex = panel.indexOf('label: "Decisão / emissão"');
    expect(inspectionStageIndex).toBeGreaterThanOrEqual(0);
    expect(financeStageIndex).toBeGreaterThan(inspectionStageIndex);
    expect(decisionStageIndex).toBeGreaterThan(financeStageIndex);
    expect(financeMigration).toContain("request_habite_se_payment_guide_v1");
    expect(financeMigration).toContain("issue_habite_se_payment_guide_v1");
    expect(financeMigration).toContain("'habite_se'");
    expect(financeMigration).toContain("Decisão / emissão do Habite-se");
  });
});
