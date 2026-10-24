import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("SIGAPRO — revogação de pré-leitura de evidências", () => {
  it("cancela operações pendentes e descarta dados quando acesso vira somente leitura", () => {
    const code = readFileSync(resolve(process.cwd(), "src/components/platform/UrbanDocumentEvidenceDesk.tsx"), "utf8");
    const revocation = code.match(/\/\/ Close active reads immediately[\s\S]*?\}, \[readOnly\]\);/)?.[0];
    expect(revocation).toBeDefined();
    for(const required of [
      "readAbort.current?.abort()",
      "setExtracted(null)",
      "setPdfBytes(null)",
      "setScanProof(null)",
      'setReadStatus("idle")',
      'setExcerpt("")',
    ]) expect(revocation).toContain(required);
    expect(code).toContain('if (readOnly || !selected || !selected.filePath || readStatus === "loading")');
  });
});
