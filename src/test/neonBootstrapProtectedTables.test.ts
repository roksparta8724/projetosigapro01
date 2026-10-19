import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Neon bootstrap protected relations", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/integrations/backend/platformImpl.ts"),
    "utf8",
  );

  const start = source.indexOf("export async function loadRemotePlatformStore(");
  const end = source.indexOf("\nexport ", start + 10);
  const bootstrap = source.slice(start, end > start ? end : undefined);

  it("never performs a direct SELECT on the RPC-only construction permit table", () => {
    expect(bootstrap).not.toContain('db.from("process_construction_permits")');
    expect(bootstrap).toContain('db.rpc("get_construction_permit_v1"');
  });

  it("does not make last-access telemetry fatal to login", () => {
    expect(bootstrap).toContain("Telemetria de último acesso indisponível; login segue normalmente.");
    expect(bootstrap).toContain("console.warn");
    expect(bootstrap).not.toContain("throw lastAccessResult.error");
    expect(bootstrap).not.toContain("throw new Error(lastAccessResult.error");
  });
});
