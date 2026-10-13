import { describe, expect, it } from "vitest";
import {
  isExternalProfessionalProcess,
  processBelongsToExternalProfessional,
} from "@/lib/platform";

describe("external professional process ownership", () => {
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
