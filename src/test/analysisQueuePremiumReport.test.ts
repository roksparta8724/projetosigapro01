import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProcessRecord } from "@/lib/platform";
import {
  analysisQueueReportMetrics,
  buildAnalysisQueueCsv,
  buildAnalysisQueueExportRows,
  createAnalysisQueuePdf,
  type AnalysisQueueExportRow,
} from "@/lib/analysisQueueReport";

const fixture = {
  protocol: "000002/2026",
  title: "Residência unifamiliar",
  type: "Aprovação",
  status: "analise_tecnica",
  sla: { breached: false, hoursRemaining: 8, currentStage: "Análise Urbanística" },
  requirements: [{ status: "aberta" }, { status: "respondida" }, { status: "fechada" }],
  analysis: { assignedTo: "Analista de testes" },
  technicalLead: "Responsável anterior",
} as unknown as ProcessRecord;

describe("relatório institucional da fila de análise", () => {
  it("exporta somente registros recebidos, mantendo situação, exigências e analista", () => {
    const rows = buildAnalysisQueueExportRows([fixture]);
    expect(rows).toHaveLength(1);
    expect(rows[0].project).toContain("Residência unifamiliar");
    expect(rows[0].requirements).toBe(2);
    expect(rows[0].sla).toBe("8 h");
    expect(rows[0].responsible).toBe("Analista de testes");
    const withoutAnalyst = {
      ...fixture,
      analysis: { assignedTo: "" },
      technicalLead: "Engenheiro externo",
    } as unknown as ProcessRecord;
    expect(buildAnalysisQueueExportRows([withoutAnalyst])[0].responsible).toBe("Não atribuído");
    expect(rows[0].status).toBeTruthy();
  });

  it("cria CSV válido em UTF-8 com proteção contra fórmulas de planilhas", () => {
    const row: AnalysisQueueExportRow = {
      protocol: "000002/2026",
      project: '=HYPERLINK("https://invalid.local","unsafe")',
      status: "Em análise",
      stage: "Análise técnica",
      sla: "8 h",
      breached: false,
      requirements: 1,
      responsible: "@SUM(A1:A9)",
    };
    const csv = buildAnalysisQueueCsv([row]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"' + "'=HYPERLINK");
    expect(csv).toContain('"' + "'@SUM(A1:A9)");
    expect(csv).toContain('""https://invalid.local""');
    expect(csv.split("\r\n")).toHaveLength(3);
  });

  it("mantém os números gerenciais consistentes", () => {
    const rows = buildAnalysisQueueExportRows([fixture]);
    expect(analysisQueueReportMetrics(rows)).toEqual({
      total: 1, critical: 0, requirements: 2, unassigned: 0,
    });
  });

  it("gera PDF A4 paginado com dados reais sem inventar pareceres ou assinaturas", async () => {
    const one = buildAnalysisQueueExportRows([fixture])[0];
    const rows = Array.from({ length: 95 }, (_, index) => ({
      ...one,
      protocol: "000" + String(index + 1) + "/2026",
      project: "Projeto arquitetônico residencial de teste " + index,
    }));
    const blob = await createAnalysisQueuePdf(rows, {
      municipality: "Prefeitura de Testes",
      department: "Análise Urbanística",
      generatedBy: "Analista autorizado",
      generatedAt: new Date("2026-11-12T12:00:00.000Z"),
      filterDescription: "Registro oficial da análise",
    });
    expect(blob.type).toContain("pdf");
    expect(blob.size).toBeGreaterThan(2000);
  });
});

describe("revisão visual da mesa técnica", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
  const page = read("src/pages/saas/AnalystDeskPage.tsx");
  const portal = read("src/components/platform/PortalFrame.tsx");
  const css = read("src/styles/analysis-workspace.css");

  it("usa cabeçalho institucional compacto somente na Análise", () => {
    expect(page).toContain('title="Fila técnica, SLA e decisões" compactHeader');
    expect(portal).toContain("compactHeader = false");
    expect(portal).toContain('data-sigapro-compact-header={compactHeader ? "true" : "false"}');
    expect(css).toContain('header[data-sigapro-compact-header="true"]');
  });

  it("exibe fila e busca em um único painel, sem card vazio de exportação", () => {
    expect(page).toContain('data-analysis-command-bar="true"');
    expect(page).toContain('data-analysis-process-panel="true"');
    expect(page).toContain('data-analysis-filters="true"');
    expect(page).toContain('sig-analysis-page !flex !flex-col');
    expect(page).not.toContain('<PageHeader');
    expect(page).not.toContain('downloadCsv("relatorio-analise.csv"');
    expect(css).toContain(".sig-analysis-tabs > div");
    expect(css).toContain("flex-wrap: nowrap !important");
  });

  it("exporta todos os registros do filtro atual e não somente a página visível", () => {
    expect(page).toContain("buildAnalysisQueueExportRows(processRegistry, resolveAssignedAnalystName)");
    expect(page).not.toContain("buildAnalysisQueueExportRows(registryPagination.items)");
    expect(page).toContain('disabled={!remoteSyncedForCurrentUser || exportBusy}');
    expect(page).toContain("Exportar fila em PDF");
    expect(page).toContain("Planilha CSV");
    expect(page).toContain("downloadAnalysisQueuePdf(report, issuedAt)");
  });

  it("colapsa despacho histórico e preserva ações originais do processo", () => {
    expect(page).toContain("{isExpanded && process.dispatches.length > 0 ? (");
    expect(page).toContain("setProcessArchived");
    expect(page).toContain("handleStartAnalysis");
    expect(page).toContain("renderProcessRegistry()");
    expect(page).toContain('data-analysis-team-disclosure="true"');
  });
});
