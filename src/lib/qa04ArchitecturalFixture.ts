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

/** Completely synthetic vectors and text; intentionally lacks ART/RRT and legal authorization. */
export function createQa04ArchitecturalPdf(): File {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
  pdf.setProperties({
    title: "SIGAPRO QA - 000004/2026 - Planta arquitetônica fictícia",
    subject: "Ensaio exclusivamente documental; sem uso técnico ou legal",
    author: "SIGAPRO QA",
  });
  const header = (page: number, sub: string) => {
    pdf.setFillColor(17, 42, 64);
    pdf.rect(10, 10, 400, 24, "F");
    pdf.setTextColor(255, 255, 255);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text("SIGAPRO - ENSAIO DOCUMENTAL", 17, 22);
    pdf.setFontSize(10);
    pdf.text(`PRANCHA ${page}/2  |  PROTOCOLO FICTICIO 000004/2026`, 250, 22);
    pdf.setTextColor(20, 42, 64);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(11);
    pdf.text(sub, 16, 44);
    pdf.setTextColor(165, 38, 38);
    pdf.setFontSize(10);
    pdf.text("FICTICIO / QA - SEM VALIDADE PARA PROJETO EXECUTIVO, APROVACAO OU ART/RRT", 18, 283);
  };

  header(1, "Planta terrea esquematica | 1 pavimento | medidas informadas em metros");
  const x = 58, y = 69, s = 17;
  pdf.setLineWidth(0.8);
  pdf.setDrawColor(17, 42, 64);
  const room = (px: number, py: number, w: number, h: number, name: string, area: string) => {
    pdf.rect(px, py, w * s, h * s);
    pdf.setFontSize(9);
    pdf.text(name, px + w * s / 2, py + h * s / 2, { align: "center" });
    pdf.setFontSize(8);
    pdf.text(area, px + w * s / 2, py + h * s / 2 + 6, { align: "center" });
  };
  room(x, y + 4 * s, 5, 4, "SALA DE ESTAR", "20,00 m2");
  room(x + 5 * s, y + 4 * s, 5, 4, "COZINHA / JANTAR", "20,00 m2");
  room(x, y, 4, 4, "DORMITORIO 01", "16,00 m2");
  room(x + 4 * s, y, 3, 4, "DORMITORIO 02", "12,00 m2");
  room(x + 7 * s, y, 3, 2.5, "BANHEIRO", "7,50 m2");
  room(x + 7 * s, y + 2.5 * s, 3, 1.5, "CIRCULACAO", "4,50 m2");
  pdf.setFontSize(12);
  pdf.text("10,00 m", x + 85, y + 8 * s + 12, { align: "center" });
  pdf.text("8,00 m", x - 28, y + 70, { angle: 90, align: "center" });
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  pdf.text("QUADRO DE AREAS - TESTE", 266, 64);
  const facts = [
    "Terreno: 300,00 m2", "Lote: 12,00 x 25,00 m",
    "Area construida: 80,00 m2", "Edificacao: 10,00 x 8,00 m",
    "Pavimentos: 01", "Uso: residencial unifamiliar",
    "Sala de estar: 20,00 m2", "Cozinha/jantar: 20,00 m2",
    "Dormitorio 01: 16,00 m2", "Dormitorio 02: 12,00 m2",
    "Banheiro: 7,50 m2", "Circulacao: 4,50 m2",
  ];
  pdf.setFont("helvetica", "normal");pdf.setFontSize(10);
  facts.forEach((fact, i) => pdf.text(fact, 267, 79 + i * 14));
  pdf.setFontSize(9);
  pdf.text("ESQUEMATICO: nao e desenho tecnico para obra.", 18, 266);
  pdf.addPage("a3", "landscape");
  header(2, "Memorial de ensaio + verificacoes que a IA deve executar");
  const lines = [
    "IDENTIFICACAO: Projeto residencial hipotetico, terreo, protocolo ficticio 000004/2026.",
    "TERRENO: 12,00 m x 25,00 m = 300,00 m2; edificacao de 10,00 x 8,00 m.",
    "AMBIENTES: sala de estar 20,00 m2; cozinha/jantar 20,00 m2;",
    "dormitorio 01 16,00 m2; dormitorio 02 12,00 m2; banheiro 7,50 m2;",
    "circulacao 4,50 m2. Area total declarada: 80,00 m2.",
    "PAVIMENTOS: 1. DESTINACAO: residencial unifamiliar.",
    "MATERIAIS HIPOTETICOS: alvenaria de vedacao, esquadrias de aluminio e cobertura ceramica.",
    "DOCUMENTOS NAO FORNECIDOS: ART/RRT, matricula, memorial tecnico real.",
    "PARAMETROS NAO FORNECIDOS: zoneamento municipal oficial, recuos e taxa de permeabilidade.",
    "CONCLUSAO ESPERADA DA IA: extrair dados com evidencias e registrar pendencias.",
    "NAO APROVAR NEM REJEITAR URBANISTICAMENTE SEM LEGISLACAO E DOCUMENTACAO REAL.",
  ];
  pdf.setFontSize(12);
  lines.forEach((line, i) => pdf.text(line, 22, 69 + i * 18));
  return new File([pdf.output("blob")], "SIGAPRO-QA04-PLANTA-FICTICIA.pdf", { type: "application/pdf" });
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
