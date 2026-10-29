import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("SIGAPRO IA - alterações feitas durante gravação", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/platform/UrbanPrecheckPanel.tsx"), "utf8");
  const save = source.slice(source.indexOf("const save = async () =>"), source.indexOf("const retryHistory = async () =>"));

  it("mantém o retrato da versão submetida e distingue edições posteriores", () => {
    expect(source).toContain("activeSnapshotRef.current = currentSnapshot;");
    expect(save).toContain("setLastSavedSnapshot(currentSnapshot)");
    expect(save).toContain("activeSnapshotRef.current === currentSnapshot");
    expect(save).toContain("Existem alterações posteriores nesta tela que ainda não foram salvas.");
  });

  it("não afirma que alterações novas foram gravadas quando o histórico falha", () => {
    expect(save).toContain("A versão anterior foi registrada no banco; as alterações recentes não foram salvas.");
    expect(save).toContain("Consulte-o antes de registrar novamente.");
  });
});
