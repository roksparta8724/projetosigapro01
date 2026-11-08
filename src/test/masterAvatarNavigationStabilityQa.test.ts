import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  clearAuthorizedAvatarRuntimeCache,
  getAuthorizedAvatarRuntimeUrl,
  loadAuthorizedAvatarRuntimeUrl,
} from "@/lib/authorizedAvatarRuntimeCache";

const mocks = vi.hoisted(() => ({
  fetchAuthorized: vi.fn(),
}));
vi.mock("@/lib/privateAvatarRead", () => ({
  privateAvatarObjectKey: (source: string) =>
    /^\/api\/profile-avatar-open\?objectKey=/.test(source) ? "authorized-avatar" : "",
  resolveAuthorizedAvatarUrl: mocks.fetchAuthorized,
}));
const source = "/api/profile-avatar-open?objectKey=platform%2Fprofiles%2Favatars%2F123%2Fphoto.webp";

describe("SIGAPRO Master — foto estável ao mudar de página com isolamento da sessão", () => {
  beforeEach(() => {
    clearAuthorizedAvatarRuntimeCache();
    mocks.fetchAuthorized.mockReset();
  });

  it("reutiliza a mesma foto privada sem nova requisição ao navegar", async () => {
    const revoke = vi.fn();
    mocks.fetchAuthorized.mockResolvedValue({ url: "blob:master-account/photo", revoke });
    const first = await loadAuthorizedAvatarRuntimeUrl("master-1", source);
    const next = await loadAuthorizedAvatarRuntimeUrl("master-1", source);
    expect(first).toBe("blob:master-account/photo");
    expect(next).toBe(first);
    expect(getAuthorizedAvatarRuntimeUrl("master-1", source)).toBe(first);
    expect(mocks.fetchAuthorized).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled();
    clearAuthorizedAvatarRuntimeCache();
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it("nunca reutiliza uma foto de outra conta e revoga a anterior", async () => {
    const revoke1 = vi.fn();
    const revoke2 = vi.fn();
    mocks.fetchAuthorized
      .mockResolvedValueOnce({ url: "blob:first/photo", revoke: revoke1 })
      .mockResolvedValueOnce({ url: "blob:second/photo", revoke: revoke2 });
    await loadAuthorizedAvatarRuntimeUrl("account-1", source);
    expect(getAuthorizedAvatarRuntimeUrl("account-2", source)).toBe("");
    expect(await loadAuthorizedAvatarRuntimeUrl("account-2", source)).toBe("blob:second/photo");
    expect(revoke1).toHaveBeenCalledOnce();
    expect(getAuthorizedAvatarRuntimeUrl("account-1", source)).toBe("");
  });

  it("descarta respostas privadas tardias após logout", async () => {
    let finish!: (value: { url: string; revoke: () => void }) => void;
    mocks.fetchAuthorized.mockImplementation(() =>
      new Promise((resolve) => { finish = resolve; }));
    const waiting = loadAuthorizedAvatarRuntimeUrl("master-1", source);
    clearAuthorizedAvatarRuntimeCache();
    const revoke = vi.fn();
    finish({ url: "blob:expired-session/photo", revoke });
    expect(await waiting).toBe("");
    expect(revoke).toHaveBeenCalledOnce();
    expect(getAuthorizedAvatarRuntimeUrl("master-1", source)).toBe("");
  });

  it("mantém o perfil independente do município e limpa as fotos ao sair", () => {
    const frame = readFileSync("src/components/platform/PortalFrame.tsx", "utf8");
    const hook = readFileSync("src/hooks/useAuthorizedAvatarUrl.ts", "utf8");
    const auth = readFileSync("src/hooks/useAuthGateway.tsx", "utf8");
    expect(frame).toContain("const authenticatedAvatarOwnerId = authenticatedUserId || authenticatedProfileId");
    expect(frame).toContain("readCachedProfileAvatar(signedInProfileId, authenticatedEmail)");
    expect(frame).toContain("authenticatedOwnerId={authenticatedAvatarOwnerId}");
    expect(frame).not.toContain('key={`${authenticatedProfileId || session.id}:${activeInstitutionId || "global"}`}');
    expect(hook).toContain("getAuthorizedAvatarRuntimeUrl(owner, raw)");
    expect(auth).toContain("clearAuthorizedAvatarRuntimeCache();");
    expect(auth).toContain("lastAuthenticatedId.current !== current");
  });

  it("não tenta armazenar URLs externas ou fontes vazias no cache privado", async () => {
    expect(await loadAuthorizedAvatarRuntimeUrl("master-1", "")).toBe("");
    expect(await loadAuthorizedAvatarRuntimeUrl("master-1", "https://example.test/image.png")).toBe("");
    expect(await loadAuthorizedAvatarRuntimeUrl("", source)).toBe("");
    expect(mocks.fetchAuthorized).not.toHaveBeenCalled();
  });
});
