import { jsPDF } from "jspdf";
import type { DrawingExtraction } from "./architecturalPdfReadings.js";
import type { UrbanTerritorialReadiness } from "./urbanTerritorialReadiness.js";
import type { UrbanExistingLegalBaseline } from "./urbanExistingLegalBaseline.js";
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
  /** Data declared in the process record, never certified by this report. */
  identification?: {
    municipalityId?: string;
    municipalityName?: string;
    protocol?: string;
    ownerName?: string;
    ownerDocument?: string;
    professionalName?: string;
    propertyAddress?: string;
    propertyRegistration?: string;
    lot?: string;
    block?: string;
    declaredUse?: string;
  };
  territorial?: UrbanTerritorialReadiness | null;
  legalBaseline?: UrbanExistingLegalBaseline | null;
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
  pdf.text(input.extraction.source === "pdf_text_local"
    ? "EXTRACAO LOCAL DE COTAS - SEM APROVACAO"
    : input.extraction.source === "ai_pdf_text"
      ? "INTERPRETACAO DE TEXTO POR IA - SEM APROVACAO"
      : "LEITURA VISUAL POR IA - SEM APROVACAO", left, y);
  y += 9;
  paragraph("Emitido em: " + (input.generatedAt ?? new Date()).toLocaleString("pt-BR"));
  paragraph("Processo administrativo: " + (input.identification?.protocol?.trim() || input.processId));
  heading("Identificacao do processo e das partes");
  paragraph("Prefeitura: " + (input.identification?.municipalityName?.trim() || "nao identificada neste contexto") +
    "  |  Codigo municipal: " + (input.identification?.municipalityId || "nao informado"));
  paragraph("Proprietario: " + (input.identification?.ownerName?.trim() || "nao informado no processo") +
    (input.identification?.ownerDocument?.trim() ? "  |  Documento declarado: " + input.identification.ownerDocument : ""));
  paragraph("Responsavel tecnico: " + (input.identification?.professionalName?.trim() || "nao informado no processo"));
  paragraph("Endereco declarado do imovel: " + (input.identification?.propertyAddress?.trim() || "nao informado no processo"));
  paragraph("Inscricao declarada: " + (input.identification?.propertyRegistration?.trim() || "nao informada") +
    "  |  Lote/quadra: " + (input.identification?.lot?.trim() || "n/i") + " / " +
      (input.identification?.block?.trim() || "n/i"));
  if(input.identification?.declaredUse?.trim())
    paragraph("Uso informado: " + input.identification.declaredUse);
  paragraph("Identificacao obtida do cadastro processual. Nao prova matricula, titularidade ou localizacao georreferenciada.",8);
  heading("Documento e metodo de leitura");
  paragraph("Documento: " + input.fileName);
  paragraph("Identificador: " + input.documentId + "  |  Versao: " + input.documentVersion);
  paragraph("Metodo: " + (input.extraction.source === "pdf_text_local"
    ? "texto selecionavel do proprio PDF, sem IA ou envio externo"
    : input.extraction.source === "ai_pdf_text"
      ? "interpretacao automatizada de texto; sem leitura geometrica"
      : "leitura visual por provedor externo, sujeita a revisao"));
  heading("Resultado da extracao (sem juizo de conformidade)");
  paragraph("Projeto arquitetonico reconhecido: " +
    (input.extraction.documentType === "architectural_plan" ? "sim" : "nao comprovado") +
    ". Planta de implantacao confirmada: " +
    (input.extraction.hasSitePlan ? "sim" : "nao") + ".");
  paragraph("Este documento registra somente dados candidatos e seus trechos de origem. " +
    "Nao comprova a geometria CAD, a autenticidade da prancha, o zoneamento, a vigencia das leis, " +
    "o atendimento aos indices urbanisticos nem a regularidade do projeto. " +
    "O analista deve conferir cada medida no arquivo original.");
  heading("Inventario de paginas e escopo verificado");
  const audit=input.extraction.pageAudit;
  if(audit){
    paragraph("Total de paginas confirmado pela estrutura do PDF: "+
      (audit.countVerified?audit.count:"nao comprovado")+".");
    paragraph("Paginas com medidas citadas: "+
      (audit.evidencePages.join(", ")||"nenhuma")+".");
    if(audit.pagesWithoutMeasurementEvidence.length)
      paragraph("Paginas sem evidencias de medidas confirmadas: "+
        audit.pagesWithoutMeasurementEvidence.join(", ")+".");
    paragraph(audit.note);
  }else{
    paragraph("Inventario de paginas nao fornecido. A verificacao integral da planta nao foi comprovada.");
  }
  paragraph("A contagem e a extracao textual nao equivalem a leitura visual nem a conferencia de todas as pranchas.");
  heading("Cadastro territorial e zoneamento");
  const territory=input.territorial;
  paragraph("Situacao: " + (territory?.cadastralLink === "linked"
    ? "cadastro vinculado - validar a geometria do lote e a zona oficial"
    : "PENDENTE DE VINCULO IMOBILIARIO; nao e irregularidade comprovada."));
  paragraph("Vinculo cadastral do processo: " +
    (territory?.cadastralLink === "linked" ? "encontrado; dados cadastrais nao equivalem a validacao de zoneamento" :
      territory?.cadastralLink === "missing" ? "AUSENTE - processo sem imovel vinculado" :
      "nao verificado pelo cadastro municipal"));
  paragraph("Endereco comprovado no cadastro territorial: " + (territory?.address || "ainda nao disponivel."));
  paragraph("Inscricao territorial vinculada: " + (territory?.registration || territory?.iptu || "ainda nao disponivel."));
  paragraph("Lote/quadra: " + ((territory?.lot || "nao informado") + " / " +
    (territory?.block || "nao informado")));
  paragraph("Zona declarada sem homologacao: " + (territory?.zoneCandidate || "nao identificada."));
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
  paragraph("Conformidade urbanistica: NAO AVALIADA. Pendencia de vinculo do lote, poligono oficial, uso e norma vigente com evidencias legais. Ausencia desses dados NAO equivale a nao conformidade.");
  for (const reason of territory?.reasons || []) paragraph("- " + reason, 8);
  heading("Acervo municipal anteriormente cadastrado");
  const base=input.legalBaseline;
  if(base?.status==="available"){
    paragraph("Quadro I: "+base.quadroI.reviewed+"/"+base.quadroI.rows+
      " leituras humanas conferidas; "+base.quadroI.needsCorrection+
      " ressalva(s); "+base.quadroI.pending+" pendencia(s).");
    paragraph("Quadro II: "+base.quadroII.draftEntries+
      " rascunhos, "+base.quadroII.pages+
      " paginas de evidencias; leitura sem vigencia legal confirmada.");
    paragraph("Fontes documentais registradas no acervo legado: "+
      (base.documents.map(item=>item.name).join("; ")||"nenhuma vinculada."));
    paragraph("Regulamentacoes oficiais ativas: "+base.activeRealRegulations+
      "; escopos juridicos validados: "+base.verifiedLegalScopes+".");
    if(base.quadroI.sourceSha256)
      paragraph("SHA-256 da matriz original: "+base.quadroI.sourceSha256);
    paragraph("Esses registros sao preparacoes historicas e NAO demonstram vigencia, aplicabilidade territorial ou regularidade deste projeto.");
  }else{
    paragraph("A base legal municipal historica nao foi verificada nesta leitura. Isso NAO demonstra exclusao dos arquivos ou das conferencias anteriores.");
  }
  heading("Cotas identificadas nas pranchas");
  const measured=input.extraction.readings.filter(row=>row.value!==null&&row.usableForReview);
  if(!measured.length)paragraph("Nenhuma medida foi comprovada nesta tentativa. Consulte as pranchas e o modo de leitura.");
  for (const row of measured) {
    const metric=URBAN_METRICS.find(item=>item.key===row.metric);
    if(!metric)continue;
    paragraph(metric.label+": "+row.value!.toLocaleString("pt-BR")+" "+metric.unit+
      "  |  Prancha: "+row.page+"  |  Conferencia humana: pendente.");
    if(row.quote)paragraph("Trecho de origem: "+row.quote,8,[76,88,101]);
  }
  const missing=input.extraction.readings.filter(row=>row.value===null||!row.usableForReview);
  heading("Indices ainda sem leitura comprovada");
  if(missing.length){
    paragraph(missing.map(row=>URBAN_METRICS.find(item=>item.key===row.metric)?.label||row.metric).join("  |  "),8.5);
    paragraph("Nao identificados NAO significa fora da lei. Exigem documento, planta ou verificacao do analista.",8);
  }else paragraph("Todos os indices retornados possuem uma cota candidata, ainda dependente de conferencia humana.");
  heading("Alertas da leitura");
  if (input.extraction.warnings.length === 0) paragraph("Sem alertas adicionais registrados.");
  for (const warning of input.extraction.warnings) paragraph("- " + warning, 8.5);
  heading("Situacao da conformidade urbanistica");
  paragraph("NAO AVALIADA (nao significa NAO CONFORME). Sem cruzamento juridico validado por municipio, zona, uso, " +
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
