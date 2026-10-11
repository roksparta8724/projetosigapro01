import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const processDetail = readFileSync(
  resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"),
  "utf8",
);
const analysisPage = readFileSync(
  resolve(process.cwd(), "src/pages/saas/DocumentAnalysisPage.tsx"),
  "utf8",
);
const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
const platform = readFileSync(resolve(process.cwd(), "src/lib/platform.ts"), "utf8");
const backend = readFileSync(
  resolve(process.cwd(), "src/integrations/backend/platformImpl.ts"),
  "utf8",
);
const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261011164000_document_analysis_annotations_v2.sql",
  ),
  "utf8",
);

describe("municipal document analysis workflow", () => {
  it("keeps document uploads owned by the external professional", () => {
    expect(processDetail).toContain(
      'const canUploadProcessDocuments = session.role === "profissional_externo"',
    );
    expect(processDetail).toContain(
      "Somente o profissional externo pode enviar documentos para o processo.",
    );
    expect(processDetail).toContain(
      "O analista não anexa documentos em nome do profissional.",
    );
    expect(processDetail).toContain(
      "Documentos enviados pelo profissional",
    );
  });

  it("opens uploaded documents in a dedicated analysis tab", () => {
    expect(processDetail).toContain("Abrir para análise");
    expect(processDetail).toContain('window.open(analysisUrl, "_blank", "noopener,noreferrer")');
    expect(app).toContain(
      'path="/processos/:processId/documentos/:documentId/analisar"',
    );
    expect(app).toContain("<DocumentAnalysisPage />");
  });

  it("provides persisted highlight and text tools", () => {
    expect(analysisPage).toContain('"highlight" | "text"');
    expect(analysisPage).toContain("Marca-texto");
    expect(analysisPage).toContain("Texto");
    expect(analysisPage).toContain("Salvar marcação");
    expect(analysisPage).toContain("addDocumentAnnotation");
    expect(platform).toContain('kind?: "text" | "highlight"');
    expect(platform).toContain("page?: number");
    expect(backend).toContain('"add_process_document_annotation_v2"');
    expect(migration).toContain(
      "create or replace function public.add_process_document_annotation_v2",
    );
    expect(migration).toContain("_kind not in ('text','highlight')");
    expect(migration).toContain("'page',_page");
  });
});
