import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const lifecycleMigration = read(
  "neon/migrations/20261018_preprotocol_payment_officialization.sql",
);
const hardeningMigration = read(
  "neon/migrations/20261018_preprotocol_flow_hardening.sql",
);
const queueMigration = read(
  "neon/migrations/20261018_preprotocol_protocol_desk.sql",
);
const sharedSequenceMigration = read(
  "neon/migrations/20261018_habite_se_shared_protocol_sequence_guard.sql",
);
const trueDraftMigration = read(
  "neon/migrations/20261018_preprotocol_true_draft_flow.sql",
);
const draftRecoveryMigration = read(
  "neon/migrations/20261018_preprotocol_draft_recovery_refinement.sql",
);
const notificationMigration = read(
  "neon/migrations/20261018_preprotocol_external_payment_notification.sql",
);
const protocolPage = read("src/pages/saas/ProtocolarProjetoPage.tsx");
const paymentsPage = read("src/pages/saas/ExternalPaymentsPage.tsx");
const draftsPage = read("src/pages/saas/ExternalDraftsPage.tsx");
const controlPage = read("src/pages/saas/ExternalProcessControlPage.tsx");
const historyPage = read("src/pages/saas/ExternalHistoryPage.tsx");
const dashboardPage = read("src/pages/saas/ExternalPortalPage.tsx");
const protocolDesk = read("src/pages/saas/ProtocolDeskPage.tsx");
const municipalRegistry = read("src/pages/saas/MunicipalProcessRegistryPage.tsx");
const dashboardHome = read("src/pages/saas/DashboardHomePage.tsx");
const platformImpl = read("src/integrations/backend/platformImpl.ts");

describe("payment-first pre-protocol officialization", () => {
  it("keeps the unpaid pre-protocol outside the official municipal sequence", () => {
    expect(trueDraftMigration).toContain(
      "A sequência oficial só é consumida após a compensação da guia inicial",
    );
    expect(trueDraftMigration).toContain("gen_random_uuid()");
    expect(trueDraftMigration).toContain("'PRE-' || _normalized_prefix");
    expect(trueDraftMigration).toContain(
      "A numeração oficial nasce somente agora, depois do pagamento",
    );
    expect(lifecycleMigration).toContain("'pagamento_pendente'");
    expect(lifecycleMigration).toContain("'Portal Externo'");
    expect(protocolPage).toContain("/externo/pagamentos?preprotocolo=");
    expect(protocolPage).toContain(
      "o processo entra na Prefeitura somente depois da compensação do pagamento",
    );
  });

  it("serializes official numbering atomically when the initial guide is paid", () => {
    expect(lifecycleMigration).toContain("pg_advisory_xact_lock");
    expect(lifecycleMigration).toContain("next_tenant_protocol_number");
    expect(lifecycleMigration).toContain(
      "aaa_officialize_preprotocol_after_payment_v1",
    );
    expect(lifecycleMigration).toContain(
      "officialized_by_payment_guide_id",
    );
  });

  it("keeps project and Habite-se on one official PM sequence generated only after payment", () => {
    expect(sharedSequenceMigration).toContain(
      "Habite-se usa a MESMA sequencia oficial dos demais protocolos",
    );
    expect(trueDraftMigration).toContain(
      "_official_protocol := public.next_tenant_protocol_number",
    );
    expect(trueDraftMigration).toContain(
      "sem reservar numeracao antes da compensacao",
    );
    expect(trueDraftMigration).toContain(
      "Libera do contador oficial somente reservas que nunca viraram processo",
    );
  });

  it("keeps unpaid Habite-se out of Prefeitura dashboards and the municipal process registry", () => {
    expect(municipalRegistry).toContain("process.isOfficial !== false");
    expect(dashboardHome).toContain(
      "processes.filter((process) => process.isOfficial !== false)",
    );
    expect(dashboardHome).toContain("officialProcesses");
  });

  it("keeps provisional submissions out of municipal process access and notifications", () => {
    expect(lifecycleMigration).toContain("pr.officialized_at is null");
    expect(lifecycleMigration).toContain("pr.officialized_at is not null");
    expect(hardeningMigration).toContain("if new.officialized_at is null then");
    expect(hardeningMigration).toContain(
      "if new.officialized_at is not null then",
    );
    expect(notificationMigration).toContain(
      "/externo/pagamentos?preprotocolo=",
    );
  });

  it("polls payment state and keeps a provisional item editable without opening it as an official process", () => {
    expect(paymentsPage).toContain("setInterval(refresh, 8000)");
    expect(paymentsPage).toContain("process.isOfficial === false");
    expect(paymentsPage).toContain('data-preprotocol-edit-action="true"');
    expect(paymentsPage).toContain('data-preprotocol-guide-action="true"');
    expect(paymentsPage).toContain("Visualizar guia");
    expect(draftsPage).toContain("Editar rascunho");
    expect(draftsPage).toContain("Ainda não existe número de processo municipal");
    expect(controlPage).toContain("process.isOfficial !== false");
    expect(historyPage).toContain("process.isOfficial !== false");
    expect(dashboardPage).toContain("process.isOfficial !== false");
  });

  it("recovers and updates the same remote draft while the guide is unpaid", () => {
    expect(platformImpl).toContain("create_external_process_v4");
    expect(platformImpl).toContain("getRemoteExternalPreprotocolDraft");
    expect(protocolPage).toContain("remotePreProtocolNumber");
    expect(protocolPage).toContain("Salvar alterações do rascunho");
    expect(protocolPage).toContain("requestedProtocolNumber: remotePreProtocolNumber || null");
    expect(draftRecoveryMigration).toContain("get_external_preprotocol_draft_v1");
    expect(draftRecoveryMigration).toContain("update_external_preprotocol_draft_v1");
  });

  it("gives Protocolo a dedicated payment queue without exposing provisional rows as processes", () => {
    expect(queueMigration).toContain(
      "list_pending_preprotocol_payments_v1",
    );
    expect(queueMigration).toContain("confirm_preprotocol_payment_v1");
    expect(protocolDesk).toContain("pendingPreprotocolPayments");
    expect(protocolDesk).toContain(
      "Confirmar pagamento e criar processo",
    );
    expect(protocolDesk).toContain("refreshPreprotocolPayments");
    expect(platformImpl).toContain(
      "listRemotePendingPreprotocolPayments",
    );
    expect(platformImpl).toContain(
      "confirmRemotePreprotocolPayment",
    );
  });

  it("makes paid triage completion ready for dispatch instead of asking for payment again", () => {
    expect(hardeningMigration).toContain(
      "'pagamento_confirmado'::public.process_status",
    );
    expect(hardeningMigration).toContain("Pronto para Despacho");
    expect(protocolDesk).toContain(
      "Como a guia inicial já está compensada, o processo está pronto para despacho ao Urbanismo",
    );
  });
});
