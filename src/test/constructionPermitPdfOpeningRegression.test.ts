import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(resolve(process.cwd(), file), "utf8");

describe("construction permit PDF opening", () => {
  const pdf = read("src/lib/constructionPermitPdf.ts");
  const panel = read("src/components/platform/ConstructionPermitPanel.tsx");

  it("keeps a real browser tab handle and navigates it to the native PDF viewer", () => {
    expect(pdf).toContain("reserveConstructionPermitPdfWindow");
    expect(pdf).toMatch(/window\.open\(\s*["']about:blank["']/);
    expect(pdf).toContain("opened.opener = null");
    expect(pdf).toContain("opened.location.replace(url)");
    expect(pdf).not.toContain("fallback.download");
    expect(pdf).not.toContain("fallback.click()");
  });

  it("reserves the PDF tab before the asynchronous manual-signature persistence flow", () => {
    const reserveIndex = panel.indexOf("reserveConstructionPermitPdfWindow");
    const busyIndex = panel.indexOf('setWorkflowBusy("manual")', reserveIndex);

    expect(reserveIndex).toBeGreaterThanOrEqual(0);
    expect(busyIndex).toBeGreaterThan(reserveIndex);
    expect(panel).toContain("await openPdf(next, true, reservedPdfWindow)");
  });

  it("keeps the explicit manual-signature option for the Director", () => {
    expect(panel).toContain("Abrir PDF do Alvará");
    expect(panel).toContain("Gerar PDF do Alvará para assinatura à caneta");
    expect(panel).toContain("assinatura manual");
    expect(panel).toContain("openPdf(next, true, reservedPdfWindow)");
  });
});
