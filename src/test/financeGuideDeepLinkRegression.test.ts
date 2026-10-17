import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(resolve(process.cwd(), file), "utf8");

describe("finance guide deep-link", () => {
  const finance = read("src/pages/saas/FinanceDeskPage.tsx");
  const detail = read("src/pages/saas/ProcessDetailPage.tsx");

  it("carries the exact guide code from the finance ledger", () => {
    expect(finance).toContain("guia=${encodeURIComponent(guide.code)}");
    expect(finance).toContain("#guia-selecionada");
  });

  it("resolves and opens the exact requested guide instead of the first guide of the same process", () => {
    expect(detail).toContain('const requestedGuideCode = new URLSearchParams(location.search).get("guia")');
    expect(detail).toContain("paymentGuides.find((guide) => guide.code === requestedGuideCode)");
    expect(detail).toContain('id="guia-selecionada"');
    expect(detail).toContain("data-guide-code={requestedPaymentGuide.code}");
    expect(detail).toContain("printGuide(requestedPaymentGuide.kind, false, requestedPaymentGuide.code)");
  });
});
