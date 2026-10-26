import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const processPage = readFileSync("src/pages/saas/ProcessDetailPage.tsx", "utf8");
const external = readFileSync("src/pages/saas/ExternalPaymentsPage.tsx", "utf8");

describe("SIGAPRO premium workflow: stable process list and safe financial polling", () => {
  it("does not run competing 1.5s and 1.8s database refresh loops", () => {
    expect(processPage).toContain("intervalMs: 12000");
    expect(processPage).toContain("syncExactProcess(), 6000");
    expect(processPage).not.toContain("intervalMs: 1800");
    expect(processPage).not.toContain("syncExactProcess(), 1500");
    expect(processPage).toContain('window.addEventListener("sigapro:data-changed", syncExactProcess as EventListener)');
  });

  it("keeps the previously verified process on transient errors instead of clearing the screen", () => {
    const sync = processPage.slice(
      processPage.indexOf("const syncExactProcess = async"),
      processPage.indexOf("const onVisible = () =>"),
    );
    expect(sync).toContain("disposed ||");
    expect(sync).toContain("inFlight ||");
    expect(sync).toContain("if (disposed) return");
    expect(sync).toContain("if (error) {");
    expect(sync).toContain("reportedSyncFailure = true");
    expect(sync).toContain("} catch (error) {");
    expect(sync).toContain("inFlight = false");
    expect(sync).not.toContain("setCachedProcessVisual(undefined)");
  });

  it("never overlaps finance polls or lets a background network failure reject unchecked", () => {
    const financePoll = external.slice(
      external.indexOf("// Enquanto existe guia inicial pendente"),
      external.indexOf("  const guides = useMemo"),
    );
    expect(financePoll).toContain("if (disposed || inFlight || document.visibilityState !==");
    expect(financePoll).toContain(".catch((error: unknown) =>");
    expect(financePoll).toContain(".finally(() => { inFlight = false; })");
    expect(financePoll).toContain("window.clearInterval(timer)");
    expect(financePoll).toContain('window.addEventListener("focus", refresh)');
    expect(financePoll).toContain('document.addEventListener("visibilitychange", refresh)');
  });

  it("checks persisted Neon guide and its exact process before an issuer POST", () => {
    const boleto = external.slice(
      external.indexOf("const issueSandboxBoleto = async"),
      external.indexOf("const issueSandboxPix = async"),
    );
    const pix = external.slice(
      external.indexOf("const issueSandboxPix = async"),
      external.indexOf("const openExternalGuide = async"),
    );
    for (const section of [boleto, pix]) {
      const read = section.indexOf("const current = await readGuideOriginal(effectiveScopeId, guide.code)");
      const settled = section.indexOf("if (isGuideSettled(current))");
      expect(read).toBeGreaterThan(0);
      expect(settled).toBeGreaterThan(read);
      expect(section).toContain("current.process_id !== process.id");
      expect(section).toContain("current.municipality_id !== effectiveScopeId");
    }
    expect(boleto.indexOf("current.bank_reference || current.original_pdf_key"))
      .toBeLessThan(boleto.indexOf("const charge = await ensureMercadoPagoGuideCharge"));
    expect(boleto).toContain("nenhuma nova cobrança foi emitida");
    expect(pix.indexOf("if (isGuideSettled(current))")).toBeLessThan(
      pix.indexOf("result=await requestQaPixCharge("),
    );
  });
});
