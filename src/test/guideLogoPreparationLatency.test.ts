// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareGuideInstitutionalLogo } from "@/lib/guideAssets";

afterEach(() => vi.unstubAllGlobals());

describe("SIGAPRO — avoid boleto PDF waiting on sequential unavailable crests", () => {
  it("starts every independent logo check without waiting for a blocked one", async () => {
    const replies = new Map<string, (response: { ok: boolean }) => void>();
    const mockFetch = vi.fn((request: string) =>
      new Promise<{ ok: boolean }>((resolve) => replies.set(String(request), resolve)),
    );
    vi.stubGlobal("fetch", mockFetch);
    const image = "data:text/plain;base64,VGVzdCBvbmx5";
    const pending = prepareGuideInstitutionalLogo(
      "https://qa.invalid/logo-one.png",
      "https://qa.invalid/logo-two.png",
      image,
    );
    // The second request must be issued while the first is still unresolved.
    // The former sequential loop only issued a single request at this point.
    expect(mockFetch).toHaveBeenCalledTimes(2);
    replies.get("https://qa.invalid/logo-two.png")?.({ ok: false });
    replies.get("https://qa.invalid/logo-one.png")?.({ ok: false });
    expect(await pending).toBe(image);
  });

  it("preserves official municipality priority and skips duplicate URLs", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      requests.push(String(url));
      return { ok: false };
    }));
    const fallback = "data:text/plain;base64,U0lHQV BSTyBRQQ==";
    expect(await prepareGuideInstitutionalLogo(
      "https://qa.invalid/logo-primary",
      "https://qa.invalid/logo-primary",
      "https://qa.invalid/logo-footer",
      fallback,
    )).toBe(fallback);
    expect(requests).toEqual([
      "https://qa.invalid/logo-primary",
      "https://qa.invalid/logo-footer",
    ]);
  });

  it("never puts a rejected QA logo endpoint into a printed PDF", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503 })));
    expect(await prepareGuideInstitutionalLogo(
      "https://qa.invalid/api/municipality-logo-open?objectKey=unavailable",
    )).toBe("");
  });
});
