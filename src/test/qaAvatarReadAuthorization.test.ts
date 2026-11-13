import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { authorizePrivateAvatarRead, enforceAuthenticatedAvatarRead, parsePrivateAvatarObjectKey } from "../../server/avatar-access";
import { authorizeR2LogoRead } from "../../server/api/r2-sign-get";
import { callDataApiRpc } from "../../server/municipal-storage";

vi.mock("../../server/municipal-storage.js", async () => ({
  callDataApiRpc: vi.fn(),
  readBearer: (req: { headers?: { authorization?: string } }) =>
    req.headers?.authorization?.startsWith("Bearer ") ?
      req.headers.authorization.slice(7) : "",
  getDataApiUrl: () => "https://data-api.qa.invalid/rest/v1",
  resolveMunicipalDocumentTarget: vi.fn(async () => null),
}));

const municipality = "49dac0b6-6352-4744-9aab-9ff91c59d970";
const owner = "2244ccaa-1111-4111-8111-123456abcdef";
const other = "1244ccaa-1111-4111-8111-123456abcdef";
const municipal = "municipalities/" + municipality + "/profiles/avatars/" + owner + "/portrait.webp";
const master = "platform/profiles/avatars/" + owner + "/portrait.webp";
const session = { headers: { authorization: "Bearer QA_TEST_SESSION" } };
const anonymous = { headers: {} };
const success = (payload: unknown) => ({ok:true,status:200,payload,error:""});
const denied = (status=403) => ({ok:false,status,payload:null,error:""});

describe("SIGAPRO QA — leitura de foto privada vinculada ao perfil", () => {
  beforeEach(() => vi.resetAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("reconhece apenas chaves de avatar e nunca objetos de outras pastas", () => {
    expect(parsePrivateAvatarObjectKey(master)).toMatchObject({profileId:owner,municipalityId:null});
    expect(parsePrivateAvatarObjectKey(municipal)).toMatchObject({profileId:owner,municipalityId:municipality});
    for (const bad of [
      "platform/branding/logo.webp",
      "municipalities/" + municipality + "/documents/" + owner + "/secret.pdf",
      "municipalities/" + municipality + "/profiles/avatars/" + owner + "/../private.png",
      "platform/profiles/avatars/user/../../secret.env",
    ]) expect(parsePrivateAvatarObjectKey(bad)).toBeNull();
  });

  it("nega leitura anônima antes de consultar o Neon", async () => {
    expect(await authorizePrivateAvatarRead(anonymous as never,municipal))
      .toMatchObject({ok:false,status:401});
    expect(callDataApiRpc).not.toHaveBeenCalled();
  });

  it("autoriza somente o dono com perfil canônico autenticado", async () => {
    vi.mocked(callDataApiRpc).mockResolvedValueOnce(success(owner));
    expect(await authorizePrivateAvatarRead(session as never,municipal))
      .toMatchObject({ok:true});
    expect(vi.mocked(callDataApiRpc).mock.calls.map(c=>c[1])).toEqual(["current_profile_id"]);
  });

  it("autoriza conta Master autenticada a visualizar outra foto", async () => {
    vi.mocked(callDataApiRpc)
      .mockResolvedValueOnce(success(other))
      .mockResolvedValueOnce(success(true));
    expect(await authorizePrivateAvatarRead(session as never,master)).toMatchObject({ok:true});
  });

  it("administrador precisa ser da própria Prefeitura, não basta ser do sistema", async () => {
    vi.mocked(callDataApiRpc)
      .mockResolvedValueOnce(success(other))
      .mockResolvedValueOnce(success(false))
      .mockResolvedValueOnce(success(true))
      .mockResolvedValueOnce(success(false));
    expect(await authorizePrivateAvatarRead(session as never,municipal))
      .toMatchObject({ok:false,status:403});
    expect(vi.mocked(callDataApiRpc).mock.calls.at(-1)?.[2])
      .toEqual({target_tenant:municipality});
  });

  it("permite admin municipal autenticado com acesso comprovado ao mesmo tenant", async () => {
    vi.mocked(callDataApiRpc)
      .mockResolvedValueOnce(success(other))
      .mockResolvedValueOnce(success(false))
      .mockResolvedValueOnce(success(true))
      .mockResolvedValueOnce(success(true));
    expect(await authorizePrivateAvatarRead(session as never,municipal)).toMatchObject({ok:true});
  });

  it("não fornece foto de outro usuário nem por assinatura de bucket logos", async () => {
    vi.mocked(callDataApiRpc)
      .mockResolvedValueOnce(success(other))
      .mockResolvedValueOnce(success(false))
      .mockResolvedValueOnce(success(false));
    expect(await authorizeR2LogoRead(session as never,municipal))
      .toMatchObject({ok:false,status:403});
  });

  it("falha fechado em erro de sessão e habilita o bloqueio somente no preview isolado", async () => {
    vi.mocked(callDataApiRpc).mockResolvedValueOnce(denied(503));
    expect(await authorizePrivateAvatarRead(session as never,municipal))
      .toMatchObject({ok:false,status:503});
    const qa = {VERCEL_ENV:"preview",VERCEL_GIT_COMMIT_REF:"fix/qa-triagem-analise-pagamento-20261101"};
    expect(enforceAuthenticatedAvatarRead(qa)).toBe(true);
    expect(enforceAuthenticatedAvatarRead({...qa,VERCEL_ENV:"production"})).toBe(false);
    expect(enforceAuthenticatedAvatarRead({...qa,VERCEL_GIT_COMMIT_REF:"main"})).toBe(false);
  });

  it("proteção GET roda antes da leitura R2; PDFs e branding permanecem separados", () => {
    const open = readFileSync("server/api/profile-avatar-open.ts", "utf8");
    const sign = readFileSync("server/api/r2-sign-get.ts", "utf8");
    const idx = open.indexOf("if (enforceAuthenticatedAvatarRead())");
    expect(idx).toBeGreaterThan(0);
    expect(open.indexOf("authorizePrivateAvatarRead(req, request.objectKey)",idx))
      .toBeLessThan(open.indexOf("streamAvatarFromAnyClient(clients, bucket, request.objectKey",idx));
    expect(open).toContain("for (const client of clients) client.destroy()");
    expect(sign).toContain("if (isAvatarStoragePath(key)) return authorizePrivateAvatarRead(req, key)");
    expect(sign).toContain("authorizePrivateR2DocumentRead(req, objectKey, municipalityId)");
  });
});
