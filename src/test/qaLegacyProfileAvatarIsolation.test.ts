import { afterEach, describe, expect, it, vi } from "vitest";
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

async function getAvatar(qa: boolean) {
  vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", qa ? "true" : "false");
  vi.resetModules();
  return (await import("../integrations/r2/client")).getLegacyProfileAvatarOpenUrl;
}

describe("SIGAPRO QA copied profile avatars do not fetch official external files", () => {
  it.each([
    "https://old-project.supabase.co/storage/v1/object/public/avatars/old.jpg",
    "https://sigapromunicipal.com.br/avatars/profile.png",
    "https://docs.r2.cloudflarestorage.com/photo.png",
    "http://example.invalid/avatar.png",
    "//example.invalid/avatar.png",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "blob:https://sigapromunicipal.com.br/sensitive",
    "javascript:alert(1)",
  ])("blocks external QA avatar source %s", async source => {
    const open = await getAvatar(true);
    expect(open(source)).toBe("");
  });

  it("keeps relative QA profile previews and endpoints", async () => {
    const open = await getAvatar(true);
    expect(open("/qa-placeholder.svg")).toBe("/qa-placeholder.svg");
    expect(open("/api/profile-avatar-open?objectKey=qa")).toBe("/api/profile-avatar-open?objectKey=qa");
  });

  it("does not change official legacy Supabase avatar behavior", async () => {
    const open = await getAvatar(false);
    const legacy="https://old-project.supabase.co/storage/v1/object/public/avatars/p.png";
    expect(open(legacy)).toBe(legacy);
  });
});
