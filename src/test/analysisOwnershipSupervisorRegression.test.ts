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
  it("lets the assigned analyst edit and keeps a second analyst read-only", () => {
    expect(canAnalyzeProcessDocument(analystA, ownedProcess, municipalityId)).toBe(true);
    expect(canAnalyzeProcessDocument(analystB, ownedProcess, municipalityId)).toBe(false);
  });

  it("scopes the Urbanism director to Analysis instead of giving global municipal access", () => {
    expect(canAccessMunicipalArea(urbanismDirector, "analise")).toBe(true);
    expect(canAccessMunicipalArea(urbanismDirector, "financeiro")).toBe(false);
    expect(canAccessMunicipalArea(urbanismDirector, "protocolos")).toBe(false);
    expect(canSuperviseProcessAnalysis(urbanismDirector, ownedProcess)).toBe(true);
  });

  it("keeps the director read-only until an audited intervention is active", () => {
    expect(canAnalyzeProcessDocument(urbanismDirector, ownedProcess, municipalityId)).toBe(false);

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
        "neon/migrations/20261017_analysis_ownership_supervisor_intervention.sql",
      ),
      "utf8",
    );

    expect(detail).toContain("<AnalysisSupervisorControl");
    expect(detail).toContain("readOnly={!canReviewDocuments}");
    expect(checklist).toContain("Modo acompanhamento");
    expect(checklist).toContain("<fieldset disabled={readOnly}");
    expect(migration).toContain("can_write_process_analysis");
    expect(migration).toContain("begin_analysis_supervisor_intervention");
    expect(migration).toContain("reassign_process_analysis");
    expect(migration).toContain("trg_guard_analysis_document_write");
    expect(migration).toContain("trg_guard_analysis_process_update");
  });
});
