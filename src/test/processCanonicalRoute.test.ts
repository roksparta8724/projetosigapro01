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
  it("never exposes the internal UUID when a protocol exists", () => {
    expect(buildProcessRouteKey(process.protocol, process.id)).toBe("PM-2026-00001");
    expect(buildProcessPath(process)).toBe("/processos/PM-2026-00001");
    expect(buildProcessPath(process, "financeiro")).toBe(
      "/processos/PM-2026-00001?aba=financeiro",
    );
    expect(buildProcessPath(process)).not.toContain("33333333");
  });

  it("accepts both the canonical protocol route and old UUID links", () => {
    expect(resolveProcessRoute([process], "PM-2026-00001")?.id).toBe(process.id);
    expect(
      resolveProcessRoute([process], "33333333-3333-4333-8333-333333333333")?.protocol,
    ).toBe(process.protocol);
  });
});
