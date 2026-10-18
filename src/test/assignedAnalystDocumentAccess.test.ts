import { describe, expect, it } from "vitest";
import {
  canAnalyzeProcessDocument,
  type ProcessRecord,
  type SessionUser,
} from "@/lib/platform";

const municipalityId = "municipality-campo";

const assignedAnalyst: SessionUser = {
  id: "analyst-profile-1",
  name: "Jonatas Rodrigues",
  role: "analista",
  accessLevel: 1,
  tenantId: municipalityId,
  municipalityId,
  title: "Técnico em Edificações",
  email: "analista@prefeitura.test",
  accountStatus: "active",
  userType: "Interno",
  department: "Urbanismo e Obras",
};

const analysisStageProcess = {
  id: "process-1",
  tenantId: municipalityId,
  municipalityId,
  status: "analise_tecnica",
  processControl: {
    currentFolder: "Urbanismo e Obras",
  },
  analysis: {
    assignedTo: "Jonatas Rodrigues",
    assignedProfileId: "analyst-profile-1",
    startedAt: "2026-10-13T16:16:22.289Z",
  },
} as ProcessRecord;

describe("assigned analyst document access", () => {
  it("lets the assigned Urbanism analyst work in the shared PDF analysis workspace", () => {
    expect(
      canAnalyzeProcessDocument(
        assignedAnalyst,
        analysisStageProcess,
        municipalityId,
      ),
    ).toBe(true);
  });

  it("grants the same technical document authority to another analyst in the Analysis unit", () => {
    expect(
      canAnalyzeProcessDocument(
        {
          ...assignedAnalyst,
          id: "analyst-profile-2",
          name: "Outro Analista",
        },
        analysisStageProcess,
        municipalityId,
      ),
    ).toBe(true);
  });

  it("keeps the Prefeitura administrator out of technical analysis", () => {
    expect(
      canAnalyzeProcessDocument(
        {
          ...assignedAnalyst,
          id: "municipal-admin",
          role: "prefeitura_admin",
          accessLevel: 3,
          department: "Administração",
        },
        analysisStageProcess,
        municipalityId,
      ),
    ).toBe(false);
  });

  it("does not depend on a legacy assigned-name match to grant Analysis-unit access", () => {
    const legacyProcess = {
      ...analysisStageProcess,
      analysis: {
        assignedTo: "Jônatas Rodrigues",
        startedAt: "2026-10-13T16:16:22.289Z",
      },
    } as ProcessRecord;

    expect(
      canAnalyzeProcessDocument(
        assignedAnalyst,
        legacyProcess,
        municipalityId,
      ),
    ).toBe(true);
  });
});
