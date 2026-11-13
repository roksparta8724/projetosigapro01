import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeR2Delete } from "../../server/api/r2-delete";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const mine = "a1111111-1111-4111-8111-111111111111";
const other = "b2222222-2222-4222-8222-222222222222";
const req = { headers: { authorization: "Bearer restricted-user-token" } } as
  Parameters<typeof authorizeR2Delete>[0];
const avatar = (tenant: string, owner: string) =>
  `municipalities/${tenant}/profiles/avatars/${owner}/avatar.png`;
const branding = (tenant: string) => `municipalities/${tenant}/branding/municipal.png`;

afterEach(() => vi.unstubAllGlobals());

function mockRpcs(answers: Record<string, unknown>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const fn = String(url).split("/rpc/")[1] || "";
    calls.push(fn);
    return { ok: true, status: 200, json: async () => answers[fn] ?? false };
  }));
  return calls;
}

describe("SIGAPRO R2 deletion: reject overly broad tenant authorization", () => {
  it("blocks physical process-document deletion, including signed PDFs and DAM originals", async () => {
    const calls = mockRpcs({ has_tenant_access: true, is_master: true });
    for (const key of [
      `municipalities/${a}/protocols/${mine}/deed.pdf`,
      `municipalities/${a}/analysis-signed-fiches/${mine}/signed.pdf`,
      `municipalities/${a}/processes/p/dam-originals/g/sha.pdf`,
      `municipalities/${a}/legislation/zoning.pdf`,
    ]) {
      const result = await authorizeR2Delete(req, "sigapro-documentos", key, a, mine);
      expect(result).toMatchObject({ ok: false, status: 409 });
    }
    expect(calls).toEqual([]);
  });

  it("allows only the actual profile owner to remove an avatar as non-admin", async () => {
    const calls = mockRpcs({ has_tenant_access: true, is_municipality_admin: false, is_master: false });
    expect(await authorizeR2Delete(req, "sigapro-logos", avatar(a, mine), a, mine))
      .toEqual({ ok: true });
    expect(await authorizeR2Delete(req, "sigapro-logos", avatar(a, other), a, mine))
      .toMatchObject({ ok: false, status: 403 });
    expect(calls).toEqual(["has_tenant_access","has_tenant_access","is_municipality_admin","is_master"]);
  });

  it("denies a regular municipality employee deleting institutional branding", async () => {
    mockRpcs({ has_tenant_access: true, is_municipality_admin: false, is_master: false });
    expect(await authorizeR2Delete(req, "sigapro-logos", branding(a), a, mine))
      .toMatchObject({ ok: false, status: 403 });
  });

  it("allows municipal administrators only after a valid same-tenant membership", async () => {
    mockRpcs({ has_tenant_access: true, is_municipality_admin: true });
    expect(await authorizeR2Delete(req, "sigapro-logos", branding(a), a, mine))
      .toEqual({ ok: true });
    const calls = mockRpcs({ has_tenant_access: false, is_municipality_admin: true });
    expect(await authorizeR2Delete(req, "sigapro-logos", branding(b), b, mine))
      .toMatchObject({ ok: false, status: 403 });
    expect(calls).toEqual(["has_tenant_access"]);
  });

  it("denies tenantless logo deletion for anyone other than platform master", async () => {
    mockRpcs({ is_master: false });
    expect(await authorizeR2Delete(req, "sigapro-logos", "legacy-profile-avatars/a.png", "", mine))
      .toMatchObject({ ok: false, status: 403 });
    mockRpcs({ is_master: true });
    expect(await authorizeR2Delete(req, "sigapro-logos", "legacy-profile-avatars/a.png", "", mine))
      .toEqual({ ok: true });
  });

  it("fails closed if RLS/membership RPC is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await authorizeR2Delete(req, "sigapro-logos", branding(a), a, mine))
      .toMatchObject({ ok: false, status: 403 });
  });
});
