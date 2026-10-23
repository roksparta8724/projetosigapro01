import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(),path),"utf8");
const permit = read("src/components/platform/ConstructionPermitPanel.tsx");
const css = read("src/styles/surface-polarity.css");
const notice = read("src/components/platform/QaDocumentUnavailableNotice.tsx");
const viewer = read("src/pages/saas/DocumentViewerPage.tsx");

describe("SIGAPRO QA: dark institutional cards and guarded PDF fallback", () => {
  it("gives alvará prerequisite cards and draft button explicit themes without changing workflow permissions", () => {
    expect(permit).toContain('data-permit-polarity="adaptive"');
    expect((permit.match(/data-permit-prerequisite-card="true"/g) || [])).toHaveLength(3);
    expect(permit).toContain('data-permit-draft-button="true"');
    expect(permit).toContain('disabled={!canStartDraft}');
    expect(css).toContain('[data-construction-permit-panel="true"] [data-permit-draft-button="true"]:disabled');
    expect(css).toContain('background:#223c54 !important;');
    expect(css).toContain('[data-layout-mode="inverse-main"]');
  });
  it("keeps QA missing file navigation authenticated and does not proxy into production R2", () => {
    expect(viewer).toContain('isQaDocumentMissingError(error)');
    expect(notice).toContain('data-qa-document-missing="true"');
    expect(notice).toContain("Verificar novamente no QA");
    expect(notice).toContain('await onRecovered()');
    expect(notice).toContain('await verifyQaExistingDocumentCopy(');
    expect(notice).toContain('await uploadFile({ bucket: "process-documents", objectKey, file: selectedFile })');
    expect(notice).toContain('import.meta.env.VITE_SIGAPRO_NEON_ISOLATED !== "true"');
    expect(notice).toContain("target=\"_blank\"");
    expect(notice).not.toContain("/api/process-documents/official-view");
  });
});
