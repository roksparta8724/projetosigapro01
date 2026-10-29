import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("SIGAPRO — registro e atualização do histórico", () => {
  it("não informa falha de gravação quando apenas a atualização do histórico falhar", () => {
    const source=readFileSync(resolve(process.cwd(),"src/components/platform/UrbanPrecheckPanel.tsx"),"utf8");
    const saved=source.indexOf("await saveUrbanPrecheckRun(requestedProcessId");
    const confirmed=source.indexOf('setNotice("Pré-conferência registrada no banco. Atualizando o histórico...");');
    const refreshed=source.indexOf("await listUrbanPrecheckHistory(requestedProcessId)",saved);
    expect(saved).toBeGreaterThan(0);
    expect(confirmed).toBeGreaterThan(saved);
    expect(refreshed).toBeGreaterThan(confirmed);
    expect(source).toContain("Consulte o histórico antes de tentar registrar novamente.");
  });
});
