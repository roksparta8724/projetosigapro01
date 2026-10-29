import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("SIGAPRO IA — revogação de evidência após substituição do PDF", () => {
  it("invalida o conteúdo extraído mesmo quando o identificador permanece igual", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/platform/UrbanDocumentEvidenceDesk.tsx"), "utf8");
    const guard = source.match(/\/\/ A replacement or new version[\s\S]*?\}, \[selected\?\.id, selected\?\.version, selected\?\.fileHash, selected\?\.filePath\]\);/);
    expect(guard).not.toBeNull();
    for (const required of [
      "readAbort.current?.abort()",
      "setExtracted(null)",
      "setPdfBytes(null)",
      "setScanProof(null)",
      'setReadStatus("idle")',
      'setExcerpt("")',
    ]) {
      expect(guard?.[0]).toContain(required);
    }
  });
});
