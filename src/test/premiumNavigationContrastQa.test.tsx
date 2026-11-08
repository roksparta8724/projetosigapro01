import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { InternalSectionNav } from "@/components/platform/PageLayout";
import { MunicipalOverviewSubnav } from "@/components/platform/MunicipalOverviewSubnav";

const style = readFileSync("src/styles/premium-navigation-contrast.css", "utf8");
const main = readFileSync("src/main.tsx", "utf8");

function contrast(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const parts = hex.match(/[\da-f]{2}/gi);
    if (!parts || parts.length !== 3) throw new Error("Cor inválida");
    const [r, g, b] = parts.map((part) => {
      const n = parseInt(part, 16) / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const left = luminance(foreground);
  const right = luminance(background);
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

describe("SIGAPRO Premium — letras claras nas máscaras azuis dos dois temas", () => {
  it("na navegação principal identifica o cartão selecionado, mas não os demais", () => {
    const { container } = render(
      <InternalSectionNav
        items={[
          { value: "visao-geral", label: "Visão geral", helper: "Resumo executivo" },
          { value: "fila", label: "Fila operacional", helper: "Protocolos e prioridades" },
        ]}
        value="visao-geral"
        onChange={() => {}}
      />,
    );
    const active = container.querySelector('button[data-nav-active="true"]');
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active?.querySelector(".sig-nav-item-label")).toHaveTextContent("Visão geral");
    expect(active?.querySelector(".sig-nav-item-helper")).toHaveTextContent("Resumo executivo");
    expect(container.querySelectorAll('button[data-nav-active="false"]')).toHaveLength(1);
  });

  it("destaca a aba Atividades inteira, incluindo descrição e contador", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/prefeitura/visao-geral/atividades"]}>
        <MunicipalOverviewSubnav active="atividades"
          counts={{ processos: 2000, pendencias: 150, atividades: 3000 }} />
      </MemoryRouter>,
    );
    const active = screen.getByRole("link", { name: /Atividades/ });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active).toHaveAttribute("data-sigapro-overview-tab", "active");
    expect(active.querySelector('[data-sigapro-overview-tab-title="true"]'))
      .toHaveTextContent("Atividades");
    expect(active.querySelector('[data-sigapro-overview-tab-helper="true"]'))
      .toHaveTextContent("Últimas movimentações");
    expect(active.querySelector('[data-sigapro-overview-tab-counter="true"]'))
      .toHaveTextContent("3.000");
    expect(container.querySelectorAll('[data-sigapro-overview-tab="inactive"]'))
      .toHaveLength(3);
  });

  it("carrega a correção DEPOIS do CSS geral e do tema, sem reabrir o bug", () => {
    const general = main.indexOf('import "./index.css"');
    const theme = main.indexOf('import "./styles/surface-polarity.css"');
    const fix = main.indexOf('import "./styles/premium-navigation-contrast.css"');
    expect(general).toBeGreaterThanOrEqual(0);
    expect(theme).toBeGreaterThan(general);
    expect(fix).toBeGreaterThan(theme);
    expect(style).toContain('button[data-nav-active="true"] .sig-nav-item-label');
    expect(style).toContain('button[data-nav-active="true"] .sig-nav-item-helper');
    expect(style).toContain('a[data-sigapro-overview-tab="active"]');
    expect(style).toContain('[data-sigapro-overview-tab-title="true"]');
    expect(style).toContain('[data-sigapro-overview-tab-helper="true"]');
    expect(style).toContain('[data-sigapro-overview-tab-counter="true"]');
    expect(style).toContain("-webkit-text-fill-color: #ffffff !important");
    expect(style).toContain("-webkit-text-fill-color: #e0f2fe !important");
    expect(style).toContain('button[aria-pressed="true"]');
  });

  it("branco e azul claro mantêm contraste WCAG AA mesmo no azul menos escuro da navegação", () => {
    for (const blue of ["#0f3d68", "#24639a"]) {
      expect(contrast("#ffffff", blue)).toBeGreaterThanOrEqual(4.5);
      expect(contrast("#e0f2fe", blue)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("não pinta todos os links brancos no tema claro, apenas os selecionados", () => {
    expect(style).toContain('a[data-sigapro-overview-tab="inactive"]');
    expect(style).toContain('color: #0f172a !important');
    expect(style).toContain('color: #475569 !important');
    expect(style).toContain('[data-layout-mode="inverse-main"]');
    expect(style).not.toContain("a:not([aria-current");
  });
  it("não deixa Todos invisível: filtro ativo tem fundo azul escuro e texto branco no tema claro", () => {
    const tenant = readFileSync("src/pages/saas/TenantAdminPage.tsx", "utf8");
    expect(tenant).toContain('["todos", "Todos"]');
    expect(tenant).toContain('aria-pressed={overviewProcessStatus === key}');
    expect(style).toContain('[aria-label="Filtrar situação dos processos"]');
    expect(style).toMatch(
      /button\\[aria-pressed="true"\\] \\{[\\s\\S]*?background-color: #0c4a6e !important;[\\s\\S]*?-webkit-text-fill-color: #ffffff !important;/,
    );
    expect(contrast("#ffffff", "#0c4a6e")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#ffffff", "#075985")).toBeGreaterThanOrEqual(4.5);
  });

  it("mantém demais filtros legíveis e não afeta o modo inverso", () => {
    expect(style).toMatch(
      /\\[data-layout-mode="default"\\] \\.sig-main-shell\\s+\\[aria-label="Filtrar situação dos processos"\\]\\s+button\\[aria-pressed="false"\\] \\{[\\s\\S]*?background-color: #ffffff !important;[\\s\\S]*?color: #1e293b !important;/,
    );
    expect(contrast("#1e293b", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(style).not.toContain('[data-layout-mode="inverse-main"] .sig-main-shell\\n[aria-label="Filtrar situação dos processos"]\\nbutton[aria-pressed="false"]');
  });

});
