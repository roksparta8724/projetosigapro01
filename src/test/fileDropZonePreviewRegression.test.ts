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
