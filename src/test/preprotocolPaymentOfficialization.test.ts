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
const notificationMigration = read(
  "neon/migrations/20261018_preprotocol_external_payment_notification.sql",
);
const protocolPage = read("src/pages/saas/ProtocolarProjetoPage.tsx");
const paymentsPage = read("src/pages/saas/ExternalPaymentsPage.tsx");
const controlPage = read("src/pages/saas/ExternalProcessControlPage.tsx");
const historyPage = read("src/pages/saas/ExternalHistoryPage.tsx");
const dashboardPage = read("src/pages/saas/ExternalPortalPage.tsx");
const protocolDesk = read("src/pages/saas/ProtocolDeskPage.tsx");
const municipalRegistry = read("src/pages/saas/MunicipalProcessRegistryPage.tsx");
const dashboardHome = read("src/pages/saas/DashboardHomePage.tsx");
const platformImpl = read("src/integrations/backend/platformImpl.ts");

describe("payment-first pre-protocol officialization", () => {
  it("does not allocate an official municipal process number before payment", () => {
    expect(lifecycleMigration).toContain("next_tenant_preprotocol_number");
    expect(lifecycleMigration).toContain("'pagamento_pendente'");
    expect(lifecycleMigration).toContain("'Portal Externo'");
    expect(lifecycleMigration).toContain("officialized_at");
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

  it("shares the same official PM sequence between project and Habite-se only after payment", () => {
    expect(sharedSequenceMigration).toContain(
      "Habite-se usa a MESMA sequencia oficial dos demais protocolos",
    );
    expect(sharedSequenceMigration).toContain(
      "alter column officialized_at drop default",
    );
    expect(sharedSequenceMigration).toContain(
      "next_tenant_preprotocol_number",
    );
    expect(sharedSequenceMigration).toContain(
      "next_tenant_protocol_number",
    );
    expect(sharedSequenceMigration).toContain(
      "Este contador so e consumido depois do pagamento",
    );
    expect(sharedSequenceMigration).toContain(
      "O processo municipal so pode ser criado depois da confirmacao do pagamento",
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

  it("polls payment state and never opens a provisional item as a process", () => {
    expect(paymentsPage).toContain("setInterval(refresh, 8000)");
    expect(paymentsPage).toContain("process.isOfficial === false");
    expect(paymentsPage).toContain("Aguardando pagamento");
    expect(controlPage).toContain("process.isOfficial !== false");
    expect(historyPage).toContain("process.isOfficial !== false");
    expect(dashboardPage).toContain("process.isOfficial !== false");
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
