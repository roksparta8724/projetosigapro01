import { afterEach, describe, expect, it, vi } from "vitest";
import { safeAvatarUrlInQa } from "../lib/qaAvatarIsolation";

afterEach(() => vi.unstubAllEnvs());

describe("SIGAPRO QA UserAvatar image source isolation", () => {
  it.each([
    "https://sigapromunicipal.com.br/avatars/a.png",
    "https://old-project.supabase.co/storage/v1/object/public/avatars/a.png",
    "https://foo.r2.cloudflarestorage.com/avatars/a.png",
    "//sigapromunicipal.com.br/img.png",
    "blob:https://sigapromunicipal.com.br/hidden",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "javascript:alert(1)",
  ])("blocks production and remote avatar source %s", source => {
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
    expect(safeAvatarUrlInQa(source)).toBe("");
  });
  it("preserves only local QA image previews and safe data images", () => {
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
    expect(safeAvatarUrlInQa("/assets/placeholder.png")).toBe("/assets/placeholder.png");
    expect(safeAvatarUrlInQa("data:image/png;base64,QUJD")).toBe("data:image/png;base64,QUJD");
    expect(safeAvatarUrlInQa("/\\\\evil.example/asset.png")).toBe("");
  });
  it("does not alter official profile image URLs", () => {
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "false");
    const url="https://old-project.supabase.co/storage/v1/object/public/avatars/a.png";
    expect(safeAvatarUrlInQa(url)).toBe(url);
  });
});
