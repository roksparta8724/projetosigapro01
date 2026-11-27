import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/pages/saas/DashboardHomePage.tsx", "utf8");
const css = readFileSync("src/styles/dashboard-card-contrast.css", "utf8");
const sharedKpi = readFileSync("src/components/platform/MetricCard.tsx", "utf8");

// WCAG contrast formula for constant foreground/background palettes.
const linear = (v: number) => {
  const srgb = v / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
};
function luminance(hex: string) {
  const v = hex.replace("#", "");
  const c = [0, 2, 4].map((n) => linear(parseInt(v.slice(n, n + 2), 16)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string) {
  const hi = Math.max(luminance(a), luminance(b));
  const lo = Math.min(luminance(a), luminance(b));
  return (hi + 0.05) / (lo + 0.05);
}

describe("SIGAPRO — contraste premium dos cards do Dashboard", () => {
  it("a primeira prioridade possui área de status própria, sem apertar ou quebrar letras", () => {
    expect(page).toContain('data-dashboard-priority-card="true"');
    expect(page).toContain('data-dashboard-priority-status="true"');
    expect(page).toContain('data-dashboard-status-tone=');
    expect(page).toContain('className="mt-3 flex min-w-0 flex-wrap items-center"');
    const first = page.indexOf('data-dashboard-priority-card="true"');
    const priority = page.slice(first, first + 2000);
    expect(priority).toContain("buildPriorityReason(process)");
    expect(priority.indexOf("buildPriorityReason(process)")).toBeLessThan(priority.indexOf('data-dashboard-priority-status="true"'));
    expect(priority).not.toContain("flex items-start justify-between gap-3");
    expect(page).not.toContain("rounded-full bg-slate-900 px-2.5 py-1");
  });

  it("mantém textos visíveis na paleta de alertas e neutros, claro e escuro", () => {
    for (const [foreground, background] of [
      ["#783c08", "#fff2d4"], // Pendência documental — light
      ["#fff4d6", "#503917"], // Pendência documental — inverse
      ["#14496b", "#e8f3fc"], // Other status — light
      ["#f2f9ff", "#214c6b"], // Other status — inverse
      ["#cbdcf0", "#172e45"], // Dark metric label
      ["#ffffff", "#11253a"], // Dark metric value
      ["#d0deed", "#172e45"], // Dark metric helper
      ["#243b53", "#f8fbff"], // Light chart legend
      ["#f2f7ff", "#182e44"], // Dark chart legend
    ] as const) {
      expect(contrast(foreground, background), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("aplica tokens apenas ao Dashboard em cada família de tema", () => {
    expect(page).toContain('<PageShell className="sig-dashboard-premium">');
    expect(page).toContain('import "@/styles/dashboard-card-contrast.css";');
    expect(css).toContain('[data-layout-mode="inverse-main"]');
    expect(css).toContain('[data-dashboard-priority-status="true"]');
    expect(css).toContain('[data-dashboard-legend-item="true"]');
    expect(css).toContain('[data-dashboard-executive-signal="true"]');
    expect(css).toContain('[data-dashboard-health-card="true"]');
    expect(css).toContain(".sig-dashboard-premium");
    expect(css).toContain("-webkit-text-fill-color: #fff4d6 !important");
    expect(css).toContain("word-break: keep-all");
    expect(css).not.toContain(".sig-premium-topbar");
  });

  it("substitui a regra institucional clara do KPI especificamente no tema escuro", () => {
    expect(sharedKpi).toContain('data-premium-role-blue="metric"');
    expect(css).toContain('[data-premium-design="institutional-v3"][data-layout-mode="inverse-main"]');
    expect(css).toContain('.sig-metric-card[data-premium-surface="metric"][data-premium-role-blue="metric"]');
    expect(css).toContain('.sig-metric-card[data-premium-role-blue="metric"] .sig-metric-title');
    expect(css).toContain('.sig-metric-card[data-premium-role-blue="metric"] .sig-metric-helper');
    expect(css).toContain('.sig-metric-card[data-premium-role-blue="metric"] .sig-stat-icon svg');
  });

  it("protege o contraste das legendas e dos demais cards aninhados", () => {
    expect(page).toContain('data-dashboard-legend-label="true"');
    expect(page).toContain('data-dashboard-legend-count="true"');
    expect(page).toContain('data-dashboard-executive-label="true"');
    expect(page).toContain('data-dashboard-executive-value="true"');
    expect(page).toContain('data-dashboard-executive-helper="true"');
    expect(page.match(/data-dashboard-process-card="true"/g)?.length).toBeGreaterThanOrEqual(4);
    expect(css).toContain('[data-dashboard-legend-item="true"][aria-pressed="true"]');
    expect(css).toContain('[data-dashboard-process-card="true"]');
  });
});
