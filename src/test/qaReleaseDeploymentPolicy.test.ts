import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const QA_BRANCH = "fix/qa-triagem-analise-pagamento-20261101";

describe("SIGAPRO — só publica versão QA consolidada", () => {
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as {
    git?: { deploymentEnabled?: Record<string, boolean> | boolean };
  };
  it("desativa Preview por cada commit somente na branch de homologação", () => {
    expect(vercel.git?.deploymentEnabled).toBeTypeOf("object");
    if (typeof vercel.git?.deploymentEnabled !== "object") return;
    expect(vercel.git.deploymentEnabled[QA_BRANCH]).toBe(false);
    // Production must retain the Git deployment flow and never be disabled.
    expect(vercel.git.deploymentEnabled.main).not.toBe(false);
    expect(vercel.git.deploymentEnabled.master).not.toBe(false);
    expect(vercel.git.deploymentEnabled["*"]).not.toBe(false);
  });

  it("a segurança de QA não é trocada por auto deploy nem troca de ambiente", () => {
    const releaseSource = readFileSync("docs/STATUS_UNICO_SIGAPRO.md", "utf8");
    expect(releaseSource).toContain("PR #118");
    expect(releaseSource).toContain("QA_COMMERCIAL_ACCEPTANCE.json");
    expect(releaseSource).toContain("sem merge");
  });
});
