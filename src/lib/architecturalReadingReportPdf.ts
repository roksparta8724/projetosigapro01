import { jsPDF } from "jspdf";
import type { DrawingExtraction } from "./architecturalPdfReadings.js";
import type { UrbanTerritorialReadiness } from "./urbanTerritorialReadiness.js";
import { URBAN_METRICS } from "./urbanPrecheck.js";

/**
 * Relatório de evidências da leitura, nunca um parecer de aprovação.
 * Trabalha somente com a resposta já vinculada ao documento autorizado.
 * Não transmite dados e não altera o processo ou a matriz urbanística.
 */
export function createArchitecturalReadingReportPdf(input: {
  extraction: DrawingExtraction;
  processId: string;
  documentId: string;
  documentVersion: number;
  fileName: string;
  territorial?: UrbanTerritorialReadiness | null;
  generatedAt?: Date;
}) {
  if (!input.processId || !input.documentId ||
      !Number.isInteger(input.documentVersion) || input.documentVersion < 1 ||
      !input.fileName.trim() || !Array.isArray(input.extraction.readings) ||
      input.extraction.automaticallyApproved !== false) {
    throw new Error("Dados do documento insuficientes para gerar o relatorio.");
  }
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const left = 17;
  const right = 193;
  let y = 20;
  const clean = (value: unknown) => String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\u0020-\u00FF]/g, " ")
    .replace(/\s+/g, " ").trim();
  const page = () => {
    pdf.addPage();
    y = 19;
  };
  const paragraph = (value: unknown, size = 9, color: [number, number, number] = [40, 54, 69]) => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    const lines: string[] = pdf.splitTextToSize(clean(value), right - left);
    const height = size <= 8 ? 3.8 : 4.7;
    for (const line of lines) {
      if (y + height > 277) page();
      pdf.text(line, left, y);
      y += height;
    }
    y += 2;
  };
  const heading = (value: string) => {
    if (y > 260) page();
    y += 3;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.setTextColor(18, 70, 115);
    pdf.text(clean(value), left, y);
    y += 7;
  };
  pdf.setFillColor(13, 43, 74);
  pdf.rect(0, 0, 210, 12, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.setTextColor(17, 52, 89);
  pdf.text("SIGAPRO  |  LEITURA TECNICA", left, y);
  y += 7;
  pdf.setFontSize(10);
  pdf.setTextColor(153, 72, 21);
  pdf.text("RELATORIO DE EXTRAÇÃO - RASCUNHO SEM APROVACAO", left, y);
  y += 9;
  paragraph("Emitido em: " + (input.generatedAt ?? new Date()).toLocaleString("pt-BR"));
  paragraph("Processo: " + input.processId);
  paragraph("Documento: " + input.fileName);
  paragraph("Identificador: " + input.documentId + "  |  Versao: " + input.documentVersion);
  paragraph("Metodo: " + (input.extraction.source === "pdf_text_local"
    ? "texto selecionavel do proprio PDF, sem IA ou envio externo"
    : input.extraction.source === "ai_pdf_text"
      ? "interpretacao automatizada de texto; sem leitura geometrica"
      : "leitura visual por provedor externo, sujeita a revisao"));
  heading("Resumo e limite do exame");
  paragraph("Projeto arquitetonico reconhecido: " +
    (input.extraction.documentType === "architectural_plan" ? "sim" : "nao comprovado") +
    ". Planta de implantacao confirmada: " +
    (input.extraction.hasSitePlan ? "sim" : "nao") + ".");
  paragraph("Este documento registra somente dados candidatos e seus trechos de origem. " +
    "Nao comprova a geometria CAD, a autenticidade da prancha, o zoneamento, a vigencia das leis, " +
    "o atendimento aos indices urbanisticos nem a regularidade do projeto. " +
    "O analista deve conferir cada medida no arquivo original.");
  heading("Identificacao territorial e zoneamento");
  const territory=input.territorial;
  paragraph("Vinculo cadastral do processo: " +
    (territory?.cadastralLink === "linked" ? "encontrado; dados cadastrais nao equivalem a validacao de zoneamento" :
      territory?.cadastralLink === "missing" ? "AUSENTE - processo sem imovel vinculado" :
      "nao verificado pelo cadastro municipal"));
  paragraph("Endereco do imovel: " + (territory?.address || "NAO COMPROVADO no cadastro vinculado."));
  paragraph("Inscricao cadastral: " + (territory?.registration || territory?.iptu || "NAO COMPROVADA."));
  paragraph("Lote/quadra: " + ((territory?.lot || "nao informado") + " / " +
    (territory?.block || "nao informado")));
  paragraph("Zona cadastrada, NAO homologada: " + (territory?.zoneCandidate || "NAO IDENTIFICADA."));
  paragraph("Zona espacial determinada: " +
    (territory?.zoneVerified && territory.zoneCode
      ? territory.zoneCode + " - mapa oficial revisto, lei urbanistica ainda nao avaliada"
      : "NAO VERIFICADA por geometria cadastrada."));
  if(territory?.zoneVerified){
    paragraph("Versao cartografica: "+(territory.mapVersion||"indeterminada"));
    paragraph("Base legal declarada do mapa: "+(territory.mapLegalReference||"nao informada"));
    paragraph("Hash SHA-256 mapa: "+(territory.mapSha256||"indisponivel"));
    paragraph("Hash SHA-256 lote: "+(territory.parcelSha256||"indisponivel"));
    paragraph("Fonte cartografica: "+(territory.mapSourceUrl||"nao informada"));
  }
  paragraph("Comparacao urbanistica juridica: NAO AVALIADA ate existir norma vigente e evidencias validas por zona, uso e indice.");
  for (const reason of territory?.reasons || []) paragraph("- " + reason, 8);
  heading("Medidas observadas e pendencias");
  for (const metric of URBAN_METRICS) {
    const row = input.extraction.readings.find(reading => reading.metric === metric.key);
    if (y > 250) page();
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9.5);
    pdf.setTextColor(21, 42, 63);
    pdf.text(clean(metric.label), left, y);
    y += 5;
    paragraph(row && row.value !== null && row.usableForReview
      ? "Resultado candidato: " + row.value.toLocaleString("pt-BR") + " " + metric.unit +
        " | Pagina do PDF: " + row.page + " | Estado: requer conferencia humana."
      : "Resultado: nao comprovado. " + (row?.reason ?? "Sem leitura verificavel."), 8.5);
    if (row?.quote) paragraph("Trecho da fonte: " + row.quote, 8, [76, 88, 101]);
  }
  heading("Alertas da leitura");
  if (input.extraction.warnings.length === 0) paragraph("Sem alertas adicionais registrados.");
  for (const warning of input.extraction.warnings) paragraph("- " + warning, 8.5);
  heading("Situacao da conformidade urbanistica");
  paragraph("NAO AVALIADA. Sem cruzamento juridico validado por municipio, zona, uso, " +
    "data, norma oficial, artigo e pagina. Nao emitir parecer de deferimento, indeferimento ou alvara " +
    "a partir deste relatorio.");
  paragraph("Documento informativo para conferencia tecnica. Nenhum dado foi aplicado ou " +
    "aprovado automaticamente pelo download deste arquivo.", 8, [115, 57, 35]);
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    pdf.setPage(i);
    pdf.setDrawColor(208, 218, 228);
    pdf.line(left, 282, right, 282);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    pdf.setTextColor(90, 105, 119);
    pdf.text("SIGAPRO - Evidencia preliminar de leitura, sem efeito de aprovacao.", left, 288);
    pdf.text(i + " / " + total, right, 288, { align: "right" });
  }
  return pdf;
}
