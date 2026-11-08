import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panel = readFileSync("src/components/platform/UrbanAiReadinessPanel.tsx", "utf8");
const matrix = readFileSync("src/components/platform/UrbanLegalMatrixReviewPanel.tsx", "utf8");
const quadroII = readFileSync("src/components/platform/UrbanQuadroIIWorkspacePanel.tsx", "utf8");
const rules = readFileSync("src/components/platform/MunicipalUrbanRulesSettings.tsx", "utf8");
const registry = readFileSync("src/components/platform/UrbanLegislationRegistryPanel.tsx", "utf8");
const readiness = readFileSync("src/lib/urbanAiReadiness.ts", "utf8");

describe("SIGAPRO QA — remediação jurídica auditável sem aprovação fictícia", () => {
  it("identifica os 7 bloqueios e aponta o setor e o lugar correto de conferência", () => {
    for (const code of ["pdf", "registry", "quadro-i", "quadro-ii", "imports", "evidence", "active"]) {
      expect(panel).toContain(code + ": { label:");
    }
    expect(panel).toContain("data-urban-readiness-next={check.code}");
    expect(panel).toContain("Responsável: {NEXT_ACTIONS[check.code].owner}");
    expect(panel).toContain('data-urban-reading-reservations="true"');
    expect(panel).toContain("issue.zone");
    expect(panel).toContain("issue.reason");
    expect(registry).toContain('id="sigapro-urban-legislation-registry"');
    expect(rules).toContain('data-urban-regulation-versions="true"');
    expect(rules).toContain('data-urban-quadros-workspace="true"');
  });

  it("atualiza a auditoria ao trocar o PDF e após alterações verificadas", () => {
    expect(panel).toContain("documents.usoSolo, documents.zoneamento");
    expect(panel).toContain("documents.planoDiretor, documents.leisComplementares, refresh, revision");
    expect(rules).toContain("revision={auditRevision}");
    expect(rules).toContain("onDataChanged={markAuditChanged}");
    expect(matrix).toContain("onDataChanged?.()");
    expect(quadroII).toContain("onDataChanged?.()");
  });

  it("nunca confunde rascunhos, aprovação do Quadro II e fonte legal comprovada", () => {
    expect(readiness).toContain('data.quadroII?.legal_approval === true');
    expect(readiness).toContain("Sem homologação jurídica do Quadro II");
    expect(readiness).toContain("!isUrbanTestFixtureRule(version)");
    expect(readiness).toContain("countCoveredUrbanMetrics(version, data.verifiedEvidence)");
    expect(readiness).toContain("readyForHumanAssistedPrecheck: checks.every((step) => step.passed)");
    expect(panel).toContain("A IA nunca substitui o responsável pela análise.");
    expect(panel).not.toContain("activateUrbanRegulation(");
  });
});
