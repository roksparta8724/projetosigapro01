import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const protocol = readFileSync(resolve(process.cwd(), "src/pages/saas/ProtocolDeskPage.tsx"), "utf8");

describe("SIGAPRO: payment and triage must not deadlock", () => {
  it("allows confirming a pending guide while triage is not yet completed", () => {
    const start = protocol.indexOf("const handleConfirmProtocolPayment =");
    const end = protocol.indexOf("const handleRecoverPrematureAnalysis =", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const handler = protocol.slice(start, end);
    expect(handler).toContain('guide.kind === "protocolo"');
    expect(handler).toContain('markGuideAsPaid(process.id, session.name, "protocolo")');
    expect(handler).not.toContain('if (process.triage.status !== "concluido")');
  });

  it("still requires completed triage before formal dispatch to analysis", () => {
    const dispatchStart = protocol.indexOf("const handleDispatchToUrbanism =");
    const dispatchEnd = protocol.indexOf("const renderSearchPanel =", dispatchStart);
    const handler = protocol.slice(dispatchStart, dispatchEnd);
    expect(handler).toContain('if (process.triage.status !== "concluido")');
    expect(handler).toContain("getPendingTriageDocuments(process)");
    expect(handler).toContain("hasCompensatedInitialGuide(process)");
    expect(handler).not.toContain('process.status !== "pagamento_confirmado"');
  });
});
