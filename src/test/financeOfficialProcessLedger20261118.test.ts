import { describe, expect, it } from "vitest";
import { findOfficialProcessSequenceConflicts, groupFinancialGuidesByProcess } from "@/lib/financeOfficialProcessLedger";
import { readFileSync } from "node:fs";
const source = readFileSync("src/pages/saas/FinanceDeskPage.tsx", "utf8");
const css = readFileSync("src/styles/sigapro-finance-premium.css", "utf8");
describe("SIGAPRO — sequência oficial única por processo, múltiplas guias", () => {
  const rows = [
    { process: { id: "p05", seq: "2026/5" }, guide: { code: "DAM-2026-00005" } },
    { process: { id: "p04", seq: "2026/4" }, guide: { code: "DAM-2026-00004" } },
    { process: { id: "p03", seq: "2026/3" }, guide: { code: "DAM-2026-00003" } },
    { process: { id: "p03", seq: "2026/3" }, guide: { code: "DAM-HAB-2026-00003" } },
    { process: { id: "p02", seq: "2026/2" }, guide: { code: "DAM-2026-00002" } },
    { process: { id: "p02", seq: "2026/2" }, guide: { code: "DAM-ISS-2026-00002" } },
    { process: { id: "p01", seq: "2026/1" }, guide: { code: "DAM-2026-00001" } },
  ];
  it("mostra sete guias em cinco processos, sem perder tipos ou códigos originais", () => {
    const grouped = groupFinancialGuidesByProcess(rows);
    expect(grouped.map(x => x.process.seq)).toEqual(["2026/5", "2026/4", "2026/3", "2026/2", "2026/1"]);
    expect(grouped.map(x => x.guides.length)).toEqual([1,1,2,2,1]);
    expect(grouped.flatMap(x => x.guides.map(g => g.code))).toEqual(rows.map(r => r.guide.code));
  });
  it("pagina processos inteiros e não separa DAM e Habite-se da mesma pasta", () => {
    const groups = groupFinancialGuidesByProcess(rows);
    expect(groups.slice(0,3).flatMap(x => x.guides).map(x => x.code)).toEqual([
      "DAM-2026-00005", "DAM-2026-00004", "DAM-2026-00003", "DAM-HAB-2026-00003",
    ]);
    expect(groups.slice(3).flatMap(x => x.guides)).toHaveLength(3);
    expect(source).toContain("paginatedIssuedProcessGroups = groupedIssuedProcessRows.slice(");
    expect(source).toContain("data-guide-group-position={isPrimaryProcessGuide ? \"first\" : \"linked\"}");
  });
  it("distingue número repetido na mesma pasta de colisão entre pastas diferentes", () => {
    const keyOf = (p: { id: string; seq: string }) => p.seq;
    expect(findOfficialProcessSequenceConflicts(rows, keyOf)).toEqual([]);
    expect(findOfficialProcessSequenceConflicts([...rows, {
      process: { id: "outra-pasta", seq: "2026/3" }, guide: { code: "X" },
    }], keyOf)).toEqual(["2026/3"]);
    expect(source).toContain('data-finance-sequence-conflict="true"');
    expect(source).toContain("nenhuma numeração foi alterada");
  });
  it("exibe a sequência só na primeira guia; complementos têm marcador próprio e checkbox único", () => {
    expect(source).toContain("isPrimaryProcessGuide ? (");
    expect(source).toContain("sig-finance-ledger__linked-guide-marker");
    expect(source).toContain("Guia adicional do mesmo processo");
    expect(source).toContain("Guia \" + (guideIndex + 1) + \" de \" + guides.length");
    expect(css).toContain(".sig-finance-ledger__process-group");
    expect(css).toContain(".sig-finance-ledger__linked-guide-marker");
  });
});
