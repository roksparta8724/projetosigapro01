import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sw = readFileSync("public/sigapro-sw.js", "utf8");
const main = readFileSync("src/main.tsx", "utf8");
describe("SIGAPRO — Chrome F5 with fresh deploy and fast first HTML paint", () => {
  it("starts network preload on moving previews and official production hosts", () => {
    expect(sw).toContain("const IS_MUTABLE_PREVIEW_ALIAS =");
    expect(sw).toContain("const IS_MUTABLE_APP_HOST = !IS_SIGAPRO_PREVIEW || IS_MUTABLE_PREVIEW_ALIAS;");
    expect(sw).toContain("self.registration?.navigationPreload?.enable?.()");
    expect(sw).toContain("preloaded = await event.preloadResponse;");
    expect(sw).toContain('if (IS_MUTABLE_APP_HOST || isIdentityRoute)');
    expect(sw).toContain('cache: "no-store", credentials: "same-origin"');
    expect(sw).toContain("await isVerifiedPublicAppDocument(response)");
  });
  it("allows cache-first public HTML only for immutable, pinned deployment previews", () => {
    expect(sw).toContain("const IS_SIGAPRO_PREVIEW =");
    expect(sw).toContain("if (IS_MUTABLE_APP_HOST || isIdentityRoute)");
    expect(sw).toContain("if (await isVerifiedPublicAppDocument(cached))");
    expect(sw).toContain("event.waitUntil(updatePublicDocumentCache())");
    expect(sw).toContain("if (IS_SIGAPRO_PREVIEW) return Response.error()");
  });
  it("installs Service Worker just after the actual first React paint", () => {
    expect(main).toContain("prepareWorkerAfterFirstPaint");
    expect(main).toContain('document.addEventListener("DOMContentLoaded", prepareWorkerAfterFirstPaint');
    expect(main).toContain("window.requestAnimationFrame(() => {");
    expect(main).toContain('register("/sigapro-sw.js", { updateViaCache: "none" })');
    expect(main).not.toContain('window.addEventListener("load", () => {\n    navigator.serviceWorker.addEventListener');
  });
  it("never caches private avatars, protected PDFs or official process content", () => {
    expect(sw).toContain('url.pathname === "/api/profile-avatar-open"');
    expect(sw).toContain('url.pathname === "/api/municipality-logo-open"');
    expect(sw).toContain('!url.pathname.startsWith("/api/")');
    expect(sw).toContain('request.mode === "navigate"');
    expect(sw).toContain('url.pathname.startsWith("/assets/")');
  });
});
