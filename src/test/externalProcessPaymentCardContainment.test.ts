import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/pages/saas/ExternalProcessControlPage.tsx", "utf8");
const payment = page.split('data-external-payment-guide={guide.kind}')[1]?.split("});")[0] ?? "";

describe("External process payment card premium containment", () => {
  it("gives each payment card a bounded width and clips no sibling status outside", () => {
    expect(payment).toContain("min-w-0 max-w-full overflow-hidden rounded-xl");
    expect(payment).toContain("flex min-w-0 flex-col items-start gap-1.5");
    expect(payment).toContain('data-external-payment-status="true"');
    expect(payment).toContain("max-w-full items-center self-start whitespace-nowrap");
  });

  it("places the reference on its own wrapped row instead of beside the status", () => {
    expect(payment).toContain('data-external-payment-reference="true"');
    expect(payment).toContain("block w-full min-w-0 max-w-full break-all");
    expect(payment).not.toContain("mt-1.5 flex items-center justify-between gap-2");
    expect(payment).not.toContain('className="truncate text-[9px]');
  });

  it("keeps payment name and money inside a responsive flex row", () => {
    expect(payment).toContain("flex min-w-0 flex-wrap items-start justify-between");
    expect(payment).toContain("min-w-0 max-w-full break-words");
    expect(payment).toContain("max-w-full whitespace-nowrap text-[12px]");
  });

  it("does not change persisted payment state or settlement behavior", () => {
    expect(page).toContain("isGuideCompensated(guide.status)");
    expect(page).toContain("getPaymentGuideDisplayReference(process, guide)");
    expect(page).toContain("{formatCurrency(guide.amount)}");
  });
});
