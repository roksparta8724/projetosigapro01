// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { LandingHeader } from "@/components/landing/LandingHeader";

const page = readFileSync("src/pages/saas/LandingPage.tsx", "utf8");
const header = readFileSync("src/components/landing/LandingHeader.tsx", "utf8");
const modal = readFileSync("src/components/landing/LandingDemoModal.tsx", "utf8");
const css = readFileSync("src/styles/sigapro-landing-demo-premium.css", "utf8");

function luminance(hex: string): number {
  const channels = hex.slice(1).match(/../g)!.map(s => parseInt(s, 16) / 255);
  const rgb = channels.map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrastRatio(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

describe("SIGAPRO — Solicitar demonstração premium, legível e funcional", () => {
  it("reproduz o clique real da chamada no cabeçalho em vez de um botão ornamental", () => {
    const onOpenDemo = vi.fn();
    render(<MemoryRouter>
      <LandingHeader navItems={[]} onOpenDemo={onOpenDemo} />
    </MemoryRouter>);
    const button = screen.getByRole("button", { name: "Solicitar demonstração" });
    expect(button).toHaveAttribute("data-landing-demo-trigger", "desktop");
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    fireEvent.click(button);
    expect(onOpenDemo).toHaveBeenCalledTimes(1);
  });

  it("diferencia a chamada de demonstração do acesso, incluindo celular e hero", () => {
    for (const marker of ['data-landing-demo-trigger="desktop"', 'data-landing-demo-trigger="mobile"']) {
      expect(header).toContain(marker);
    }
    expect(page).toContain('data-landing-demo-trigger="hero"');
    expect(page).toContain('data-landing-demo-trigger="card"');
    expect(page).toContain('data-landing-demo-access="true"');
    expect(header).toContain("onOpenDemo()");
    expect(page).toContain("setDemoModalOpen(true)");
    expect(page).toContain("onClick={() => setDemoModalOpen(true)}");
    expect(page).toContain('import "@/styles/sigapro-landing-demo-premium.css"');
  });

  it("remove card escuro translúcido e dá hierarquia clara a título, conteúdo e ações", () => {
    expect(page).toContain('data-landing-demo-card="premium"');
    expect(page).toContain('data-landing-demo-card-title="true"');
    expect(page).toContain('data-landing-demo-card-description="true"');
    expect(page).toContain('data-landing-demo-card-note="true"');
    expect(page).toContain('aria-labelledby="landing-demo-card-title"');
    expect(page).not.toContain('rounded-[34px] border border-white/12 bg-white/[0.07]');
    expect(css).toContain('background: linear-gradient(135deg, #ffffff 0%, #f1f8fc 100%) !important');
    expect(css).toContain('[data-landing-demo-trigger="desktop"]');
    expect(css).toContain('[data-landing-demo-trigger="card"]');
  });

  it("cumpre contraste mínimo de 4,5:1 nos elementos de texto principais", () => {
    for (const [foreground, background] of [
      ["#103e5c", "#d9f4ff"], // CTA superior sobre azul claro
      ["#ffffff", "#104665"], // botão principal escuro
      ["#14354d", "#f1f8fc"], // título do card
      ["#49677d", "#f1f8fc"], // descrição do card
      ["#557187", "#f1f8fc"], // rodapé do card
      ["#226185", "#ffffff"], // etiqueta
      ["#214a65", "#ffffff"], // botão secundário
      ["#596f82", "#ffffff"], // placeholder do formulário
    ]) {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
    expect(css).toContain("-webkit-text-fill-color: #103e5c !important");
    expect(css).toContain("-webkit-text-fill-color: #ffffff !important");
    expect(css).toContain(":focus-visible");
  });

  it("preserva formulário, validações, envio e estados de sucesso/erro da demonstração", () => {
    expect(modal).toContain('data-landing-demo-modal="showcase"');
    expect(modal).toContain('data-landing-demo-modal="contact"');
    expect(modal).toContain('data-landing-demo-contact-form="true"');
    expect(modal).toContain('data-landing-demo-submit="true"');
    expect(modal).toContain("saveDemoContactRequest(payload)");
    expect(modal).toContain('setContactStatus("success")');
    expect(modal).toContain('setContactStatus("error")');
    expect(css).toContain('[data-landing-demo-modal="contact"]');
    expect(css).toContain('[data-landing-demo-contact-form="true"]');
  });
});
