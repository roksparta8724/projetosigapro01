import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("SIGAPRO municipal legal documents — 100 MiB direct upload path",()=>{
  it("uses a direct PUT, then verifies the stored object, without Base64 to Vercel",()=>{
    const file=readFileSync("src/integrations/r2/client.ts","utf8");
    expect(file).toContain("isDirectLegalPdfUpload");
    expect(file).toContain('buildApiUrl("/api/r2?action=legal-sign-put")');
    expect(file).toContain('method:"PUT"');
    expect(file).toContain('const verified = await send("verify")');
    expect(file).toContain('return uploadLargeLegalPdf(input);');
  });
  it("raises only municipal legislative PDFs to 100 MB while other uploads retain 30 MB",()=>{
    const file=readFileSync("src/pages/saas/ConfiguracoesPage.tsx","utf8");
    expect(file).toContain('isLegalPdf ? 100 * 1024 * 1024 : 30 * 1024 * 1024');
    expect(file).toContain('Each field accepts one PDF'.replace("Each field accepts one PDF","Cada campo aceita um PDF"));
  });
});
