import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  readFileSync(resolve(process.cwd(), file), "utf8");

const page = read(
  "src/pages/saas/ExternalProcessControlPage.tsx"
);

const css = read(
  "src/styles/surface-polarity.css"
);

describe("marcadores externos no tema institucional", () => {
  it("aplica branco ao texto sem alterar a cor dos icones", () => {
    expect(page).toContain(
      'data-external-process-marker="true"'
    );
    expect(page).toContain(
      'data-external-marker-label="true" className="!text-white"'
    );
    expect(page).toContain(
      'WebkitTextFillColor: "#ffffff"'
    );
    expect(page).toContain(
      'style={{ color: marker.color, fill: marker.color }}'
    );
  });

  it("protege a legenda nos temas claro e escuro", () => {
    const rules = css.slice(
      css.indexOf(
        "SIGAPRO EXTERNAL MARKER LABEL LEGIBILITY V25"
      )
    );

    expect(rules).toContain(
      '[data-layout-mode="default"]'
    );
    expect(rules).toContain(
      '[data-layout-mode="inverse-main"]'
    );
    expect(rules).toContain(
      'span[data-external-marker-label="true"]'
    );
    expect(rules).toContain(
      'color: #ffffff !important'
    );
    expect(rules).toContain(
      '-webkit-text-fill-color: #ffffff !important'
    );
    expect(rules).not.toContain('svg {');
  });
});
