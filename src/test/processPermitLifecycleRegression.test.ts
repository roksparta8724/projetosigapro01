import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const detail = readFileSync(
  resolve(process.cwd(), "src/pages/saas/ProcessDetailPage.tsx"),
  "utf8",
);

describe("process permit lifecycle monotonicity", () => {
  it("never sends a process with a prepared permit back to analysis visually", () => {
    expect(detail).toContain("const permitReachedIssuanceStage =");
    expect(detail).toContain('constructionPermit?.status !== "rascunho"');
    expect(detail).toContain("else if (permitReachedIssuanceStage)");
    expect(detail).toContain("currentFlowIndex = 4");
    expect(detail).toContain(
      'permitReachedIssuanceStage && !isHabiteSeProcess\n        ? "Alvará de Construção"',
    );
  });

  it("shows the real permit state instead of a stale analysis SLA after manual PDF preparation", () => {
    expect(detail).toContain("const effectiveSlaStage =");
    expect(detail).toContain('"Alvará preparado para assinatura manual"');
    expect(detail).toContain('"Alvará aguardando assinatura da Diretoria"');
    expect(detail).toContain(
      'title={effectiveSlaStage}>{effectiveSlaStage}</p>',
    );
  });

  it("keeps the paid ISS and official permit artifact as independent authoritative evidence", () => {
    expect(detail).toContain(
      'issuedConstructionGuide?.status === "compensada"',
    );
    expect(detail).toContain("constructionPermit?.status");
    expect(detail).toContain("Alvará de Construção • assinatura manual");
  });
});
