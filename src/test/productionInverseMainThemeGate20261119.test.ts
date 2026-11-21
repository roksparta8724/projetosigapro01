import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const frame = readFileSync("src/components/platform/PortalFrame.tsx", "utf8");
const tailwind = readFileSync("tailwind.config.ts", "utf8");

describe("SIGAPRO produção — tema escuro sem regressão de sessão", () => {
  it("usa a mesma opção institucional para o tema e para a classe do Tailwind", () => {
    expect(tailwind).toContain('darkMode: ["class"]');
    expect(frame).toContain('inverseMainTheme && "dark"');
    expect(frame).toContain('data-layout-mode={inverseMainTheme ? "inverse-main" : "default"}');
    expect(frame).toContain('data-theme-family={inverseMainTheme ? "dark" : "light"}');
  });

  it("a correção só envolve o PortalFrame autenticado e não altera tema global público", () => {
    expect(frame).toContain('"sig-app-frame min-h-screen text-foreground"');
    expect(frame).not.toContain('document.documentElement.classList.add("dark")');
    expect(frame).not.toContain('document.body.classList.add("dark")');
    expect(frame).not.toContain('window.location.reload');
  });

  it("não altera controle de acesso, atualização, roteamento ou carregamento do avatar", () => {
    expect(frame).toContain("sig-app-frame");
    expect(frame).toContain('data-focus-mode={focusMode ? "true" : "false"}');
    expect(frame).toContain("focusMode &&");
  });
});
