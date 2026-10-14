import { describe, expect, it } from "vitest";
import {
  canViewProcessDocuments,
  type ProcessRecord,
  type SessionUser,
} from "@/lib/platform";

const municipalityId = "49dac0b6-6352-4744-9aab-9ff91c59d970";
const professionalProfileId = "bbdd2bf0-1594-49f9-9f91-afef5cef20a3";

const process = {
  id: "c8f77630-a741-4895-9e86-4663106072fa",
  tenantId: municipalityId,
  municipalityId,
  createdBy: professionalProfileId,
  createdByProfileId: professionalProfileId,
  createdByUserId: "aa314dee-7500-43f2-a1e4-5baff919f035",
  createdByEmail: "profissional@example.invalid",
  professionalProfileId,
  professionalUserId: "aa314dee-7500-43f2-a1e4-5baff919f035",
  professionalEmail: "profissional@example.invalid",
  processControl: { currentFolder: "Financeiro" },
} as unknown as ProcessRecord;

describe("document viewer process access", () => {
  it("keeps the external professional able to read documents after the process reaches Financeiro", () => {
    const session = {
      id: professionalProfileId,
      email: "profissional@example.invalid",
      role: "profissional_externo",
      tenantId: municipalityId,
      municipalityId,
      accountStatus: "active",
    } as unknown as SessionUser;

    expect(canViewProcessDocuments(session, process, municipalityId)).toBe(true);
  });

  it("blocks an unrelated external professional", () => {
    const session = {
      id: "11111111-1111-4111-8111-111111111111",
      email: "outro@example.invalid",
      role: "profissional_externo",
      tenantId: municipalityId,
      municipalityId,
      accountStatus: "active",
    } as unknown as SessionUser;

    expect(canViewProcessDocuments(session, process, municipalityId)).toBe(false);
  });

  it("blocks an inactive account even when it owns the process", () => {
    const session = {
      id: professionalProfileId,
      email: "profissional@example.invalid",
      role: "profissional_externo",
      tenantId: municipalityId,
      municipalityId,
      accountStatus: "inactive",
    } as unknown as SessionUser;

    expect(canViewProcessDocuments(session, process, municipalityId)).toBe(false);
  });
});
