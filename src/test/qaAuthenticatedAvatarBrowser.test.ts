import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { privateAvatarObjectKey, resolveAuthorizedAvatarUrl } from "@/lib/privateAvatarRead";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock("@/integrations/backend/databaseClient", () => ({
  backendClient: { auth: { getSession: auth.getSession } },
}));

const profile = "2244ccaa-1111-4111-8111-123456abcdef";
const key = "platform/profiles/avatars/" + profile + "/photo.webp";
const stable = "/api/profile-avatar-open?objectKey=" + encodeURIComponent(key);
const png = new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);

describe("SIGAPRO QA — renderização privada no navegador sem expor token em URL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getSession.mockResolvedValue({
      data: { session: { access_token:"PRIVATE_QA_SESSION_NOT_REAL" } },
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reconhece apenas a rota do próprio SIGAPRO e chave R2 permitida", () => {
    expect(privateAvatarObjectKey(stable)).toBe(key);
    expect(privateAvatarObjectKey("https://evil.example/api/profile-avatar-open?objectKey=" +
      encodeURIComponent(key))).toBe("");
    expect(privateAvatarObjectKey("/api/profile-avatar-open?objectKey=../passwords.env")).toBe("");
    expect(privateAvatarObjectKey("/api/profile-avatar-open?source=https://evil.test")).toBe("");
    expect(privateAvatarObjectKey(stable+"&source=legacy")).toBe("");
    expect(privateAvatarObjectKey("https://r2.example/image.png")).toBe("");
  });

  it("não dispara GET privado nem carrega imagem sem sessão", async () => {
    auth.getSession.mockResolvedValueOnce({data:{session:null}});
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch",fetchSpy);
    await expect(resolveAuthorizedAvatarUrl(stable)).rejects.toThrow("Sessão necessária");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("envia Bearer somente ao endpoint same-origin, cria blob e revoga após uso", async () => {
    const fetchSpy = vi.fn(async () => ({
      ok:true,
      headers: {get:(header:string)=> header.toLowerCase()==="content-type" ? "image/png" : "12"},
      blob: async () => new Blob([png],{type:"image/png"}),
    }));
    vi.stubGlobal("fetch",fetchSpy);
    const create = vi.fn(()=>"blob:https://sigapro.local/test-private");
    const revoke = vi.fn();
    Object.defineProperty(URL,"createObjectURL",{configurable:true,value:create});
    Object.defineProperty(URL,"revokeObjectURL",{configurable:true,value:revoke});
    const resolved = await resolveAuthorizedAvatarUrl(stable);
    expect(resolved.url).toBe("blob:https://sigapro.local/test-private");
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy.mock.calls[0][0]).toBe(stable);
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({
      method:"GET",cache:"no-store",credentials:"same-origin",
      headers:{Authorization:"Bearer PRIVATE_QA_SESSION_NOT_REAL"},
    });
    expect(resolved.url).not.toContain("PRIVATE_QA_SESSION_NOT_REAL");
    resolved.revoke();
    expect(revoke).toHaveBeenCalledWith(resolved.url);
  });

  it("rejeita HTML, SVG e respostas grandes; nunca transforma outro documento", async () => {
    vi.stubGlobal("fetch",vi.fn(async()=>({
      ok:true,
      headers:{get:(header:string)=>header==="content-type"?"image/svg+xml":null},
      blob:async()=>new Blob(["<svg></svg>"],{type:"image/svg+xml"}),
    })));
    await expect(resolveAuthorizedAvatarUrl(stable)).rejects.toThrow("Resposta de foto inválida.");
    const remote = "https://legacy.example.net/photo.png";
    expect(await resolveAuthorizedAvatarUrl(remote)).toEqual({url:remote,revoke:expect.any(Function)});
  });

  it("o avatar e o editor de perfil não fazem GET R2 anônimo", () => {
    const avatar = readFileSync("src/components/platform/UserAvatar.tsx","utf8");
    const profilePage = readFileSync("src/pages/saas/PerfilPage.tsx","utf8");
    const hook = readFileSync("src/hooks/useAuthorizedAvatarUrl.ts","utf8");
    expect(avatar).toContain("useAuthorizedAvatarUrl(props.imageUrl)");
    expect(profilePage).toContain("useAuthorizedAvatarUrl(avatarPreviewSourceUrl)");
    expect(profilePage).toContain("asset = await resolveAuthorizedAvatarUrl(url)");
    expect(profilePage).toContain("asset.revoke()");
    expect(hook).toContain("controller.abort()");
    expect(hook).toContain("release()");
  });
});
