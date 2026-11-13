import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");

describe("SIGAPRO operational launch quality — 13 Nov 2026", () => {
  it("puts the authenticated municipal queue before executive dashboard hero", () => {
    const page = source("src/pages/saas/DashboardHomePage.tsx");
    const marker = 'section === "visao-geral" ? renderMunicipalWorkQueue() : null';
    expect(page).toContain(marker);
    expect(page.indexOf(marker)).toBeLessThan(page.indexOf('data-dashboard-hero="compact-v6"'));
  });

  it("provides controlled SEI-like selection and personal-only bulk actions", () => {
    const registry = source("src/components/platform/CompactProcessRegistry.tsx");
    const page = source("src/pages/saas/MunicipalProcessRegistryPage.tsx");
    expect(registry).toContain("onToggleSelection");
    expect(registry).toContain('type="checkbox"');
    expect(page).toContain("data-sei-bulk-selection");
    expect(page).toContain("Arquivar da minha lista");
    expect(page).toContain("sem alterar tramitação ou status oficial");
  });

  it("does not label a missing bank credential as live settlement", () => {
    const payment = source("src/components/platform/MunicipalPaymentSettings.tsx");
    expect(payment).toContain('data-municipal-bank-missing="true"');
    expect(payment).toContain("Nenhuma conexão de provedor foi encontrada");
    expect(payment).toContain("não significa conciliação automática");
  });

  it("prefetches internal routes on navigation intent", () => {
    const app = source("src/App.tsx");
    expect(app).toContain('document.addEventListener("pointerover", prefetchLink');
    expect(app).toContain('document.addEventListener("focusin", prefetchLink)');
  });
});
