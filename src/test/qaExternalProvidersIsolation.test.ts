import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import paymentHandler from "../../api/mercadopago";
import storageHandler from "../../api/storage-connection";

function res() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: "",
    setHeader(name: string, value: string) { this.headers[name] = value; },
    end(body?: string) { this.body = body || ""; },
  };
}

afterEach(() => vi.unstubAllEnvs());

describe("SIGAPRO QA prevents real external financial and storage operations", () => {
  function isolated() {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
  }

  it.each(["guide-boleto", "guide-status", "health"])(
    "does not contact Mercado Pago for %s in isolated preview", async action => {
      isolated();
      const reply = res();
      await paymentHandler({ method: action === "health" ? "GET" : "POST",
        url: "/api/mercadopago?action=" + action } as never, reply as never);
      expect(reply.statusCode).toBe(503);
      expect(JSON.parse(reply.body).code).toBe("QA_PAYMENT_PROVIDER_DISABLED");
    });

  it("does not test bank connections with cloned municipality credentials", async () => {
    isolated();
    const reply = res();
    await paymentHandler({ method: "POST", url: "/api/mercadopago?action=payment-connection",
      body: { action: "test", municipalityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } } as never, reply as never);
    expect(reply.statusCode).toBe(503);
    expect(JSON.parse(reply.body).code).toBe("QA_PAYMENT_PROVIDER_DISABLED");
  });

  it("prevents a cloned municipal bucket write test at the API boundary", async () => {
    isolated();
    const reply = res();
    await storageHandler({ method: "POST", url: "/api/storage-connection",
      body: { action: "test", municipalityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } } as never, reply as never);
    expect(reply.statusCode).toBe(503);
    expect(JSON.parse(reply.body).code).toBe("QA_STORAGE_TEST_DISABLED");
  });

  it("guards the underlying storage test helper before creating an S3 client", () => {
    const source = readFileSync("server/municipal-storage.ts", "utf8");
    const start = source.indexOf("export async function testMunicipalStorageConnection(");
    const guard = source.indexOf('process.env.VITE_SIGAPRO_NEON_ISOLATED === "true"', start);
    const s3Call = source.indexOf("const client = buildMunicipalS3Client(config)", start);
    expect(start).toBeGreaterThan(0);
    expect(guard).toBeGreaterThan(start);
    expect(guard).toBeLessThan(s3Call);
    expect(source.slice(guard, s3Call)).toContain("throw new Error");
  });

  it("keeps production request-method checks unchanged", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
    const payReply = res();
    await paymentHandler({ method: "GET", url: "/api/mercadopago?action=guide-boleto" } as never, payReply as never);
    expect(payReply.statusCode).toBe(405);
    const storeReply = res();
    await storageHandler({ method: "DELETE", url: "/api/storage-connection" } as never, storeReply as never);
    expect(storeReply.statusCode).toBe(405);
  });
});
