import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("payment guide historical integrity", () => {
  const migration = read("neon/migrations/20261019_payment_guide_historical_integrity.sql");
  const processDetail = read("src/pages/saas/ProcessDetailPage.tsx");
  const financeProtocols = read("src/pages/saas/FinanceProtocolsPage.tsx");
  const guideDocument = read("src/components/GuiaRecolhimentoOficial.tsx");
  const mercadoPago = read("src/lib/mercadoPagoGuide.ts");
  const platform = read("src/integrations/backend/platformImpl.ts");

  it("persists immutable civil issue and payment dates in the database", () => {
    expect(migration).toContain("add column if not exists issued_on date");
    expect(migration).toContain("add column if not exists paid_on date");
    expect(migration).toContain("new.created_at := old.created_at");
    expect(migration).toContain("new.issued_on := old.issued_on");
    expect(migration).toContain("new.paid_at := old.paid_at");
    expect(migration).toContain("new.paid_on := old.paid_on");
  });

  it("loads the official civil dates instead of inventing them in the UI", () => {
    expect(platform).toContain("issuedOn: guide.issued_on");
    expect(platform).toContain("paidOn: guide.paid_on");
    expect(processDetail).toContain("selectedGuide.issuedOn");
    expect(processDetail).toContain("dataDocumento: issuedOn");
    expect(financeProtocols).toContain("match.guide.issuedOn");
    expect(financeProtocols).toContain("dataDocumento: persistedIssuedOn");
  });

  it("formats YYYY-MM-DD as a civil date without timezone drift", () => {
    expect(guideDocument).toContain("const civilDate = raw.match");
    expect(guideDocument).toContain("civilDate[3]");
    expect(guideDocument).toContain("civilDate[2]");
    expect(guideDocument).toContain("civilDate[1]");
  });

  it("never creates a fresh boleto while merely viewing a compensated guide", () => {
    expect(processDetail).toContain('if (guide.status === "compensada") continue;');
    expect(processDetail).toContain("allowCreate: !guide.bankReference");
    expect(mercadoPago).toContain("if (input.allowCreate === false)");
    expect(mercadoPago).toContain("A guia histórica não possui dados bancários persistidos suficientes");
  });

  it("opens an old paid copy without fabricating missing bank data", () => {
    expect(processDetail).toContain('selectedGuide.status !== "compensada"');
    expect(processDetail).toContain("Cópia histórica aberta com a emissão e a baixa originais");
    expect(processDetail).toContain("não criará uma nova cobrança");
  });
});
