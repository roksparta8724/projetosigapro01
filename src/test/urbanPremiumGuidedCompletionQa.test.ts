import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assessUrbanAiReadiness } from "@/lib/urbanAiReadiness";
import type { UrbanReadinessInput } from "@/lib/urbanAiReadiness";

const municipalSource: UrbanReadinessInput = {
  files: {
    usoSolo: "quadros.pdf", zoneamento: "zoneamento clp.pdf",
    planoDiretor: "", leisComplementares: "",
  },
  source: null, audits: [],
  quadroII: {
    status: "pending_legal_review",
    legal_approval: false,
    pages: Array.from({ length: 14 }, (_, i) => ({
      page_number: 38 + i,
      topic: "Quadro II", source_quality: "visual_required",
      visual_warning: true, draft_count: 0,
      proposals: [],
    })),
    entries: Array.from({ length: 45 }, (_, i) => ({
      id: "draft-" + i, category_code: "C" + i, page_number: 38,
      use_description: "Uso candidato", permitted_zones_text: "",
      road_hierarchy_text: "", parking_requirement_text: "", special_conditions_text: "",
      status: "draft_unverified", source_excerpt: "Leitura candidata sem homologação legal",
      created_by_profile_id: "qa-reviewer", created_at: "2026-11-08T10:00:00Z",
    })),
  },
  matrixImports: [], verifiedEvidence: [], regulations: [], versionedLawCount: 0,
};

describe("SIGAPRO QA — fluxo guiado de legislação com visual compacto", () => {
  it("distingue arquivos antigos de normas legalmente cadastradas", () => {
    const result = assessUrbanAiReadiness(municipalSource);
    expect(result.checks.find(check => check.code === "pdf")?.passed).toBe(true);
    expect(result.checks.find(check => check.code === "registry")?.passed).toBe(false);
    expect(result.counts.versionedLaws).toBe(0);
    expect(result.quadroII.draftEntries).toBe(45);
    expect(result.readyForHumanAssistedPrecheck).toBe(false);
  });

  it("mostra uma próxima ação sem ocultar auditoria detalhada nem confundir rascunho com aprovação", () => {
    const panel = readFileSync("src/components/platform/UrbanAiReadinessPanel.tsx", "utf8");
    expect(panel).toContain('data-urban-guided-workflow="true"');
    expect(panel).toContain('data-urban-readiness-primary-action="true"');
    expect(panel).toContain('data-urban-readiness-all-checks="true"');
    expect(panel).toContain("Próxima ação recomendada");
    expect(panel).toContain("Preparação orientada da legislação");
    expect(panel).toContain("report.checks.map((check)");
    expect(panel).toContain('data-urban-ai-readiness-step={check.code}');
    expect(panel).not.toContain("activateUrbanRegulation(");
  });

  it("abre a LC379 previamente identificada sem gravar lei ou contornar permissões", () => {
    const panel = readFileSync("src/components/platform/UrbanAiReadinessPanel.tsx", "utf8");
    const registry = readFileSync("src/components/platform/UrbanLegislationRegistryPanel.tsx", "utf8");
    expect(panel).toContain('data-urban-register-base-law-action="true"');
    expect(panel).toContain("baseLaw.click()");
    expect(panel).toContain("registry");
    expect(registry).toContain('data-urban-first-law-guidance="true"');
    expect(registry).toContain("total === 0");
    expect(registry).toContain("canWrite && !loading");
    expect(registry).toContain('data-urban-open-source-pdf="true"');
    expect(registry).toContain('prefillFromOfficialSource("lc-379-2009")');
    expect(registry).toContain('if (!file) { setError("Selecione o PDF original da norma.")');
    expect(registry).toContain("await assertUrbanLegislationWriteAccess(municipalityId)");
  });
});
