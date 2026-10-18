import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canAccessMunicipalArea,
  canAnalyzeProcessDocument,
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
  it("keeps the technical Analysis workspace shared by analysts from the same municipality", () => {
    expect(canAnalyzeProcessDocument(analystA, ownedProcess, municipalityId)).toBe(true);
    expect(canAnalyzeProcessDocument(analystB, ownedProcess, municipalityId)).toBe(true);
  });

  it("scopes the Urbanism director to Analysis instead of giving global municipal access", () => {
    expect(canAccessMunicipalArea(urbanismDirector, "analise")).toBe(true);
    expect(canAccessMunicipalArea(urbanismDirector, "financeiro")).toBe(false);
    expect(canAccessMunicipalArea(urbanismDirector, "protocolos")).toBe(false);
    expect(canSuperviseProcessAnalysis(urbanismDirector, ownedProcess)).toBe(true);
  });

  it("lets the Urbanism director work in the shared technical workspace without a temporary override", () => {
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
        "neon/migrations/20261018_analysis_shared_technical_workspace.sql",
      ),
      "utf8",
    );

    expect(detail).toContain("<AnalysisSupervisorControl");
    expect(detail).toContain("readOnly={!canReviewDocuments}");
    expect(checklist).toContain("Modo acompanhamento");
    expect(checklist).toContain("<fieldset disabled={readOnly}");
    expect(migration).toContain("can_write_process_analysis");
    expect(migration).toContain("_actor_role not in ('analista','prefeitura_supervisor')");
    expect(migration).toContain("_actor_area := public.profile_operational_area(_actor)");
    expect(migration).toContain("return public.process_is_in_analysis_area(_process_id)");
    expect(migration).toContain("guard_analysis_document_write");
    expect(migration).toContain("guard_analysis_process_update");
  });
});
