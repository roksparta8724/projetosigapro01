import { afterEach, describe, expect, it, vi } from "vitest";
import { createItiSandboxAuthorization, exchangeItiSandboxCode, requestItiSandboxPkcs7, readItiSandboxCertificate } from "./iti-signature-sandbox";
const config = { municipalityId: "11111111-1111-4111-8111-111111111111", clientId: "test-client", clientSecret: "test-secret", redirectUri: "https://prefeitura.example.gov.br/callback" };
afterEach(() => vi.unstubAllGlobals());
describe("ITI sandbox signature transport", () => {
  it("uses exclusive scopes and random correlation values without exposing client secret", () => {
    const a = createItiSandboxAuthorization(config, "govbr");
    const b = createItiSandboxAuthorization(config, "icp_brasil");
    expect(new URL(a.url).searchParams.get("scope")).toBe("sign govbr");
    expect(new URL(b.url).searchParams.get("scope")).toBe("sign icp_brasil");
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.url).not.toContain(config.clientSecret);
    expect(new URL(a.url).hostname).toBe("cas.staging.iti.br");
    expect(a.municipalityId).toBe(config.municipalityId);
    expect(() => createItiSandboxAuthorization({...config, redirectUri:"http://example.org"}, "govbr")).toThrow();
    expect(() => createItiSandboxAuthorization({...config, municipalityId:"other"}, "govbr")).toThrow();
  });
  it("exchanges code only on the official sandbox host and refuses redirects", async () => {
    const mock = vi.fn(async (url: URL, init: RequestInit) => {
      expect(url.href).toBe("https://cas.staging.iti.br/oauth2.0/token");
      expect(init.redirect).toBe("error");
      expect((init.body as URLSearchParams).get("client_secret")).toBe("test-secret");
      return new Response(JSON.stringify({ access_token: "token", token_type: "Bearer" }), {headers:{"content-type":"application/json"}});
    });
    vi.stubGlobal("fetch", mock);
    expect(await exchangeItiSandboxCode(config, "code")).toBe("token");
    expect(mock).toHaveBeenCalledOnce();
  });
  it("sends the exact 32-byte digest and rejects invalid or oversized payloads", async () => {
    const mock = vi.fn(async (url: URL, init: RequestInit) => {
      expect(url.pathname).toBe("/externo/v2/assinarPKCS7");
      expect(init.redirect).toBe("error");
      expect(JSON.parse(String(init.body))).toEqual({ hashBase64: Buffer.alloc(32, 7).toString("base64") });
      return new Response(Uint8Array.from([0x30,...Array(31).fill(0)]));
    });
    vi.stubGlobal("fetch", mock);
    await expect(requestItiSandboxPkcs7("token", new Uint8Array(31))).rejects.toThrow();
    expect(mock).not.toHaveBeenCalled();
    expect((await requestItiSandboxPkcs7("token", Buffer.alloc(32, 7))).length).toBe(32);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(1024*1024+1))));
    await expect(requestItiSandboxPkcs7("token", new Uint8Array(32))).rejects.toThrow(/limite/);
  });
  it("rejects non-PEM certificates, rejected responses and malformed tokens", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("invalid")));
    await expect(readItiSandboxCertificate("token")).rejects.toThrow();
    await expect(exchangeItiSandboxCode(config, "code")).rejects.toThrow();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("denied", {status:403})));
    await expect(requestItiSandboxPkcs7("token", new Uint8Array(32))).rejects.toThrow(/403/);
  });
});
