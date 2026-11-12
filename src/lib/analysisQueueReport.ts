import {
  formatOfficialProcessNumber,
  formatOfficialProcessTitle,
  statusLabel,
  type ProcessRecord,
} from "@/lib/platform";

export type AnalysisQueueExportRow = {
  protocol: string;
  project: string;
  status: string;
  stage: string;
  sla: string;
  breached: boolean;
  requirements: number;
  responsible: string;
};

export type AnalysisQueueReportContext = {
  municipality: string;
  department: string;
  generatedBy: string;
  generatedAt: Date;
  filterDescription: string;
};

const normalizeText = (value: unknown, fallback = "Não informado") => {
  const safe = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return safe || fallback;
};

export function buildAnalysisQueueExportRows(processes: readonly ProcessRecord[]): AnalysisQueueExportRow[] {
  return processes.map((process) => {
    const remaining = Number(process.sla?.hoursRemaining);
    const breached = Boolean(process.sla?.breached);
    return {
      protocol: normalizeText(formatOfficialProcessNumber(process.protocol)),
      project: normalizeText(formatOfficialProcessTitle({ title: process.title, type: process.type })),
      status: normalizeText(statusLabel(process.status)),
      stage: normalizeText(process.sla?.currentStage),
      sla: breached ? "Vencido" : Number.isFinite(remaining) ? Math.max(0, remaining).toFixed(0) + " h" : "—",
      breached,
      requirements: process.requirements.filter((item) =>
        item.status === "aberta" || item.status === "respondida",
      ).length,
      responsible: normalizeText(process.analysis?.assignedTo || process.technicalLead, "Não atribuído"),
    };
  });
}

function csvField(value: string | number): string {
  const literal = String(value).replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  // Neutralize formula execution in Excel/LibreOffice from untrusted fields.
  const safe = /^[=+\-@]/.test(literal) ? "'" + literal : literal;
  return '"' + safe.replace(/"/g, '""') + '"';
}

export function buildAnalysisQueueCsv(rows: readonly AnalysisQueueExportRow[]): string {
  const all = [
    ["Protocolo", "Projeto", "Situação", "Etapa atual", "Prazo / SLA", "Exigências abertas", "Responsável"],
    ...rows.map((row) => [
      row.protocol, row.project, row.status, row.stage, row.sla,
      String(row.requirements), row.responsible,
    ]),
  ];
  return "\uFEFF" + all.map((line) => line.map(csvField).join(";")).join("\r\n") + "\r\n";
}

export function downloadAnalysisQueueCsv(rows: readonly AnalysisQueueExportRow[], date = new Date()) {
  const csv = buildAnalysisQueueCsv(rows);
  const file = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = window.URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sigapro-fila-analise-" + date.toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1200);
}

export function analysisQueueReportMetrics(rows: readonly AnalysisQueueExportRow[]) {
  return {
    total: rows.length,
    critical: rows.filter((row) => row.breached || row.sla === "0 h").length,
    requirements: rows.reduce((sum, row) => sum + row.requirements, 0),
    unassigned: rows.filter((row) => row.responsible === "Não atribuído").length,
  };
}

export async function createAnalysisQueuePdf(
  rows: readonly AnalysisQueueExportRow[],
  context: AnalysisQueueReportContext,
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
  pdf.setProperties({
    title: "SIGAPRO | Relatório gerencial da fila de análise",
    subject: "Registro operacional de processos da Análise Urbanística",
    author: "SIGAPRO",
    creator: "SIGAPRO",
  });
  const W = 297;
  const H = 210;
  const L = 16;
  const R = 16;
  const HEADER_Y = 77;
  const BOTTOM_Y = 188;
  const widths = [34, 76, 44, 34, 21, 56];
  const columns = ["PROCESSO", "PROJETO / OBJETO", "SITUAÇÃO", "ETAPA / SLA", "EXIG.", "RESPONSÁVEL"];
  const positions = widths.map((_, index) => L + widths.slice(0, index).reduce((a, b) => a + b, 0));
  const metrics = analysisQueueReportMetrics(rows);
  const generated = context.generatedAt.toLocaleString("pt-BR", {
    dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
  });
  const municipality = normalizeText(context.municipality, "Prefeitura não identificada");
  const department = normalizeText(context.department, "Análise Urbanística");
  const author = normalizeText(context.generatedBy, "Usuário autenticado");
  const filter = normalizeText(context.filterDescription, "Todos os processos disponíveis");
  const dark: [number, number, number] = [14, 38, 59];
  const teal: [number, number, number] = [8, 112, 145];

  const textAt = (
    text: string, x: number, y: number, size: number, color: [number, number, number],
    style: "normal" | "bold" = "normal",
  ) => {
    pdf.setFont("helvetica", style);
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    pdf.text(text, x, y);
  };

  const writePageHeader = (continued: boolean) => {
    pdf.setFillColor(...dark);
    pdf.rect(0, 0, W, 31, "F");
    pdf.setFillColor(...teal);
    pdf.rect(0, 0, 4, 31, "F");
    textAt("SIGAPRO", L, 12, 15, [255, 255, 255], "bold");
    textAt("GESTÃO MUNICIPAL · ANÁLISE TÉCNICA", L, 19, 7.3, [191, 225, 240], "normal");
    const municipalLines: string[] = pdf.splitTextToSize(municipality, 143);
    textAt(municipalLines[0] || municipality, 136, 12, 11, [255, 255, 255], "bold");
    textAt(department.slice(0, 90), 136, 19, 8, [207, 226, 239]);
    textAt(continued ? "CONTINUAÇÃO DO RELATÓRIO" : "RELATÓRIO GERENCIAL", L, 43, 8, teal, "bold");
    textAt("Fila de processos da análise", L, 52, 15, dark, "bold");
    textAt("Emissão: " + generated + "  ·  Responsável: " + author.slice(0, 90), L, 60, 8, [67, 85, 105]);
    pdf.setDrawColor(216, 227, 237);
    pdf.line(L, 64, W - R, 64);
    const counters = [
      "PROCESSOS  " + metrics.total,
      "SLA CRÍTICO  " + metrics.critical,
      "EXIGÊNCIAS  " + metrics.requirements,
      "SEM ANALISTA  " + metrics.unassigned,
    ];
    let x = L;
    for (const label of counters) {
      const cw = label.includes("PROCESSOS") ? 56 : label.includes("SLA") ? 56 : label.includes("EXIGÊNCIAS") ? 70 : 79;
      pdf.setFillColor(240, 246, 250);
      pdf.roundedRect(x, 67, cw - 3, 8, 1.8, 1.8, "F");
      textAt(label, x + 3, 72.2, 7.4, dark, "bold");
      x += cw;
    }
    pdf.setFillColor(229, 239, 247);
    pdf.rect(L, HEADER_Y, W - L - R, 10, "F");
    columns.forEach((header, index) => textAt(header, positions[index] + 2, HEADER_Y + 6.4, 7.1, dark, "bold"));
  };

  let currentY = HEADER_Y + 10;
  writePageHeader(false);

  if (rows.length === 0) {
    textAt("Nenhum processo correspondente aos filtros no momento da emissão.", L + 5, currentY + 12, 10, [78, 94, 110]);
  }

  for (const [index, row] of rows.entries()) {
    const values = [
      row.protocol, row.project, row.status,
      row.stage + (row.stage === "Não informado" ? "" : " · ") + row.sla,
      String(row.requirements), row.responsible,
    ];
    const maxHeights = values.map((value, colIndex) => {
      pdf.setFontSize(8.1);
      return (pdf.splitTextToSize(value, widths[colIndex] - 5) as string[]);
    });
    const maxLines = Math.max(...maxHeights.map((lines) => lines.length));
    const height = Math.max(12, 4.1 * maxLines + 4.2);
    if (currentY + height > BOTTOM_Y) {
      pdf.addPage();
      writePageHeader(true);
      currentY = HEADER_Y + 10;
    }
    if (index % 2 === 0) {
      pdf.setFillColor(248, 251, 253);
      pdf.rect(L, currentY, W - L - R, height, "F");
    }
    pdf.setDrawColor(231, 238, 244);
    pdf.line(L, currentY + height, W - R, currentY + height);
    maxHeights.forEach((lines, colIndex) => {
      const isAlert = colIndex === 3 && row.breached;
      pdf.setFont("helvetica", colIndex === 0 ? "bold" : "normal");
      pdf.setFontSize(8.1);
      pdf.setTextColor(...(isAlert ? [171, 55, 49] as const : [33, 52, 69] as const));
      pdf.text(lines, positions[colIndex] + 2, currentY + 5.4);
    });
    currentY += height;
  }

  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setDrawColor(216, 227, 237);
    pdf.line(L, 194, W - R, 194);
    textAt("FILTRO: " + (pdf.splitTextToSize(filter, 182)[0] || filter), L, 199, 7.1, [80, 100, 116]);
    textAt("Página " + i + " de " + pages, W - R - 28, 199, 8, dark, "bold");
    textAt("Documento gerencial. Não substitui parecer, despacho, assinatura ou registro oficial do processo.", L, 205, 7.2, [102, 118, 131]);
  }
  return pdf.output("blob");
}

export function downloadAnalysisQueuePdf(blob: Blob, date = new Date()) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sigapro-relatorio-fila-analise-" + date.toISOString().slice(0, 10) + ".pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1200);
}
