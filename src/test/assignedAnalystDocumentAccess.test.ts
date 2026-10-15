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

const financeStageProcess = {
  id: "process-1",
  tenantId: municipalityId,
  municipalityId,
  processControl: {
    currentFolder: "Financeiro",
  },
  analysis: {
    assignedTo: "Jonatas Rodrigues",
    assignedProfileId: "analyst-profile-1",
    startedAt: "2026-10-13T16:16:22.289Z",
  },
} as ProcessRecord;

describe("assigned analyst document access", () => {
  it("keeps the assigned Urbanism analyst in the PDF analysis workspace after the process moves to Financeiro", () => {
    expect(
      canAnalyzeProcessDocument(
        assignedAnalyst,
        financeStageProcess,
        municipalityId,
      ),
    ).toBe(true);
  });

  it("does not grant the same document-analysis authority to another analyst", () => {
    expect(
      canAnalyzeProcessDocument(
        {
          ...assignedAnalyst,
          id: "analyst-profile-2",
          name: "Outro Analista",
        },
        financeStageProcess,
        municipalityId,
      ),
    ).toBe(false);
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
        financeStageProcess,
        municipalityId,
      ),
    ).toBe(false);
  });

  it("supports legacy assigned-name matching only when no profile id exists", () => {
    const legacyProcess = {
      ...financeStageProcess,
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
