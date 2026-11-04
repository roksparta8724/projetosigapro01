import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("SIGAPRO municipal legal documents — 100 MiB protected server upload",()=>{
  it("uploads legal PDFs through the SIGAPRO backend, never by browser PUT to R2",()=>{
    const file=readFileSync("src/integrations/r2/client.ts","utf8");
    const server=readFileSync("server/api/r2-legal-proxy-upload.ts","utf8");
    expect(file).toContain("isDirectLegalPdfUpload");
    expect(file).toContain('buildApiUrl("/api/r2?action=legal-proxy-upload")');
    expect(file).toContain('LEGAL_PROXY_CHUNK_BYTES = 2 * 1024 * 1024');
    expect(file).toContain('await send({action:"chunk",chunkIndex:index');
    expect(file).toContain('await send({action:"finalize",fileSha256})');
    expect(file).toContain('return uploadLargeLegalPdf(input);');
    expect(server).toContain("MAX_OFFICIAL_LEGAL_PDF_BYTES");
    expect(server).toContain("CompleteMultipartUploadCommand");
    expect(server).toContain("can_manage_urban_legislation_registry_v1");
    const largeUpload = file.slice(file.indexOf("async function uploadLargeLegalPdf("),
      file.indexOf("async function fileToBase64("));
    expect(largeUpload).not.toMatch(/method:\\s*["']PUT/);
  });
  it("raises only municipal legislative PDFs to 100 MB while other uploads retain 30 MB",()=>{
    const file=readFileSync("src/pages/saas/ConfiguracoesPage.tsx","utf8");
    expect(file).toContain('isLegalPdf ? 100 * 1024 * 1024 : 30 * 1024 * 1024');
    expect(file).toContain("Cada campo armazena somente um PDF");
    expect(file).toContain("Para acrescentar quantas leis,");
    expect(file).toContain('appearance="legal"');
    expect(file).toContain("previewInitiallyCollapsed");
  });
});
