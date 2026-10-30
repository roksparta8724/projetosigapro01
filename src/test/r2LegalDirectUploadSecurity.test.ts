import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  rpc: vi.fn(), bearer: vi.fn(), target: vi.fn(), sign: vi.fn(),
  send: vi.fn(), endpoint: vi.fn(),
}));
vi.mock("../server/municipal-storage.js", () => ({
  callDataApiRpc: mock.rpc, readBearer: mock.bearer, resolveMunicipalDocumentTarget: mock.target,
}));
vi.mock("../server/r2-runtime.js", () => ({ resolveR2Endpoint: mock.endpoint }));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: mock.sign }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class { send(command: unknown) { return mock.send(command); } },
  HeadObjectCommand: class { constructor(public input: unknown) {} },
  PutObjectCommand: class { constructor(public input: unknown) {} },
}));
import handler, { validateLegalUploadInput, MAX_OFFICIAL_LEGAL_PDF_BYTES } from "../api/r2-legal-sign-put";

const tenant = "11111111-1111-4111-8111-111111111111";
const user = "22222222-2222-4222-8222-222222222222";
const revision = "33333333-3333-4333-8333-333333333333";
const objectKey = \`municipalities/\${tenant}/legislation-plano-diretor/\${user}/\${revision}-lei-complementar-613.pdf\`;
const body = { action: "sign", bucket: "process-documents", objectKey,
  fileSize: 51 * 1024 * 1024, contentType: "application/pdf" };
async function call(input: { method?: string; authorization?: string; origin?: string; body?: unknown } = {}) {
  let output: Record<string, unknown> = {};
  const req = { method: input.method || "POST", headers: { host: "sigapromunicipal.com.br",
    ...(input.origin ? { origin: input.origin } : {}) }, body: input.body ?? body };
  mock.bearer.mockReturnValue(input.authorization ?? "jwt");
  const res = { statusCode: 200, setHeader: vi.fn(), end: vi.fn((raw: string) => { output = JSON.parse(raw); }) };
  await handler(req as never, res as never);
  return { status: res.statusCode, output };
}
beforeEach(() => {
  vi.resetAllMocks();
  mock.bearer.mockReturnValue("jwt");
  mock.target.mockResolvedValue(null);
  mock.sign.mockResolvedValue("https://r2.cloudflarestorage.com/signed-upload");
  mock.endpoint.mockReturnValue("https://r2.cloudflarestorage.com");
  mock.send.mockResolvedValue({ ContentLength: body.fileSize, ContentType: "application/pdf" });
  mock.rpc.mockImplementation(async (_req: unknown, fn: string) => ({
    ok: true, status: 200,
    payload: fn === "has_tenant_access" || fn === "is_municipality_admin" || fn === "is_master" ? true : null,
  }));
  vi.stubEnv("R2_ACCESS_KEY_ID", "fake-not-real");
  vi.stubEnv("R2_SECRET_ACCESS_KEY", "fake-not-real");
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("SIGAPRO — direct secure legal PDF upload", () => {
  it("accepts official large PDFs up to 100 MB only in the tenant legislation directory", () => {
    expect(validateLegalUploadInput(body)?.fileSize).toBe(body.fileSize);
    expect(validateLegalUploadInput({ ...body, fileSize: MAX_OFFICIAL_LEGAL_PDF_BYTES + 1 })).toBeNull();
    expect(validateLegalUploadInput({ ...body, objectKey: objectKey.replace(tenant, user) })?.municipalityId).toBe(user);
    expect(validateLegalUploadInput({ ...body, objectKey: objectKey.replace("legislation-plano-diretor", "processes") })).toBeNull();
    expect(validateLegalUploadInput({ ...body, contentType: "image/png" })).toBeNull();
  });
  it("signs one short-lived PUT without receiving the PDF body", async () => {
    const r = await call();
    expect(r.status).toBe(200);
    expect(r.output.uploadUrl).toContain("https://");
    expect(mock.sign).toHaveBeenCalledTimes(1);
    expect(mock.rpc).toHaveBeenCalledWith(expect.anything(), "has_tenant_access", {target_tenant: tenant});
    expect(mock.rpc).toHaveBeenCalledWith(expect.anything(), "assert_municipality_entitlement_v1",
      {_municipality_id: tenant, _capability:"storage_bytes", _increment:body.fileSize});
  });
  it("rejects missing auth, cross-origin requests and wrong methods without signing", async () => {
    expect((await call({ authorization:"" })).status).toBe(401);
    expect((await call({ origin:"https://evil.example" })).status).toBe(403);
    expect((await call({ method:"GET" })).status).toBe(405);
    expect(mock.sign).not.toHaveBeenCalled();
  });
  it("denies tenantless users and users without municipal administrative role", async () => {
    mock.rpc.mockImplementation(async (_req: unknown, fn: string) => ({
      ok: true, payload: fn === "has_tenant_access" ? false : true, status: 200,
    }));
    expect((await call()).status).toBe(403);
    mock.rpc.mockImplementation(async (_req: unknown, fn: string) => ({
      ok:true,status:200,payload:fn === "has_tenant_access" ? true :
        fn === "assert_municipality_entitlement_v1" ? {} : false,
    }));
    expect((await call()).status).toBe(403);
  });
  it("prevents exceeding the municipal storage allowance", async () => {
    mock.rpc.mockImplementation(async (_req:unknown,fn:string) => ({
      ok:fn !== "assert_municipality_entitlement_v1",status:409,payload:true,
    }));
    expect((await call()).status).toBe(403);
    expect(mock.sign).not.toHaveBeenCalled();
  });
  it("confirms the real object size before accepting its permanent R2 reference", async () => {
    const r = await call({ body:{ ...body, action:"verify" } });
    expect(r.status).toBe(200);
    expect(r.output.ok).toBe(true);
    mock.send.mockResolvedValueOnce({ContentLength:5,ContentType:"application/pdf"});
    expect((await call({ body:{...body,action:"verify"} })).status).toBe(409);
  });
});
