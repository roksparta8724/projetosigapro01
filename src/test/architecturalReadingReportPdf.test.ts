import { describe, expect, it } from "vitest";
import { createArchitecturalReadingReportPdf } from "@/lib/architecturalReadingReportPdf";
import { normalizeArchitecturalPdfExtraction } from "@/lib/architecturalPdfReadings";

const extraction = normalizeArchitecturalPdfExtraction({
  document_type: "architectural_plan",
  has_site_plan: true,
  warnings: ["A legislacao vigente ainda nao foi conferida."],
  metrics: [
    {metric:"front_setback_m",value:5,page:2,quote:"RECUO FRONTAL: 5,00 m",confidence:"high"},
    {metric:"rear_setback_m",value:12,page:2,quote:"RECUO FUNDOS: 12,00 m",confidence:"high"},
  ],
});

describe("relatorio PDF preliminar da leitura tecnica", () => {
  it("gera PDF A4 real sem alterar a extracao ou marcar aprovacao", () => {
    const before = JSON.stringify(extraction);
    const pdf = createArchitecturalReadingReportPdf({
      extraction,
      processId: "915e1c63-ebda-4cdd-8e95-34316d9e0089",
      documentId: "4c3aa431-0ed5-4a62-9270-bb94ed32944d",
      documentVersion: 2,
      fileName: "SIGAPRO-QA04-PLANTA-IMPLANTACAO-V2.pdf",
      generatedAt: new Date("2026-11-06T12:00:00.000Z"),
    });
    const bytes = new Uint8Array(pdf.output("arraybuffer"));
    expect(bytes.byteLength).toBeGreaterThan(1500);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    expect(pdf.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(extraction)).toBe(before);
    expect(extraction.automaticallyApproved).toBe(false);
  });

  it("recusa vinculo sem documento ou versao valida", () => {
    expect(() => createArchitecturalReadingReportPdf({
      extraction, processId:"p",documentId:"",documentVersion:0,fileName:"",
    })).toThrow("Dados do documento");
  });
});
