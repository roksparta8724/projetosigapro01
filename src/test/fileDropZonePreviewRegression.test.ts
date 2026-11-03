import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/platform/FileDropZone.tsx"),
  "utf8",
);

describe("FileDropZone PDF preview", () => {
  it("shows the actual first-page PDF preview inside the document card", () => {
    expect(source).toContain("buildPdfPreviewUrl");
    expect(source).toContain('data-file-preview="true"');
    expect(source).toContain("<iframe");
    expect(source).toContain("Pré-visualização do documento anexado");
    expect(source).toContain("#page=1&toolbar=0&navpanes=0&scrollbar=0&view=FitH");
  });

  it("keeps one explicit professional PDF action instead of adding a project-tab action", () => {
    expect(source).toContain("Abrir PDF em nova guia");
    expect(source).not.toContain("Abrir projeto em nova guia");
    expect(source).not.toContain("PDF pronto para visualização sem carregar dentro do card");
  });
});


describe("municipal institutional uploads stay readable in compact cards", () => {
  const configSource = readFileSync(
    resolve(process.cwd(), "src/pages/saas/ConfiguracoesPage.tsx"),
    "utf8",
  );

  it("stacks title, description and picker in all three official identity cards", () => {
    for (const title of ["Brasão oficial", "Bandeira municipal", "Imagem do portal"]) {
      expect(configSource).toContain(`<FileDropZone\n                    stacked\n                    title="${title}"`);
    }
    expect(configSource).toContain("grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3");
    expect(source).toContain('data-upload-layout={stacked ? "stacked" : "auto"}');
    expect(source).toContain('!stacked && "sm:flex-row sm:flex-wrap');
    expect(source).toContain('!stacked && "sm:w-auto"');
  });
});
