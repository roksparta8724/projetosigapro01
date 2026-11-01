import { describe, expect, it } from "vitest";
import type { ProcessRecord } from "@/lib/platform";
import { isQa04ArchitecturalImportAllowed } from "@/lib/qa04ArchitecturalFixture";
const fixture = { id: "915e1c63-ebda-4cdd-8e95-34316d9e0089",
  protocol: "PM-2026-00004", title: "QA-URBAN-E2E-20261024 PROCESSO A FICTÍCIO" } as ProcessRecord;
describe("QA 04 document fixture stays isolated", () => {
  it("only exposes the import to an admin on the exact isolated QA record", () => {
    expect(isQa04ArchitecturalImportAllowed({ isolatedQa: true, role: "prefeitura_admin", process: fixture })).toBe(true);
    expect(isQa04ArchitecturalImportAllowed({ isolatedQa: false, role: "prefeitura_admin", process: fixture })).toBe(false);
    expect(isQa04ArchitecturalImportAllowed({ isolatedQa: true, role: "analista", process: fixture })).toBe(false);
    expect(isQa04ArchitecturalImportAllowed({ isolatedQa: true, role: "prefeitura_admin", process: { ...fixture, title: "Outra coisa" } })).toBe(false);
    expect(isQa04ArchitecturalImportAllowed({ isolatedQa: true, role: "prefeitura_admin", process: { ...fixture, id: "other-id" } })).toBe(false);
  });
});
