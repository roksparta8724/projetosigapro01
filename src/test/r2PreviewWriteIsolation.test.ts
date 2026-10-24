import { afterEach, describe, expect, it, vi } from "vitest";

const upload = vi.hoisted(() => vi.fn());
const remove = vi.hoisted(() => vi.fn());
vi.mock("../../server/api/r2-upload.js", () => ({ default: upload }));
vi.mock("../../server/api/r2-delete.js", () => ({ default: remove }));
vi.mock("../../server/api/r2-list-user-files.js", () => ({ default: vi.fn() }));
vi.mock("../../server/api/r2-master-logo-source.js", () => ({ default: vi.fn() }));
vi.mock("../../server/api/profile-avatar-open.js", () => ({ default: vi.fn() }));
vi.mock("../../server/api/r2-sign-get.js", () => ({ default: vi.fn() }));
import handler from "../../api/r2";

function response() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: "",
    setHeader(key: string, value: string) { this.headers[key] = value; },
    end(value: string) { this.body = value; },
  };
  return res;
}
afterEach(() => { vi.unstubAllEnvs(); upload.mockReset(); remove.mockReset(); });

describe("isolated Vercel QA must not touch official R2", () => {
  it.each(["upload", "delete", "sign-get", "list-user-files", "master-logo-source", "profile-avatar-open"])("rejects %s before storage handler", async action => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
    const res = response();
    await handler({ url: "/api/r2?action=" + action, method: "POST" } as never, res as never);
    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).code).toBe("QA_R2_WRITE_DISABLED");
    expect(upload).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
  it("does not block official environment", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VITE_SIGAPRO_NEON_ISOLATED", "true");
    const res = response();
    await handler({ url: "/api/r2?action=upload", method: "POST" } as never, res as never);
    expect(upload).toHaveBeenCalledTimes(1);
  });
});
