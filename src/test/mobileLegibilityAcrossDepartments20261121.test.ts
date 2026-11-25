import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import postcss, { type AtRule, type Rule } from "postcss";

const read = (path: string) => readFileSync(path, "utf8");
const cssSource = read("src/styles/sigapro-mobile-legibility-20261121.css");
const css = postcss.parse(cssSource);
const rulesFor = (media: string) => {
  const rules: Rule[] = [];
  css.walkAtRules("media", (at: AtRule) => {
    if (at.params.includes(media)) at.walkRules((rule) => { rules.push(rule); });
  });
  return rules;
};
const rulesWith = (rules: Rule[], selector: string) =>
  rules.filter((rule) => rule.selector.includes(selector));
const declaration = (rule: Rule, key: string) =>
  rule.nodes.find((node) => node.type === "decl" && node.prop === key)?.toString() ?? "";

describe("SIGAPRO — auditoria de leitura mobile 320/360/390/430/640/768/1024", () => {
  it("topbar usa exatamente um espaço reservado ao nome e nunca cobre o menu por largura fixa", () => {
    const frame = read("src/components/platform/PortalFrame.tsx");
    expect(frame).toContain('className="sig-topbar-mobile-actions flex min-w-0 shrink-0');
    expect(frame).toContain('data-topbar-brand-viewport="mobile"');
    expect(frame).toContain('data-topbar-actions-viewport="mobile"');
    expect(frame).toContain('sig-topbar-brand-copy min-w-0 flex-1');
    expect(frame).toContain('title={topbarBrandTitle}');
    expect(frame).toContain('title={topbarBrandSubtitle}');
    expect(frame).toContain("setMobileSidebarOpen(true)");
    expect(frame).toContain('aria-label="Abrir conta do usuário"');
    expect(frame).toContain('data-topbar-process-shortcut="mobile"');
    expect(frame).toContain('aria-label="Organograma"');
    expect(frame).toContain('aria-label={`Notificações (${notificationCount})`}');
  });

  it("em telefones, nome e ações ficam em duas linhas com altura e conteúdo sincronizados", () => {
    const small = rulesFor("max-width: 639px");
    const layout = rulesWith(small, ".sig-topbar-shell");
    expect(layout.some((r) => declaration(r, "display").includes("grid"))).toBe(true);
    expect(layout.some((r) => declaration(r, "grid-template-columns").includes("minmax(0, 1fr)"))).toBe(true);
    expect(layout.some((r) => declaration(r, "grid-template-rows").includes("48px 44px"))).toBe(true);
    expect(rulesWith(small, ".sig-app-frame").some((r) =>
      declaration(r, "--sig-topbar-height-mobile").includes("108px"))).toBe(true);
    const body = read("src/index.css");
    expect(body).toContain("padding-top: var(--sig-topbar-height-mobile");
    expect(rulesWith(small, '[data-topbar-account-viewport="mobile"]').some((r) =>
      declaration(r, "grid-row").includes("1"))).toBe(true);
    expect(rulesWith(small, '[data-mobile-topbar-search="true"]').some((r) =>
      declaration(r, "flex").includes("1 1 0%"))).toBe(true);
    expect(rulesWith(small, "[data-topbar-actions-viewport").some((r) =>
      declaration(r, "justify-content").includes("flex-end"))).toBe(true);
    expect(rulesFor("max-width: 1023px").some((r) => r.selector.includes('[data-topbar-account-viewport="mobile"] > button') &&
      declaration(r, "width").includes("56px"))).toBe(true);
    const frame = read("src/components/platform/PortalFrame.tsx");
    expect(frame).toContain('data-mobile-topbar-search="true"');
    expect(frame).toContain('<MunicipalDepartmentSwitcher dark={true} />');
    expect(frame).toContain('data-topbar-account-viewport="mobile"');
    // Responsive CSS must not silently discard process or notification actions.
    expect(cssSource).not.toMatch(/\[data-topbar-process-shortcut.*display\s*:\s*none/);
  });

  it("telas intermediárias 640–1023 não empurram título para trás de ícones", () => {
    const tablet = rulesFor("min-width: 640px");
    expect(tablet.some((r) => r.selector.includes('data-topbar-brand-viewport="mobile"') &&
      declaration(r, "flex").includes("1 1 0%"))).toBe(true);
    expect(tablet.some((r) => r.selector.includes(".sig-topbar-brand-title") &&
      declaration(r, "text-overflow").includes("ellipsis"))).toBe(true);
    expect(read("src/components/platform/PortalFrame.tsx")).toContain('data-topbar-viewport="desktop"');
  });

  it("cadastros da Prefeitura e Master usam os mesmos dados e detalhes no mobile", () => {
    const registry = read("src/components/platform/CompactUserRegistry.tsx");
    expect(registry).toContain('data-mobile-registry-scroll="true"');
    expect(registry).toContain('min-w-[900px]');
    for (const label of ["Perfil e acesso", "Lotação", "Situação", "Último acesso"]) {
      expect(registry).toContain('data-mobile-label="' + label + '"');
    }
    expect(registry.match(/renderDetails\(user\)/g)?.length).toBe(1);
    expect(registry).toContain('data-sigapro-user-expanded="true"');
    expect(registry).toContain("aria-expanded={expanded}");
    const mobile = rulesFor("max-width: 767px");
    expect(rulesWith(mobile, '[data-sigapro-user-row="true"]').some((r) =>
      declaration(r, "grid-template-columns").includes("repeat(2"))).toBe(true);
    expect(rulesWith(mobile, 'td[data-mobile-label]::before').some((r) =>
      declaration(r, "content").includes("attr(data-mobile-label)"))).toBe(true);
    expect(rulesWith(mobile, 'td[data-sigapro-user-expanded="true"]').length).toBeGreaterThan(0);
    expect(cssSource).toContain('[data-layout-mode="inverse-main"]');
  });

  it("headers, cards e ações mantêm texto acessível sem mudar os fluxos", () => {
    const layout = read("src/components/platform/PageLayout.tsx");
    expect(layout).toContain("sig-header-actions flex w-full min-w-0");
    expect(layout).toContain("sig-section-actions flex w-full min-w-0");
    const pageTopbar = read("src/components/platform/Topbar.tsx");
    expect(pageTopbar).toContain("sig-topbar-actions flex w-full min-w-0");
    expect(rulesFor("max-width: 767px").some((r) =>
      r.selector.includes(".sig-page-title") && declaration(r, "overflow-wrap").includes("anywhere"))).toBe(true);
    expect(read("src/main.tsx")).toContain('import "./styles/sigapro-mobile-legibility-20261121.css";');
  });
});
