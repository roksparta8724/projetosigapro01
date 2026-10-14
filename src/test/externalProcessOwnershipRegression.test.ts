import { describe, expect, it } from "vitest";
import {
  canAccessProcess,
  isExternalProfessionalProcess,
  isExternalProfessionalRole,
  isInternalRole,
  processBelongsToExternalProfessional,
  type ProcessRecord,
  type SessionUser,
} from "@/lib/platform";

describe("external professional process ownership", () => {
  it("never classifies stored professional aliases as municipal staff", () => {
    expect(isExternalProfessionalRole("professional")).toBe(true);
    expect(isExternalProfessionalRole("profissional")).toBe(true);
    expect(isExternalProfessionalRole("professional_external")).toBe(true);
    expect(isInternalRole("professional")).toBe(false);
  });

  it("keeps an external professional's protocol visible after it moves to another municipal department", () => {
    const session = {
      id: "profile-1",
      name: "Profissional Teste",
      role: "professional" as unknown as SessionUser["role"],
      accessLevel: 1,
      tenantId: "municipality-1",
      municipalityId: "municipality-1",
      title: "Profissional Externo",
      email: "pro@example.com",
      accountStatus: "active",
      department: "Profissional Externo",
    } satisfies SessionUser;

    const process = {
      id: "process-1",
      tenantId: "municipality-1",
      municipalityId: "municipality-1",
      createdBy: "profile-1",
      createdByProfileId: "profile-1",
      createdByUserId: "auth-user-1",
      createdByEmail: "pro@example.com",
      professionalProfileId: "profile-1",
      professionalUserId: "auth-user-1",
      professionalEmail: "pro@example.com",
      processControl: { currentFolder: "Financeiro", externalTransitView: "completo", onHold: false },
    } as unknown as ProcessRecord;

    expect(canAccessProcess(session, process, "municipality-1")).toBe(true);
  });

  it("keeps an external professional's protocol visible even if the cached session municipality is stale", () => {
    const session = {
      id: "profile-1",
      name: "Profissional Teste",
      role: "profissional_externo",
      accessLevel: 1,
      tenantId: "stale-municipality",
      municipalityId: "stale-municipality",
      title: "Profissional Externo",
      email: "pro@example.com",
      accountStatus: "active",
      department: "Profissional Externo",
    } satisfies SessionUser;

    const process = {
      id: "process-1",
      tenantId: "municipality-1",
      municipalityId: "municipality-1",
      createdBy: "profile-1",
      createdByProfileId: "profile-1",
      createdByUserId: "auth-user-1",
      createdByEmail: "pro@example.com",
      professionalProfileId: "profile-1",
      professionalUserId: "auth-user-1",
      professionalEmail: "pro@example.com",
      processControl: { currentFolder: "Financeiro", externalTransitView: "completo", onHold: false },
    } as unknown as ProcessRecord;

    expect(canAccessProcess(session, process, "stale-ui-scope")).toBe(true);
  });

  it("keeps an external professional's protocol visible even if the page scope cache is stale", () => {
    const session = {
      id: "profile-1",
      name: "Profissional Teste",
      role: "profissional_externo",
      accessLevel: 1,
      tenantId: "municipality-1",
      municipalityId: "municipality-1",
      title: "Profissional Externo",
      email: "pro@example.com",
      accountStatus: "active",
      department: "Profissional Externo",
    } satisfies SessionUser;

    const process = {
      id: "process-1",
      tenantId: "municipality-1",
      municipalityId: "municipality-1",
      createdBy: "profile-1",
      createdByProfileId: "profile-1",
      createdByUserId: "auth-user-1",
      createdByEmail: "pro@example.com",
      professionalProfileId: "profile-1",
      professionalUserId: "auth-user-1",
      professionalEmail: "pro@example.com",
      processControl: { currentFolder: "Financeiro", externalTransitView: "completo", onHold: false },
    } as unknown as ProcessRecord;

    expect(canAccessProcess(session, process, "stale-ui-scope")).toBe(true);
  });

  it("keeps the process visible when the session uses the profile id", () => {
    expect(
      processBelongsToExternalProfessional(
        { id: "profile-1", email: "pro@example.com" },
        {
          createdBy: "profile-1",
          createdByProfileId: "profile-1",
          createdByUserId: "auth-user-1",
          createdByEmail: "pro@example.com",
          professionalProfileId: "profile-1",
          professionalUserId: "auth-user-1",
          professionalEmail: "pro@example.com",
        },
      ),
    ).toBe(true);
  });

  it("keeps the process visible when a cached session still uses the legacy/auth user id", () => {
    expect(
      processBelongsToExternalProfessional(
        { id: "auth-user-1", email: "pro@example.com" },
        {
          createdBy: "profile-1",
          createdByProfileId: "profile-1",
          createdByUserId: "auth-user-1",
          createdByEmail: "pro@example.com",
          professionalProfileId: "profile-1",
          professionalUserId: "auth-user-1",
          professionalEmail: "pro@example.com",
        },
      ),
    ).toBe(true);
  });

  it("keeps the process visible by canonical email if the id representation changes", () => {
    expect(
      processBelongsToExternalProfessional(
        { id: "provider-session-id", email: "PRO@example.com" },
        {
          createdBy: "profile-1",
          createdByProfileId: "profile-1",
          createdByUserId: "auth-user-1",
          createdByEmail: "pro@example.com",
          professionalProfileId: "profile-1",
          professionalUserId: "auth-user-1",
          professionalEmail: "pro@example.com",
        },
      ),
    ).toBe(true);
  });

  it("identifies an externally originated protocol independently of the current department", () => {
    expect(
      isExternalProfessionalProcess({
        createdByRole: "professional",
        professionalProfileId: "profile-1",
        professionalUserId: "auth-user-1",
        professionalEmail: "pro@example.com",
      }),
    ).toBe(true);
  });
});
