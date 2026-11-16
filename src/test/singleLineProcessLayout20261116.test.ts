import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("SIGAPRO — controle de processos em uma linha na largura real da Prefeitura", () => {
  const tableCss = read("src/styles/compact-process-registry.css");
  const toolbarCss = read("src/styles/sigapro-process-workspace.css");
  const table = read("src/components/platform/CompactProcessRegistry.tsx");
  const header = read("src/components/platform/ProcessWorkspaceHeader.tsx");

  it("usa oito colunas na área útil de ~1000px com informações e ações na mesma linha", () => {
    const region = tableCss.split(
      "@container sigapro-process-registry (min-width: 940px) and (max-width: 1389px)",
    )[1]?.split("@container sigapro-process-registry (min-width: 600px)")[0] ?? "";
    expect(region).toContain('grid-template-areas: "marker number subject stage owner deadline pending actions"');
    expect(region).toContain(".sig-process-flow-group { display: contents; }");
    expect(region).toContain(".sig-process-stage { grid-area: stage;");
    expect(region).toContain(".sig-process-responsible { grid-area: owner;");
    expect(region).toContain(".sig-process-deadline { grid-area: deadline;");
    expect(region).toContain(".sig-process-pending { grid-area: pending;");
    expect(region).toContain(".sig-process-actions {");
    expect(region).toContain("flex-wrap: nowrap");
    expect(region).toContain("white-space: nowrap");
    expect(region).toContain("text-overflow: ellipsis");
  });

  it("não divide filtros nem os sete comandos da barra em duas linhas", () => {
    const region = toolbarCss.split(
      "@container sig-workspace (min-width: 940px)",
    )[1]?.split("@container sig-workspace (max-width: 939px)")[0] ?? "";
    expect(region).toContain("grid-template-columns: minmax(245px, .31fr) minmax(0, .69fr)");
    for (const key of [".sig-workspace-filters", ".sig-workspace-actions", ".sig-workspace-actions-list"]) {
      expect(region).toContain(key);
    }
    expect((region.match(/flex-wrap: nowrap/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(header).toContain('const multipleDispatch = Boolean(dispatch && selectedCount > 1 && onBulkDispatch)');
    expect(header).not.toContain("Encaminhar seleção</Button>");
  });

  it("oferece visual de uma linha também na mesa com largura intermediária sem forçar overflow", () => {
    expect(tableCss).toContain("@container sigapro-process-registry (min-width: 600px) and (max-width: 939px)");
    expect(tableCss).toContain("@container sigapro-process-registry (min-width: 1390px)");
    expect(table).not.toContain("overflow-x-auto");
    expect(table).not.toContain("min-w-[995px]");
    expect(table).toContain("sig-process-number-link");
    expect(table).toContain("sig-process-actions");
    expect(table).toContain("data-sei-process-row");
  });

  it("conserva os textos completos acessíveis pelo título mesmo quando a célula reduz o texto visual", () => {
    expect(table).toContain('title={"Abrir " + number}');
    expect(table).toContain("Interessado: " + "${process.ownerName}");
    expect(table).toContain("statusLabel(process.status), visibleFlow");
    expect(table).toContain("markers.slice(0, 2)");
    expect(table).toContain("markers.length - 2");
  });
});
