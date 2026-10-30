import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const importer = readFileSync("src/components/platform/UrbanLegalMatrixImporter.tsx", "utf8");
const css = readFileSync("src/styles/surface-polarity.css", "utf8");

describe("SIGAPRO — contrato de contraste premium para novos botões", () => {
  it("obriga o botão de pré-preenchimento a declarar o estado visual escuro", () => {
    expect(importer).toContain('data-urban-review-apply="true" data-sigapro-contrast="dark"');
    expect(importer).toContain("Pré-preencher página, zona e uso para conferência");
    expect(importer).toContain("sig-premium-dark-action");
  });
  it("aplica a mesma proteção no botão que registra rascunhos, sem ativar normas", () => {
    expect(importer).toContain('data-sigapro-contrast="dark" disabled={busy||!checked.length||!qaWriteEnabled');
    expect(importer).not.toContain("activateUrbanRegulation(");
  });
  it("usa texto branco e text-fill branco com fundo escuro e foco visível", () => {
    expect(css).toContain('button[data-sigapro-contrast="dark"]');
    expect(css).toContain('color:#ffffff !important;');
    expect(css).toContain('-webkit-text-fill-color:#ffffff !important;');
    expect(css).toContain('background-image:linear-gradient(120deg,#071b32 0%,#075985 100%) !important;');
    expect(css).toContain('button[data-sigapro-contrast="dark"]:hover:not(:disabled)');
    expect(css).toContain('button[data-sigapro-contrast="dark"]:focus-visible');
    expect(css).toContain('button[data-sigapro-contrast="dark"]:disabled');
  });
});
