import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canAccessMunicipalArea,
  canAnalyzeProcessDocument,
  canEditAssignedAnalysisArtifact,
  canSuperviseProcessAnalysis,
  hasActiveAnalysisSupervisorIntervention,
  type ProcessRecord,
  type SessionUser,
} from "@/lib/platform";

const municipalityId = "municipality-urbanism";

const analystA: SessionUser = {
  id: "analyst-a",
  name: "Analista A",
  role: "analista",
  accessLevel: 2,
  tenantId: municipalityId,
  municipalityId,
  title: "Analista Técnico",
  email: "a@prefeitura.test",
  accountStatus: "active",
  userType: "Interno",
  department: "Urbanismo e Obras",
};

const analystB: SessionUser = {
  ...analystA,
  id: "analyst-b",
  name: "Analista B",
  email: "b@prefeitura.test",
};

const urbanismDirector: SessionUser = {
  ...analystA,
  id: "director-urbanism",
  name: "Diretor de Urbanismo",
  email: "diretor@prefeitura.test",
  role: "prefeitura_supervisor",
  title: "Diretor",
  accessLevel: 2,
};

const ownedProcess = {
  id: "process-owned",
  tenantId: municipalityId,
  municipalityId,
  analysis: {
    assignedTo: analystA.name,
    assignedProfileId: analystA.id,
    startedAt: "2026-10-17T18:00:00-03:00",
  },
  processControl: {
    currentFolder: "Urbanismo e Obras",
  },
} as ProcessRecord;

describe("analysis ownership and director supervision", () => {
  it("keeps technical Analysis editable only by the current assigned analyst", () => {
    expect(canAnalyzeProcessDocument(analystA, ownedProcess, municipalityId)).toBe(true);
    expect(canAnalyzeProcessDocument(analystB, ownedProcess, municipalityId)).toBe(false);
  });


  it("transfers edit authority immediately when the Directorate reassigns the analysis", () => {
    const reassignedProcess = {
      ...ownedProcess,
      analysis: {
        ...ownedProcess.analysis,
        assignedTo: analystB.name,
        assignedProfileId: analystB.id,
      },
    } as ProcessRecord;

    expect(canAnalyzeProcessDocument(analystA, reassignedProcess, municipalityId)).toBe(false);
    expect(canAnalyzeProcessDocument(analystB, reassignedProcess, municipalityId)).toBe(true);
    expect(canEditAssignedAnalysisArtifact(analystA, reassignedProcess, municipalityId)).toBe(false);
    expect(canEditAssignedAnalysisArtifact(analystB, reassignedProcess, municipalityId)).toBe(true);
  });

  it("lets only the originally assigned analyst rectify the Habite-se analysis after the workflow advances", () => {
    const habiteSePermitStageProcess = {
      ...ownedProcess,
      type: "Habite-se",
      status: "analise_tecnica",
      processControl: {
        currentFolder: "Emissão do Alvará de Habite-se",
      },
    } as ProcessRecord;

    expect(
      canEditAssignedAnalysisArtifact(
        analystA,
        habiteSePermitStageProcess,
        municipalityId,
      ),
    ).toBe(true);
    expect(
      canEditAssignedAnalysisArtifact(
        analystB,
        habiteSePermitStageProcess,
        municipalityId,
      ),
    ).toBe(false);
  });

  it("scopes the Urbanism director to Analysis instead of giving global municipal access", () => {
    expect(canAccessMunicipalArea(urbanismDirector, "analise")).toBe(true);
    expect(canAccessMunicipalArea(urbanismDirector, "financeiro")).toBe(false);
    expect(canAccessMunicipalArea(urbanismDirector, "protocolos")).toBe(false);
    expect(canSuperviseProcessAnalysis(urbanismDirector, ownedProcess)).toBe(true);
  });

  it("lets the Urbanism director supervise the assigned technical workspace", () => {
    expect(canAnalyzeProcessDocument(urbanismDirector, ownedProcess, municipalityId)).toBe(true);

    const interventionProcess = {
      ...ownedProcess,
      analysis: {
        ...ownedProcess.analysis,
        supervisorOverrideProfileId: urbanismDirector.id,
        supervisorOverrideReason: "Correção urgente determinada pela Diretoria",
        supervisorOverrideStartedAt: new Date().toISOString(),
        supervisorOverrideExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
    } as ProcessRecord;

    expect(
      hasActiveAnalysisSupervisorIntervention(urbanismDirector, interventionProcess),
    ).toBe(true);
    expect(
      canAnalyzeProcessDocument(urbanismDirector, interventionProcess, municipalityId),
    ).toBe(true);
  });

  it("locks the UI and database around the same ownership model", () => {
    const detail = readFileSync(
      resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"),
      "utf8",
    );
    const checklist = readFileSync(
      resolve(process.cwd(), "src/components/platform/UrbanAnalysisChecklistPanel.tsx"),
      "utf8",
    );
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "neon/migrations/20261018_analysis_strict_assignment_ownership.sql",
      ),
      "utf8",
    );

    expect(detail).toContain("<AnalysisSupervisorControl");
    expect(detail).toContain("canEditAssignedAnalysisArtifact");
    expect(detail).toContain("readOnly={!canEditAnalysisChecklist}");
    expect(checklist).toContain("Modo acompanhamento");
    expect(checklist).toContain("<fieldset disabled={readOnly || officialSheetLoading}");
    expect(migration).toContain("can_write_process_analysis");
    expect(migration).toContain("analysis_assigned_to_profile_id=_actor");
    expect(migration).toContain("_actor_role='prefeitura_supervisor'");
    expect(migration).toContain("_actor_role not in ('analista','analyst')");
    expect(migration).toContain("Somente o Analista responsável atual");
    expect(migration).toContain("get_process_artifact_signature_context_v1");
    expect(migration).toContain("public.can_write_process_analysis(_process_id)");
  });
});
