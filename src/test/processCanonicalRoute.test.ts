import { describe, expect, it } from "vitest";
import {
  buildProcessPath,
  buildProcessRouteKey,
  resolveProcessRoute,
  type ProcessRecord,
} from "@/lib/platform";

const process = {
  id: "33333333-3333-4333-8333-333333333333",
  protocol: "PM-2026-00001",
} as ProcessRecord;

describe("process public route", () => {
  it("never exposes the raw internal UUID when a protocol exists", () => {
    expect(buildProcessRouteKey(process.protocol, process.id)).toBe("PM-2026-00001");
    const path = buildProcessPath(process);
    expect(path).toMatch(/^[/]processos[/]PM-2026-00001--[0-9a-z]{25}$/);
    expect(path).not.toContain(process.id);
    expect(buildProcessPath(process, "financeiro")).toBe(path + "?aba=financeiro");
  });

  it("accepts both the canonical protocol route and old UUID links", () => {
    expect(resolveProcessRoute([process], "PM-2026-00001")?.id).toBe(process.id);
    expect(
      resolveProcessRoute([process], "33333333-3333-4333-8333-333333333333")?.protocol,
    ).toBe(process.protocol);
  });
});
