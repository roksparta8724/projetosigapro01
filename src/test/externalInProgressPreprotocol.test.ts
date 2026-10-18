import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const draftsPage = read("src/pages/saas/ExternalDraftsPage.tsx");
const controlPage = read("src/pages/saas/ExternalProcessControlPage.tsx");
const dashboard = read("src/pages/saas/ExternalPortalPage.tsx");
const sequenceMigration = read(
  "neon/migrations/20261018_single_protocol_sequence_reservation.sql",
);

describe("external in-progress preprotocols", () => {
  it("shows submitted unpaid preprotocols together with local drafts", () => {
    expect(draftsPage).toContain("usePlatformData");
    expect(draftsPage).toContain("provisionalProcesses");
    expect(draftsPage).toContain('process.isOfficial === false');
    expect(draftsPage).toContain('data-external-in-progress-preprotocol="true"');
    expect(draftsPage).toContain("Aguardando pagamento");
    expect(draftsPage).toContain("Pagar e continuar");
    expect(draftsPage).toContain("/externo/pagamentos?preprotocolo=");
  });

  it("shows the reserved municipal sequence without pretending the unpaid item is official", () => {
    expect(draftsPage).toContain("Sequência municipal reservada");
    expect(draftsPage).toContain("Após a compensação, este mesmo número será oficializado");
    expect(draftsPage).toContain("reservedOfficialProtocol");
    expect(sequenceMigration).toContain("return 'PRE-'||_official_reserved");
    expect(sequenceMigration).toContain("reserved_sequence");
  });

  it("counts unpaid preprotocols in Em andamento across control and dashboard", () => {
    expect(controlPage).toContain("provisionalProcesses");
    expect(controlPage).toContain("inProgressCount");
    expect(controlPage).toContain("savedDrafts.length + provisionalProcesses.length");
    expect(dashboard).toContain("provisionalProcesses.length");
  });
});
