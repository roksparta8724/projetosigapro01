import { jsPDF } from "jspdf";
import type { ProcessRecord, UserRole } from "@/lib/platform";

const QA04_ID = "915e1c63-ebda-4cdd-8e95-34316d9e0089";
const QA04_TITLE = "QA-URBAN-E2E-20261024 PROCESSO A FICTÍCIO";

/** Closed default: this fixture never appears in production or other tenants. */
export function isQa04ArchitecturalImportAllowed(input: {
  isolatedQa: boolean;
  role: UserRole;
  process: ProcessRecord | null | undefined;
}): boolean {
  return input.isolatedQa === true &&
    ["prefeitura_admin", "master_admin", "master_ops"].includes(input.role) &&
    input.process?.id === QA04_ID &&
    input.process?.protocol === "PM-2026-00004" &&
    input.process?.title === QA04_TITLE;
}

/** Hypothetical geometry, measured on this drawing - not the municipal legal limits. */
export const QA04_SITE_GEOMETRY = {
  lotFrontM: 12,
  lotDepthM: 25,
  buildingWidthM: 10,
  buildingDepthM: 8,
  frontSetbackM: 5,
  leftSetbackM: 1,
  rightSetbackM: 1,
  rearSetbackM: 12,
} as const;

export function getQa04GeometryChecks() {
  const g = QA04_SITE_GEOMETRY;
  const terrainM2 = g.lotFrontM * g.lotDepthM;
  const builtAreaM2 = g.buildingWidthM * g.buildingDepthM;
  return {
    widthFits: g.leftSetbackM + g.buildingWidthM + g.rightSetbackM === g.lotFrontM,
    depthFits: g.frontSetbackM + g.buildingDepthM + g.rearSetbackM === g.lotDepthM,
    terrainM2,
    builtAreaM2,
    coveragePct: Math.round((builtAreaM2 / terrainM2) * 10000) / 100,
  };
}

/** Three A3 QA sheets: ground floor, dimensioned site placement, and evidence notes. */
export function createQa04ArchitecturalPdf(): File {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
  pdf.setProperties({
    title: "SIGAPRO QA 04 - Projeto ficticio com recuos de implantacao - V2",
    subject: "Ensaios de IA. Medidas propostas nao sao limites legais",
    author: "SIGAPRO QA",
  });
  const geometry = QA04_SITE_GEOMETRY;
  const header = (page: number, title: string) => {
    pdf.setFillColor(17, 42, 64);
    pdf.rect(10, 9, 400, 25, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(16);
    pdf.text("SIGAPRO - ENSAIO DE ANALISE DOCUMENTAL", 16, 21);
    pdf.setFontSize(10);
    pdf.text("PRANCHA " + page + "/3 | PROCESSO FICTICIO 000004/2026", 258, 21);
    pdf.setTextColor(20, 42, 64);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text(title, 17, 45);
    pdf.setTextColor(169, 38, 38);
    pdf.setFontSize(10);
    pdf.text("FICTICIO / QA - SEM VALIDADE PARA APROVACAO, EXECUCAO OU ART/RRT", 18, 284);
  };
  const room = (px: number, py: number, w: number, h: number, name: string, area: string) => {
    pdf.setDrawColor(17, 42, 64);
    pdf.setLineWidth(0.7);
    pdf.rect(px, py, w, h);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(20, 42, 64);
    pdf.setFontSize(9);
    pdf.text(name, px + w / 2, py + h / 2 - 2, { align: "center" });
    pdf.setFontSize(8);
    pdf.text(area, px + w / 2, py + h / 2 + 6, { align: "center" });
  };

  header(1, "01 - PLANTA BAIXA ESQUEMATICA | RESIDENCIAL TERREA | METROS");
  const rx = 55, ry = 65, sc = 17;
  room(rx, ry + 4 * sc, 5 * sc, 4 * sc, "SALA DE ESTAR", "20,00 m2");
  room(rx + 5 * sc, ry + 4 * sc, 5 * sc, 4 * sc, "COZINHA/JANTAR", "20,00 m2");
  room(rx, ry, 4 * sc, 4 * sc, "DORMITORIO 01", "16,00 m2");
  room(rx + 4 * sc, ry, 3 * sc, 4 * sc, "DORMITORIO 02", "12,00 m2");
  room(rx + 7 * sc, ry, 3 * sc, 2.5 * sc, "BANHEIRO", "7,50 m2");
  room(rx + 7 * sc, ry + 2.5 * sc, 3 * sc, 1.5 * sc, "CIRCULACAO", "4,50 m2");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("10,00 m", rx + 5 * sc, ry + 8 * sc + 13, { align: "center" });
  pdf.text("8,00 m", rx - 10, ry + 4 * sc, { angle: 90, align: "center" });
  pdf.text("QUADRO DE AREAS", 245, 65);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  [
    "TERRENO: 12,00 x 25,00 m = 300,00 m2",
    "EDIFICACAO: 10,00 x 8,00 m = 80,00 m2",
    "SALA: 20,00 m2 | COZINHA/JANTAR: 20,00 m2",
    "DORMITORIOS: 16,00 + 12,00 m2",
    "BANHEIRO: 7,50 m2 | CIRCULACAO: 4,50 m2",
    "PAVIMENTOS: 01 | USO: RESIDENCIAL",
    "RECUOS DESENHADOS NA PRANCHA 02",
    "ESCALA: ESQUEMATICA, CONFERIR COTAS",
  ].forEach((line, i) => pdf.text(line, 245, 83 + i * 16));
  pdf.setFontSize(9);
  pdf.text("Area declarada: geometria sintetica; sem desenhos executivos.", 20, 269);

  pdf.addPage("a3", "landscape");
  header(2, "02 - PLANTA DE IMPLANTACAO | DIVISAS, VIA E RECUOS COTADOS (FICTICIOS)");
  const plotX = 94, plotY = 55, scale = 8;
  const plotW = geometry.lotFrontM * scale, plotH = geometry.lotDepthM * scale;
  const buildingX = plotX + geometry.leftSetbackM * scale;
  const buildingY = plotY + geometry.rearSetbackM * scale;
  const buildingW = geometry.buildingWidthM * scale;
  const buildingH = geometry.buildingDepthM * scale;
  pdf.setDrawColor(0, 104, 151);
  pdf.setLineWidth(0.8);
  pdf.rect(plotX, plotY, plotW, plotH);
  pdf.setFillColor(221, 235, 245);
  pdf.setDrawColor(17, 42, 64);
  pdf.setLineWidth(1.2);
  pdf.rect(buildingX, buildingY, buildingW, buildingH, "FD");
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(17, 42, 64);
  pdf.text("EDIFICACAO", buildingX + buildingW / 2, buildingY + buildingH / 2 - 3, { align: "center" });
  pdf.setFontSize(9);
  pdf.text("10,00 x 8,00 m", buildingX + buildingW / 2, buildingY + buildingH / 2 + 7, { align: "center" });
  // Street at bottom, rear boundary at top - visual orientation only.
  pdf.setFillColor(211, 226, 238);
  pdf.rect(plotX - 5, plotY + plotH + 5, plotW + 10, 13, "F");
  pdf.setFontSize(9);
  pdf.text("VIA PUBLICA - FRENTE DO LOTE", plotX + plotW / 2, plotY + plotH + 14, { align: "center" });
  pdf.setFont("helvetica", "normal");
  pdf.text("12,00 m (LARGURA TOTAL)", plotX + plotW / 2, plotY - 12, { align: "center" });
  pdf.text("25,00 m (PROFUNDIDADE)", plotX - 24, plotY + plotH / 2, { angle: 90, align: "center" });
  pdf.text("RECUO LATERAL ESQ.: 1,00 m", 20, buildingY + buildingH / 2);
  pdf.text("RECUO LATERAL DIR.: 1,00 m", 197, buildingY + buildingH / 2);
  pdf.setDrawColor(33, 103, 143);
  pdf.line(plotX, buildingY + buildingH / 2 + 5, buildingX, buildingY + buildingH / 2 + 5);
  pdf.line(buildingX + buildingW, buildingY + buildingH / 2 + 5, plotX + plotW, buildingY + buildingH / 2 + 5);
  const dimX = plotX + plotW + 11;
  const segments: Array<[number, number, string]> = [
    [plotY, buildingY, "FUNDOS: 12,00 m"],
    [buildingY, buildingY + buildingH, "EDIFICACAO: 8,00 m"],
    [buildingY + buildingH, plotY + plotH, "FRENTE: 5,00 m"],
  ];
  pdf.setFontSize(8);
  segments.forEach(([start, end, label]) => {
    pdf.line(dimX, start, dimX, end);
    pdf.line(dimX - 4, start, dimX + 4, start);
    pdf.line(dimX - 4, end, dimX + 4, end);
    pdf.text(label, dimX + 6, (start + end) / 2);
  });
  pdf.setFontSize(12);
  pdf.setFont("helvetica", "bold");
  pdf.text("MEDIDAS EXTRAIVEIS PELA IA", 272, 66);
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  const checks = getQa04GeometryChecks();
  [
    "Lote: 12,00 x 25,00 m = 300,00 m2",
    "Edificacao: 10,00 x 8,00 m = 80,00 m2",
    "Recuo frontal proposto: 5,00 m",
    "Recuo lateral esquerdo: 1,00 m",
    "Recuo lateral direito: 1,00 m",
    "Recuo de fundos proposto: 12,00 m",
    "Conferencia largura: 1 + 10 + 1 = 12 m",
    "Conferencia profundidade: 12 + 8 + 5 = 25 m",
    "Taxa ocupacao calculada: " + checks.coveragePct.toFixed(2).replace(".", ",") + "%",
    "Area descoberta: 220,00 m2",
    "Permeabilidade: NAO DETERMINADA",
    "Recuos minimos LEGAIS: NAO FORNECIDOS",
    "Zoneamento do lote: NAO INFORMADO",
  ].forEach((line, i) => pdf.text(line, 272, 85 + i * 13));
  pdf.setTextColor(160, 35, 35);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("NAO ATESTAR CONFORMIDADE COM LEI NAO IDENTIFICADA.", 272, 267);

  pdf.addPage("a3", "landscape");
  header(3, "03 - MEMORIAL DE ENSAIO | EVIDENCIAS E LIMITES DA ANALISE");
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(20, 42, 64);
  [
    "IDENTIFICACAO: Projeto residencial terreo, protocolo ficticio 000004/2026.",
    "TERRENO: 12,00 x 25,00 m; AREA DO TERRENO: 300,00 m2.",
    "EDIFICACAO: 10,00 x 8,00 m; AREA CONSTRUIDA DECLARADA: 80,00 m2.",
    "RECUOS PROPOSTOS NA IMPLANTACAO: frontal 5,00 m; esquerda 1,00 m;",
    "direita 1,00 m; fundos 12,00 m. CONFERIR COTAS DA PRANCHA 02.",
    "TAXA DE OCUPACAO GEOMETRICA: 26,67%.",
    "TAXA DE PERMEABILIDADE: INDETERMINADA (SEM INFORMACAO DO SOLO).",
    "RECUOS MINIMOS LEGAIS E ZONEAMENTO OFICIAL: NAO FORNECIDOS.",
    "COMPARACAO DE RECUOS COM LEI MUNICIPAL: PENDENTE DE PARAMETROS.",
    "ART/RRT, MATRICULA E MEMORIAL TECNICO REAL: NAO APRESENTADOS.",
    "A IA DEVE EXTRAIR MEDIDAS COM PAGINA/FONTE E INDICAR PENDENCIAS.",
    "A IA NAO DEVE INVENTAR NORMAS, RECUOS MINIMOS OU TAXA PERMEAVEL.",
    "NENHUMA CONCLUSAO DE APROVACAO PODE SER EMITIDA COM ESTE ENSAIO.",
  ].forEach((line, i) => pdf.text(line, 22, 71 + i * 15));
  return new File([pdf.output("blob")],
    "SIGAPRO-QA04-PLANTA-IMPLANTACAO-V2.pdf", { type: "application/pdf" });
}

/** All four QA-only document categories so the receipt/dispatch workflow can be exercised. */
export const QA04_DOCUMENT_LABELS = [
  "Projeto Arquitetônico",
  "Memorial Descritivo",
  "ART/RRT",
  "Escritura/Matrícula",
] as const;

function createAbsentDocumentPlaceholder(label: string, fileName: string): File {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  pdf.setProperties({ title: `SIGAPRO QA04 - ${label} - placeholder inexistente` });
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(175, 30, 30);
  pdf.setFontSize(18);
  pdf.text("FICTICIO / QA - NAO E DOCUMENTO OFICIAL", 15, 28);
  pdf.setTextColor(20, 42, 64);
  pdf.setFontSize(14);
  pdf.text(`Categoria simulada: ${label}`, 15, 50);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.text("Processo 000004/2026 - arquivo de teste automatizado.", 15, 67);
  pdf.text("Nenhuma ART/RRT, matricula ou certidao verdadeira foi emitida.", 15, 79);
  pdf.text("Este anexo apenas testa a presenca documental no Protocolo.", 15, 91);
  pdf.text("A IA e o analista devem sinalizar que nao e evidencia legal valida.", 15, 103);
  pdf.text("Nunca usar para aprovacao municipal ou assinatura.", 15, 115);
  return new File([pdf.output("blob")], fileName, { type: "application/pdf" });
}

export function createQa04DocumentKit(): Array<{ label: string; file: File }> {
  return [
    { label: "Projeto Arquitetônico", file: createQa04ArchitecturalPdf() },
    { label: "Memorial Descritivo", file: createAbsentDocumentPlaceholder(
        "Memorial Descritivo", "SIGAPRO-QA04-MEMORIAL-FICTICIO.pdf") },
    { label: "ART/RRT", file: createAbsentDocumentPlaceholder(
        "ART/RRT", "SIGAPRO-QA04-ART-RRT-INEXISTENTE.pdf") },
    { label: "Escritura/Matrícula", file: createAbsentDocumentPlaceholder(
        "Escritura/Matricula", "SIGAPRO-QA04-MATRICULA-INEXISTENTE.pdf") },
  ];
}
