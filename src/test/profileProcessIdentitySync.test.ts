import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const identity = read("src/components/platform/ProcessIdentityPanel.tsx");
const backend = read("src/integrations/backend/platformImpl.ts");
const dataHook = read("src/hooks/usePlatformData.tsx");

describe("professional profile -> process identity synchronization", () => {
  it("uses explicit profile_id linkage instead of comparing mutable names", () => {
    expect(identity).toContain("const linkedProfessional = technicalProfile");
    expect(identity).toContain("const linkedOwner = ownerProfile");
    expect(identity).not.toContain("function samePerson");
    expect(identity).toContain("linkedProfessional?.fullName || process.technicalLead");
  });

  it("hydrates process professional identity from the current linked profile", () => {
    expect(backend).toContain("externalLeadProfile?.full_name");
    expect(backend).toContain("process.created_by_profile_id");
    expect(backend).toContain("technicalProfileId:");
    expect(backend).toContain("externalLead?.profile_id");
  });

  it("refreshes already-open process cards immediately after profile save", () => {
    expect(dataHook).toContain("const processes = current.processes.map");
    expect(dataHook).toContain("process.technicalProfileId === persistedProfile.userId");
    expect(dataHook).toContain("technicalLead: persistedProfile.fullName");
    expect(dataHook).toContain("professionalEmail: persistedProfile.email");
    expect(dataHook).toContain("return { ...current, userProfiles, sessionUsers, processes }");
  });
});
