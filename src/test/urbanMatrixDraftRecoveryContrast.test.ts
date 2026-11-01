import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const config = readFileSync("src/pages/saas/ConfiguracoesPage.tsx", "utf8");
const css = readFileSync("src/styles/surface-polarity.css", "utf8");
const rules = readFileSync("src/components/platform/MunicipalUrbanRulesSettings.tsx", "utf8");

describe("SIGAPRO homologação: legibilidade e retomada segura", () => {
  it("identifica cabeçalho e rodapé com contraste forte e rótulos distintos", () => {
    expect(config).toContain('data-preview-role-badge="header"');
    expect(config).toContain('data-preview-role-badge="footer"');
    expect(css).toContain("[data-preview-role-badge]");
    expect(css).toContain("background-color:#ffffff !important");
    expect(css).toContain("color:#0f172a !important");
    expect(css).toContain("-webkit-text-fill-color:#0f172a !important");
  });
  it("mantém campos após gravação e permite reabrir apenas o próprio rascunho", () => {
    expect(rules).toContain('onClick={() => continueReview(item)}>Reabrir rascunho');
    expect(rules).toContain('item.municipality_id !== municipalityId || item.status !== "draft"');
    expect(rules).toContain('restored[rule.metric] = { limit: String(rule.limit), reference: rule.reference }');
    expect(rules).not.toMatch(/await reload\(\);\s*setDraft\(\{\}\)/);
    expect(rules).toContain("Reabrir este rascunho substituirá os campos");
    expect(rules).toContain("Nenhuma regra foi ativada.");
  });
});
