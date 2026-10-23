import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadUrbanPdfBytes, ensureUrbanPdfBytes, URBAN_PDF_MAX_BYTES, URBAN_PDF_MAX_PAGES,
} from "@/lib/urbanPdfTextReader";
import { findUrbanPdfEvidenceCandidates } from "@/lib/urbanTextEvidence";

afterEach(() => vi.unstubAllGlobals());

describe("SIGAPRO: pré-leitura PDF local com limites e evidência humana", () => {
  it("aceita assinatura PDF real e bloqueia formatos e arquivos acima de 20MB", () => {
    expect(() => ensureUrbanPdfBytes(new TextEncoder().encode("%PDF-1.7 sample"))).not.toThrow();
    expect(() => ensureUrbanPdfBytes(new TextEncoder().encode("<html>erro"))).toThrow("PDF válido");
    const oversized = new Uint8Array(URBAN_PDF_MAX_BYTES + 1);
    oversized.set(new TextEncoder().encode("%PDF-"));
    expect(() => ensureUrbanPdfBytes(oversized)).toThrow("20 MB");
    expect(URBAN_PDF_MAX_PAGES).toBe(24);
  });

  it("lê PDF assinado por GET sem credenciais extras e sem servidores de IA", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4\n%%EOF");
    const fetcher = vi.fn().mockResolvedValue(new Response(bytes, {
      status: 200, headers: { "Content-Type": "application/pdf" },
    }));
    vi.stubGlobal("fetch", fetcher);
    const result = await downloadUrbanPdfBytes("http://localhost:8080/api/qa-document?key=signed&sig=123");
    expect(Array.from(result)).toEqual(Array.from(bytes));
    expect(fetcher).toHaveBeenCalledWith(
      "http://localhost:8080/api/qa-document?key=signed&sig=123",
      expect.objectContaining({ method: "GET", credentials: "omit", cache: "no-store" }),
    );
  });

  it("não aceita URL não segura, autenticação vencida ou conteúdo HTML", async () => {
    await expect(downloadUrbanPdfBytes("http://example.org/test.pdf")).rejects.toThrow("inválido");
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("proibido", { status: 403 }))
      .mockResolvedValueOnce(new Response("<html>login</html>", { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(downloadUrbanPdfBytes("https://example.org/signed")).rejects.toThrow("autorização");
    await expect(downloadUrbanPdfBytes("https://example.org/signed")).rejects.toThrow("PDF válido");
  });

  it("só propõe trechos presentes na página real, sem inventar valores", () => {
    const results = findUrbanPdfEvidenceCandidates([
      { page: 2, text: "Art. 12. Recuo frontal mínimo definido na tabela oficial, mediante análise da Prefeitura." },
      { page: 7, text: "Taxa de ocupação: máximo 60% para uso residencial." },
      { page: 9, text: "Certidão de matrícula do imóvel sem regras urbanísticas." },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].metric).toBe("front_setback_m");
    expect(results[0].page).toBe(2);
    expect(results[1].metric).toBe("occupancy_percent");
    expect(results[1].page).toBe(7);
    expect(results.every(x => !("limit" in x))).toBe(true);
  });

  it("não transforma páginas vazias/escaneadas em afirmações técnicas", () => {
    expect(findUrbanPdfEvidenceCandidates([
      { page: 1, text: "" }, { page: 2, text: "    " },
    ])).toEqual([]);
  });
});
