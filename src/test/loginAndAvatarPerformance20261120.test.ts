import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { readAvatarAccessToken } from "@/lib/privateAvatarRead";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({
    data: { session: { access_token: "TEST_ONLY_AUTH_TOKEN" } },
    error: null,
  })),
}));
vi.mock("@/integrations/backend/databaseClient", () => ({
  backendClient: { auth: { getSession: auth.getSession } },
}));

const source = (path: string) => readFileSync(path, "utf8");
afterEach(() => vi.clearAllMocks());

describe("SIGAPRO — login rápido e fotos privadas sem leituras redundantes", () => {
  it("coalesce a consulta de token de muitas fotos sem reutilizar token antigo", async () => {
    const one = readAvatarAccessToken();
    const two = readAvatarAccessToken();
    const three = readAvatarAccessToken();
    expect(await Promise.all([one, two, three])).toEqual([
      "TEST_ONLY_AUTH_TOKEN", "TEST_ONLY_AUTH_TOKEN", "TEST_ONLY_AUTH_TOKEN",
    ]);
    expect(auth.getSession).toHaveBeenCalledTimes(1);
    await readAvatarAccessToken();
    expect(auth.getSession).toHaveBeenCalledTimes(2);
  });

  it("erro de sessão não cria cache de token nem permite foto anônima", async () => {
    auth.getSession.mockResolvedValueOnce({ data: { session: null }, error: null } as never);
    await expect(readAvatarAccessToken()).rejects.toThrow("Sessão necessária");
    await expect(readAvatarAccessToken()).resolves.toBe("TEST_ONLY_AUTH_TOKEN");
    expect(auth.getSession).toHaveBeenCalledTimes(2);
  });

  it("não espera baixar página para liberar rota após validação real do município/contrato", () => {
    const access = source("src/pages/saas/AcessoPage.tsx");
    expect(access).not.toContain("preloadLoginLanding(landingPath)");
    expect(access).not.toContain("const landingPath = getRoleLandingPath(role)");
    expect(access).toContain("const decision = await verifyLoginLandingAccess(");
    expect(access).toContain("navigate(decision.path, { replace: true })");
    expect(access).not.toContain("await Promise.all([");
    const check = source("src/lib/loginLandingAccess.ts");
    expect(check).toContain('rpc("has_tenant_access"');
    expect(check).toContain('rpc("assert_municipality_entitlement_v1"');
  });

  it("reutiliza bundle do subdomínio somente para o mesmo município do perfil autenticado", () => {
    const bootstrap = source("src/hooks/useAppBootstrap.tsx");
    expect(bootstrap).toContain('hostMunicipalityAtSignIn?.municipality?.id === nextProfile?.municipalityId');
    expect(bootstrap).toContain('await loadCurrentMunicipalityBundle({');
    expect(bootstrap).toContain("Esta conta não está vinculada à Prefeitura deste subdomínio.");
    expect(bootstrap).toContain('backendClient.rpc("get_current_profile_context")');
    const gateway = source("src/hooks/useAuthGateway.tsx");
    expect(gateway).toContain("clearAuthorizedAvatarRuntimeCache()");
  });

  it("protege fotos com Bearer e mantém arquivos exclusivamente na memória do usuário atual", () => {
    const avatar = source("src/lib/privateAvatarRead.ts");
    expect(avatar).toContain("Authorization: \"Bearer \" + token");
    expect(avatar).toContain('cache: "no-store"');
    expect(avatar).toContain("readAvatarAccessToken()");
    expect(avatar).toContain("URL.revokeObjectURL(temporaryUrl)");
    const mem = source("src/lib/authorizedAvatarRuntimeCache.ts");
    expect(mem).toContain("if (activeOwner && activeOwner !== owner) clearAuthorizedAvatarRuntimeCache()");
    expect(mem).not.toContain("localStorage.setItem");
  });
});
