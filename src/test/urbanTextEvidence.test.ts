import { describe, expect, it } from "vitest";
import {
  buildUrbanTextEvidence, isUploadedPdfDocument, suggestUrbanTextSignals,
} from "@/lib/urbanTextEvidence";

describe("SIGAPRO IA — rastreabilidade de documentos", () => {
  it("detecta tópicos no trecho sem inventar regra ou limite", () => {
    const result = suggestUrbanTextSignals(
      "Art. 15 — Recuo frontal e taxa de ocupação conforme quadro 2.",
    );
    expect(result.map((signal) => signal.metric))
      .toEqual(["front_setback_m", "occupancy_percent"]);
    expect(result.every((signal) => !("limit" in signal))).toBe(true);
    expect(suggestUrbanTextSignals("Apenas matrícula e titularidade")).toEqual([]);
  });

  it("cita documento, versão, página e trecho informados manualmente", () => {
    const evidence = buildUrbanTextEvidence({
      documentId: "fc2fb721-1e0c-40a1-9807-c2c8408c2e84",
      fileName: "implantacao.pdf",
      documentVersion: 3,
      page: 7,
      excerpt: "Recuo frontal cotado na prancha: quatro metros e cinquenta centímetros.",
    });
    expect(evidence).toContain("implantacao.pdf");
    expect(evidence).toContain("versão 3");
    expect(evidence).toContain("página 7");
    expect(evidence).toContain("documento fc2fb721");
    expect(evidence).toContain("quatro metros");
  });

  it("bloqueia identificador, página e excerto inválidos", () => {
    expect(() => buildUrbanTextEvidence({
      documentId: "../../outro-tenant", fileName: "A.pdf",
      documentVersion: 1, page: 1, excerpt: "trecho verificável",
    })).toThrow();
    expect(() => buildUrbanTextEvidence({
      documentId: "doc-01", fileName: "A.pdf",
      documentVersion: 1, page: 0, excerpt: "trecho verificável",
    })).toThrow();
    expect(() => buildUrbanTextEvidence({
      documentId: "doc-01", fileName: "A.pdf",
      documentVersion: 1, page: 10, excerpt: "curto",
    })).toThrow();
  });

  it("só mostra PDFs enviados com referência de abertura", () => {
    expect(isUploadedPdfDocument({
      uploaded: true, fileName: "implantacao.pdf", filePath: "municipalities/tenant/processes/doc.pdf",
    })).toBe(true);
    expect(isUploadedPdfDocument({
      uploaded: false, fileName: "implantacao.pdf", filePath: "municipalities/tenant/processes/doc.pdf",
    })).toBe(false);
    expect(isUploadedPdfDocument({
      uploaded: true, fileName: "implantacao.pdf",
    })).toBe(false);
    expect(isUploadedPdfDocument({
      uploaded: true, fileName: "private.txt", filePath: "municipalities/tenant/file.txt",
    })).toBe(false);
  });
});
