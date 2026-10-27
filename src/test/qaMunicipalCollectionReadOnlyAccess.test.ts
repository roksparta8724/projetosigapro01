import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../server/municipal-storage.js", () => ({ callDataApiRpc: mocked.rpc }));
import handler from "../../api/collection-configuration";

const qaBranch = "qa/sigapro-ia-logo-integrado-20261023";
const municipalityId = "49dac0b6-6352-4744-9aab-9ff91c59d970";
function request(action: string, opts: { token?: boolean; method?: string } = {}) {
  const req = {
    method: opts.method || "POST",
    headers: opts.token === false ? {} : { authorization: "Bearer mock-qa-jwt" },
    body: { municipalityId, action },
  };
  let jsonBody: Record<string, unknown> = {};
  const res = {
    statusCode: 200,
    setHeader: vi.fn(),
    end: vi.fn((s: string) => { jsonBody = JSON.parse(s); }),
  };
  return handler(req as never, res as never).then(() => ({ status: res.statusCode, body: jsonBody }));
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("VERCEL_ENV","preview");
  vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED","true");
  vi.stubEnv("VERCEL_GIT_COMMIT_REF",qaBranch);
  mocked.rpc.mockResolvedValue({ ok: true, status:200, payload:{status:"configured",mode:"sigapro"},error:"" });
});
afterEach(() => vi.unstubAllEnvs());
describe("SIGAPRO QA arrecadação: tenant read allowed, financial writes locked", () => {
  it.each([
    ["get","get_municipal_collection_configuration_v1"],
    ["effective","get_active_municipal_collection_configuration_v1"],
    ["bank_get","get_municipal_collection_bank_details_v1"],
  ])("permits authenticated scoped read %s via Neon RPC", async (action, rpc) => {
    const result = await request(action);
    expect(result.status).toBe(200);
    expect(mocked.rpc).toHaveBeenCalledOnce();
    expect(mocked.rpc.mock.calls[0][1]).toBe(rpc);
    expect(mocked.rpc.mock.calls[0][2]).toMatchObject({_municipality_id:municipalityId});
  });
  it.each(["save","validate","activate","bank_save","attach"])(
    "rejects %s mutation without any RPC call in QA", async action => {
      const r = await request(action);
      expect(r.status).toBe(503);
      expect(r.body.code).toBe("QA_COLLECTION_WRITES_DISABLED");
      expect(mocked.rpc).not.toHaveBeenCalled();
    });
  it("denies unauthenticated QA reads", async () => {
    const r = await request("get",{token:false});
    expect(r.status).toBe(401);
    expect(r.body.code).toBe("QA_AUTH_REQUIRED");
    expect(mocked.rpc).not.toHaveBeenCalled();
  });
  it("denies reads from another preview branch even with QA flag present", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_REF","feature/random");
    const r=await request("get");
    expect(r.status).toBe(503);
    expect(r.body.code).toBe("QA_COLLECTION_ISOLATION_REQUIRED");
    expect(mocked.rpc).not.toHaveBeenCalled();
  });
  it("denies a misconfigured preview that did not isolate its Neon database", async () => {
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED","false");
    const r=await request("get");
    expect(r.status).toBe(503);
    expect(mocked.rpc).not.toHaveBeenCalled();
  });
  it("keeps production handler outside the QA guard",async()=>{
    vi.stubEnv("VERCEL_ENV","production");
    vi.stubEnv("VERCEL_GIT_COMMIT_REF","main");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED","false");
    const r=await request("get");
    expect(r.status).toBe(200);
    expect(mocked.rpc).toHaveBeenCalledOnce();
  });
});
