import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const draftsPage = read("src/pages/saas/ExternalDraftsPage.tsx");
const controlPage = read("src/pages/saas/ExternalProcessControlPage.tsx");
const dashboard = read("src/pages/saas/ExternalPortalPage.tsx");
const finalSequenceMigration = read(
  "neon/migrations/20261018_zz_protocol_sequence_after_payment_final.sql",
);

describe("external in-progress preprotocols", () => {
  it("shows submitted unpaid preprotocols together with local drafts", () => {
    expect(draftsPage).toContain("usePlatformData");
    expect(draftsPage).toContain("provisionalProcesses");
    expect(draftsPage).toContain('process.isOfficial === false');
    expect(draftsPage).toContain('data-external-in-progress-preprotocol="true"');
    expect(draftsPage).toContain("Aguardando pagamento");
    expect(draftsPage).toContain("Ver guia e pagar");
    expect(draftsPage).toContain("/externo/pagamentos?preprotocolo=");
  });

  it("shows only a provisional reference before payment and never reserves the municipal PM sequence", () => {
    expect(draftsPage).toContain("Referência temporária:");
    expect(draftsPage).toContain("Ainda não existe número de processo municipal");
    expect(draftsPage).toContain("a numeração oficial será gerada automaticamente somente após a compensação");
    expect(finalSequenceMigration).toContain("O pré-protocolo NÃO toca no contador oficial PM");
    expect(finalSequenceMigration).toContain("gen_random_uuid()");
    expect(finalSequenceMigration).toContain("_official_protocol := public.next_tenant_protocol_number");
    expect(finalSequenceMigration).toContain("somente depois da compensacao da guia inicial");
    expect(finalSequenceMigration).not.toContain("return 'PRE-'||_official_reserved");
  });

  it("counts unpaid preprotocols in Em andamento across control and dashboard", () => {
    expect(controlPage).toContain("provisionalProcesses");
    expect(controlPage).toContain("inProgressCount");
    expect(controlPage).toContain("savedDrafts.length + provisionalProcesses.length");
    expect(dashboard).toContain("provisionalProcesses.length");
  });
});
