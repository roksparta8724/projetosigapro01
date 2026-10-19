import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readCachedProfileAvatar,
  writeCachedProfileAvatar,
  removeCachedProfileAvatar,
} from "../lib/profileAvatarCache";

describe("avatar cache: real persistence and F5 behavior", () => {
  const entries = new Map<string, string>();
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); },
  };

  beforeEach(() => {
    entries.clear();
    vi.stubGlobal("window", { localStorage: storage });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("recovers a saved avatar in a new read (as after F5)", () => {
    writeCachedProfileAvatar({
      userId: "staff-a", email: "staff@municipio.gov.br",
      avatarUrl: "https://signed.example/avatar", avatarStorageRef: "r2:municipalities/x/profiles/avatars/a",
      avatarScale: 1.3, avatarOffsetX: 8,
    });
    const recovered = readCachedProfileAvatar("staff-a", "staff@municipio.gov.br");
    expect(recovered?.avatarStorageRef).toBe("r2:municipalities/x/profiles/avatars/a");
    expect(recovered?.avatarScale).toBe(1.3);
    expect(recovered?.avatarOffsetX).toBe(8);
  });

  it("never leaks another account's cached image", () => {
    writeCachedProfileAvatar({
      userId: "staff-a", email: "a@municipio.gov.br",
      avatarUrl: "https://signed.example/a", avatarStorageRef: "r2:a",
    });
    expect(readCachedProfileAvatar("staff-b", "b@municipio.gov.br")).toBeNull();
    expect(readCachedProfileAvatar("staff-a", "b@municipio.gov.br")).toBeNull();
  });

  it("invalidates a signed R2 URL older than five hours", () => {
    writeCachedProfileAvatar({
      userId: "staff-a", email: "a@municipio.gov.br",
      avatarUrl: "https://signed.example/a", avatarStorageRef: "r2:a",
    });
    const key = "sigapro.profile-avatar.v2:staff-a";
    const stored = JSON.parse(entries.get(key)!);
    stored.cachedAt = Date.now() - 5 * 60 * 60 * 1000 - 1000;
    entries.set(key, JSON.stringify(stored));
    expect(readCachedProfileAvatar("staff-a", "a@municipio.gov.br")).toBeNull();
    expect(entries.has(key)).toBe(false);
  });

  it("removes persisted display cache when photo is explicitly removed", () => {
    writeCachedProfileAvatar({ userId: "staff-a", avatarUrl: "/photo.png" });
    removeCachedProfileAvatar("staff-a");
    expect(readCachedProfileAvatar("staff-a")).toBeNull();
    writeCachedProfileAvatar({ userId: "staff-a", avatarUrl: "/photo.png" });
    writeCachedProfileAvatar({ userId: "staff-a", avatarUrl: "" });
    expect(readCachedProfileAvatar("staff-a")).toBeNull();
  });
});
