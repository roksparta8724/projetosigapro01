import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("guide opening experience", () => {
  it("never exposes an intermediary preparation document", () => {
    const guide = read("src/components/GuiaRecolhimentoOficial.tsx");

    expect(guide).not.toContain("Preparando a Guia de Recolhimento");
    expect(guide).not.toContain("Validando os dados da Prefeitura");
    expect(guide).not.toContain("reserveGuiaRecolhimentoWindow");
    expect(guide).not.toContain("loading-card");
    expect(guide).toContain("URL.createObjectURL");
    expect(guide).toContain('window.open(previewUrl, "_blank")');
  });

  it("prepares banking and logo data inside SIGAPRO before the user opens the DAM", () => {
    const processPage = read("src/pages/saas/ProcessDetailPage.tsx");

    expect(processPage).toContain("preparedGuideCharges");
    expect(processPage).toContain("preparedGuideLogoUrl");
    expect(processPage).toContain("ensureMercadoPagoGuideCharge");
    expect(processPage).toContain('setGuideBillingBusyKey("preparing-guides")');
    expect(processPage).not.toContain("showGuiaRecolhimentoError");
    expect(processPage).not.toContain("reserveGuiaRecolhimentoWindow");
  });

  it("prints the DAM at a controlled A4 visual scale instead of oversized content", () => {
    const guide = read("src/components/GuiaRecolhimentoOficial.tsx");

    expect(guide).toContain(".dam-root {");
    expect(guide).toContain("zoom: 0.90;");
    expect(guide).toContain("width: 111.111%;");
    expect(guide).toContain("transform-origin: top center;");
    expect(guide).toContain("@media print");
  });
});
