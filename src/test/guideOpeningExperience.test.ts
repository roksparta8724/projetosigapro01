import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("guide opening experience", () => {
  it("never exposes the old full-screen preparation page", () => {
    const guide = read("src/components/GuiaRecolhimentoOficial.tsx");

    expect(guide).not.toContain("Preparando a Guia de Recolhimento");
    expect(guide).not.toContain("Validando os dados da Prefeitura");
    expect(guide).not.toContain("loading-card");
    expect(guide).toContain("popup.blur()");
    expect(guide).toContain("window.focus()");
  });

  it("keeps the preparation feedback inside the SIGAPRO process UI", () => {
    const processPage = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(processPage).toContain('guideBillingBusyKey ? "Preparando guia..." : "Visualizar guia"');
    expect(processPage).toContain("disabled={Boolean(guideBillingBusyKey)}");
  });
});
