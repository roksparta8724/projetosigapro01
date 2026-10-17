import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("production login bootstrap", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/integrations/backend/platformImpl.ts"),
    "utf8",
  );
  const start = source.indexOf("export async function loadRemotePlatformStore()");
  const end = source.indexOf("\nexport ", start + 10);
  const bootstrap = source.slice(start, end > start ? end : undefined);

  it("never SELECTs the RPC-only construction permit table directly", () => {
    expect(bootstrap).not.toContain('db.from("process_construction_permits")');
    expect(bootstrap).toContain('db.rpc("get_construction_permit_v1"');
  });

  it("does not make last-access telemetry fatal", () => {
    const errorListStart = bootstrap.indexOf("const errors = [");
    const errorListEnd = bootstrap.indexOf("].filter(Boolean)", errorListStart);
    const fatalErrors = bootstrap.slice(errorListStart, errorListEnd);

    expect(fatalErrors).not.toContain("lastAccessResult.error");
  });
});
