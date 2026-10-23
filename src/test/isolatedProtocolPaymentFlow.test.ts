import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path,"utf8");
const devServer = source("vite.config.ts");
const storageClient = source("src/integrations/r2/client.ts");
const protocolPage = source("src/pages/saas/ProtocolarProjetoPage.tsx");
const paymentPage = source("src/pages/saas/ExternalPaymentsPage.tsx");
const qaServer = source("server/qa-document-store.ts");

describe("SIGAPRO isolated pre-protocol to non-payable guide", () => {
  it("intercepts QA uploads BEFORE the general production R2 write block", () => {
    const route = devServer.indexOf("await handleQaDocumentRequest(req, res)");
    const blocked = devServer.indexOf('["/api/mercadopago/guide-boleto"');
    expect(route).toBeGreaterThan(0);
    expect(blocked).toBeGreaterThan(route);
  });

  it("never falls back from localhost QA to a production R2 API base", () => {
    expect(storageClient).toContain('VITE_SIGAPRO_NEON_ISOLATED === "true"');
    expect(storageClient).toContain('if (isolatedQa) return [normalized]');
    expect(storageClient).toContain('if (isolatedQa) return path.startsWith("/")');
  });

  it("always labels isolated protocol and payment preview as not payable", () => {
    expect(protocolPage).toContain('data-qa-protocol-sandbox="true"');
    expect(protocolPage).toContain("NÃO PAGÁVEL");
    expect(paymentPage).toContain("const isolatedQa = import.meta.env.VITE_SIGAPRO_NEON_ISOLATED");
    expect(paymentPage).toContain('const sandboxIssued = savedSandbox || newlyIssued');
    expect(paymentPage).toContain('const barcode = isolatedQa');
    expect(paymentPage).toContain('data-qa-issue-boleto="true"');
    expect(paymentPage).toContain('isolatedSandboxOnly: true');
    expect(paymentPage).toContain('nonPayablePreview: previewOnly');
    expect(paymentPage).toContain('pixPayload: isolatedQa ? ""');
    expect(paymentPage).toContain('bankEnvironment: isolatedQa ? "test"');
  });

  it("never animates the PIX and boleto buttons together and shows feedback at the selected guide", () => {
    expect(paymentPage).toContain('action: "boleto" | "pix" | "guide"');
    expect(paymentPage).toContain('busyGuideAction.action === "boleto"');
    expect(paymentPage).toContain('busyGuideAction.action === "pix"');
    expect(paymentPage).toContain('busyGuideAction.action === "guide"');
    expect(paymentPage).toContain('data-qa-guide-feedback="true"');
    expect(paymentPage).toContain('data-qa-pix-preview="true"');
    expect(paymentPage).toContain('setBusyGuideAction(null)');
    expect(paymentPage).not.toContain('openingGuideKey');
  });

  it("requires authenticated tenant access and signed local PDF URLs", () => {
    expect(qaServer).toContain('"has_tenant_access"');
    expect(qaServer).toContain("timingSafeEqual");
    expect(qaServer).toContain('SIGAPRO_LOCAL_QA_BLOCK_EXTERNAL_WRITES');
    expect(qaServer).not.toContain("R2_ACCESS_KEY_ID");
    expect(qaServer).not.toContain("PutObjectCommand");
  });
});
