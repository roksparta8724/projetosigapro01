import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { revokeOwnedQaBlobUrl } from "../lib/qaBlobUrl";

describe("SIGAPRO QA document preview blob lifecycle", () => {
  it("releases private browser blob URLs after document change", () => {
    const revoke = vi.fn();
    expect(revokeOwnedQaBlobUrl("blob:https://qa.example/one", revoke)).toBe(true);
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:https://qa.example/one");
  });
  it("never revokes legitimate signed HTTPS links or empty values", () => {
    const revoke = vi.fn();
    expect(revokeOwnedQaBlobUrl("https://example.com/object?signature=1", revoke)).toBe(false);
    expect(revokeOwnedQaBlobUrl("", revoke)).toBe(false);
    expect(revoke).not.toHaveBeenCalled();
  });
  it("discards a late-response blob and cleans up the currently owned blob", () => {
    const source = readFileSync("src/pages/saas/DocumentViewerPage.tsx", "utf8");
    expect(source).toContain('if (cancelled) {\n          // Late responses');
    expect(source).toContain('revokeOwnedQaBlobUrl(url);');
    expect(source).toContain('if (url.startsWith("blob:")) ownedBlobUrl = url;');
    expect(source).toContain('revokeOwnedQaBlobUrl(ownedBlobUrl);');
  });
  it("preserves ownership of prefetched document URLs", () => {
    const source=readFileSync("src/pages/saas/DocumentViewerPage.tsx","utf8");
    expect(source).toContain("if (prefetchedDocumentAccessUrl) {");
    expect(source).toContain("setAccessUrl(prefetchedDocumentAccessUrl)");
  });
});
