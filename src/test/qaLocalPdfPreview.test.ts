import { describe, expect, it } from "vitest";
import {
  QA_LOCAL_PDF_MAX_BYTES, validateQaLocalPdf, type QaLocalPdfLike,
} from "@/lib/qaLocalPdfPreview";

function mockPdf(name: string, data: string, specifiedSize?: number): QaLocalPdfLike {
  const bytes = new TextEncoder().encode(data);
  return {
    name, size: specifiedSize ?? bytes.length,
    slice: (start = 0, end = bytes.length) => {
      const sub = bytes.slice(start, end);
      return {
        arrayBuffer: async () => sub.buffer.slice(sub.byteOffset, sub.byteOffset + sub.byteLength),
      } as Blob;
    },
  };
}

describe("SIGAPRO QA — consulta temporária de PDF local", () => {
  it("aceita PDF pequeno com assinatura correta, sem qualquer upload", async () => {
    await expect(validateQaLocalPdf(mockPdf("implantacao.pdf", "%PDF-1.7\n%%EOF"))).resolves.toBeUndefined();
  });

  it("bloqueia HTML renomeado, extensão diferente, vazios e tamanho excessivo", async () => {
    await expect(validateQaLocalPdf(mockPdf("falso.pdf", "<html>login</html>"))).rejects.toThrow("assinatura");
    await expect(validateQaLocalPdf(mockPdf("imagem.png", "%PDF-1.7\n"))).rejects.toThrow("extensão");
    await expect(validateQaLocalPdf(mockPdf("vazio.pdf", ""))).rejects.toThrow("vazio");
    await expect(validateQaLocalPdf(mockPdf("gigante.pdf", "%PDF-", QA_LOCAL_PDF_MAX_BYTES + 1))).rejects.toThrow("20 MB");
  });
});
