import { jsPDF } from "jspdf";
import type { ConstructionPermitRecord } from "@/lib/constructionPermit";
import type { ProcessRecord, UserProfile } from "@/lib/platform";

export type ConstructionPermitPdfInput = {
  permit: ConstructionPermitRecord;
  process: ProcessRecord;
  municipalityName: string;
  secretariat?: string;
  directorate?: string;
  technicalProfile?: UserProfile;
};

type PdfColor = readonly [number, number, number];

const color = {
  navy: [10, 34, 55] as const,
  blue: [11, 94, 147] as const,
  sky: [14, 116, 181] as const,
  ink: [15, 23, 42] as const,
  muted: [71, 85, 105] as const,
  line: [203, 213, 225] as const,
  soft: [241, 245, 249] as const,
  white: [255, 255, 255] as const,
  green: [5, 150, 105] as const,
  amber: [180, 83, 9] as const,
};

function fill(pdf: jsPDF, value: PdfColor) {
  pdf.setFillColor(...value);
}

function draw(pdf: jsPDF, value: PdfColor) {
  pdf.setDrawColor(...value);
}

function textColor(pdf: jsPDF, value: PdfColor) {
  pdf.setTextColor(...value);
}

function valueOrFallback(value?: string | null) {
  const clean = String(value || "").trim();
  return clean || "Não informado";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

function drawField(
  pdf: jsPDF,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  height = 18,
) {
  fill(pdf, color.soft);
  draw(pdf, color.line);
  pdf.roundedRect(x, y, width, height, 3, 3, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.8);
  textColor(pdf, color.muted);
  pdf.text(label.toUpperCase(), x + 4, y + 5.2);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.3);
  textColor(pdf, color.ink);
  const lines = pdf.splitTextToSize(value || "—", width - 8) as string[];
  pdf.text(lines.slice(0, 2), x + 4, y + 11);
}

function drawSignature(
  pdf: jsPDF,
  x: number,
  y: number,
  width: number,
  label: string,
  signature?: ConstructionPermitRecord["analystSignature"],
) {
  draw(pdf, signature ? color.green : color.line);
  fill(pdf, signature ? ([236, 253, 245] as const) : color.soft);
  pdf.roundedRect(x, y, width, 31, 4, 4, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  textColor(pdf, signature ? color.green : color.muted);
  pdf.text(label.toUpperCase(), x + 4, y + 5.5);

  pdf.setFontSize(9.2);
  textColor(pdf, color.ink);
  pdf.text(signature?.name || "Assinatura pendente", x + 4, y + 13);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  textColor(pdf, color.muted);
  const role = signature?.role || "Aguardando responsável autorizado";
  pdf.text((pdf.splitTextToSize(role, width - 8) as string[]).slice(0, 1), x + 4, y + 18.5);

  pdf.setFontSize(6.8);
  pdf.text(
    signature?.signedAt
      ? `Assinado em ${formatDate(signature.signedAt)}`
      : "Documento ainda sem assinatura desta autoridade.",
    x + 4,
    y + 25.5,
  );
}

export function buildConstructionPermitPdfBlob({
  permit,
  process,
  municipalityName,
  secretariat,
  directorate,
  technicalProfile,
}: ConstructionPermitPdfInput) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const form = permit.formData;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  fill(pdf, color.navy);
  pdf.rect(0, 0, pageWidth, 48, "F");
  fill(pdf, color.sky);
  pdf.rect(0, 46, pageWidth, 2, "F");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  textColor(pdf, [186, 230, 253]);
  pdf.text("PREFEITURA MUNICIPAL", margin, 12);

  pdf.setFontSize(16);
  textColor(pdf, color.white);
  pdf.text(valueOrFallback(municipalityName), margin, 21);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.8);
  textColor(pdf, [226, 232, 240]);
  pdf.text(valueOrFallback(secretariat || "Secretaria Municipal de Obras"), margin, 28);
  pdf.text(valueOrFallback(directorate || "Diretoria de Planejamento Urbano"), margin, 33);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  textColor(pdf, color.white);
  pdf.text("ALVARÁ DE CONSTRUÇÃO", pageWidth - margin, 17, { align: "right" });
  pdf.setFontSize(8);
  textColor(pdf, [186, 230, 253]);
  pdf.text("LICENCIAMENTO MUNICIPAL DE OBRA", pageWidth - margin, 23, { align: "right" });
  pdf.setFontSize(9.5);
  textColor(pdf, color.white);
  pdf.text(permit.permitNumber, pageWidth - margin, 32, { align: "right" });

  if (permit.status !== "emitido") {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(40);
    textColor(pdf, [226, 232, 240]);
    pdf.text("RASCUNHO - SEM VALIDADE", pageWidth / 2, 155, {
      align: "center",
      angle: 35,
    });
  }

  let y = 56;
  const colGap = 4;
  const half = (contentWidth - colGap) / 2;

  drawField(pdf, margin, y, half, "Processo administrativo", process.protocol);
  drawField(
    pdf,
    margin + half + colGap,
    y,
    half,
    "Situação do alvará",
    permit.status === "emitido"
      ? "Emitido e assinado"
      : permit.status === "aguardando_diretor"
        ? "Aguardando assinatura do Diretor"
        : "Rascunho técnico",
  );
  y += 22;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  textColor(pdf, color.blue);
  pdf.text("1. TITULAR E RESPONSÁVEL TÉCNICO", margin, y);
  y += 4;

  drawField(pdf, margin, y, half, "Proprietário / titular", form?.ownerName || process.ownerName);
  drawField(
    pdf,
    margin + half + colGap,
    y,
    half,
    "Documento do titular",
    valueOrFallback(form?.ownerDocument || process.ownerDocument),
  );
  y += 22;

  drawField(pdf, margin, y, half, "Responsável técnico", form?.technicalLead || process.technicalLead);
  drawField(
    pdf,
    margin + half + colGap,
    y,
    half,
    "Registro profissional",
    valueOrFallback(form?.technicalRegistration || technicalProfile?.registrationNumber),
  );
  y += 27;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  textColor(pdf, color.blue);
  pdf.text("2. IDENTIFICAÇÃO DO IMÓVEL E DA OBRA", margin, y);
  y += 4;

  drawField(pdf, margin, y, contentWidth, "Endereço do imóvel", form?.propertyAddress || process.address);
  y += 22;

  drawField(
    pdf,
    margin,
    y,
    half,
    "Inscrição imobiliária / IPTU",
    valueOrFallback(form?.propertyRegistration || process.property.iptu || process.property.registration),
  );
  drawField(
    pdf,
    margin + half + colGap,
    y,
    half,
    "Lote / quadra",
    [form?.lot || process.property.lot, form?.block || process.property.block].filter(Boolean).join(" / ") || "Não informado",
  );
  y += 22;

  drawField(
    pdf,
    margin,
    y,
    half,
    "Natureza da obra",
    valueOrFallback(form?.workType || process.property.workType || process.type),
  );
  drawField(
    pdf,
    margin + half + colGap,
    y,
    half,
    "Uso da edificação",
    valueOrFallback(form?.usage || process.property.usage),
  );
  y += 22;

  drawField(
    pdf,
    margin,
    y,
    half,
    "Área licenciada",
    form?.areaM2
      ? `${Number(String(form.areaM2).replace(",", ".")).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`
      : process.property.area > 0
        ? `${process.property.area.toFixed(2)} m²`
        : "Não informada",
  );
  drawField(
    pdf,
    margin + half + colGap,
    y,
    half,
    "Padrão construtivo",
    valueOrFallback(form?.constructionStandard || process.property.constructionStandard),
  );
  y += 27;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  textColor(pdf, color.blue);
  pdf.text("3. OBJETO E CONDIÇÕES DA LICENÇA", margin, y);
  y += 4;

  if (form?.licenseObject) {
    drawField(pdf, margin, y, contentWidth, "Objeto do licenciamento", form.licenseObject, 20);
    y += 24;
  }

  fill(pdf, color.soft);
  draw(pdf, color.line);
  pdf.roundedRect(margin, y, contentWidth, 45, 4, 4, "FD");
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  textColor(pdf, color.ink);
  const conditions = [
    "A execução da obra deverá observar o projeto aprovado e as normas urbanísticas, edilícias, sanitárias, de acessibilidade e demais regras aplicáveis.",
    "Este documento não substitui licenças, autorizações ou aprovações de outros órgãos quando exigíveis.",
    "O responsável técnico permanece responsável pelos serviços técnicos e pela execução conforme sua ART/RRT/TRT e atribuições profissionais.",
    "Qualquer alteração relevante do projeto aprovado deverá ser submetida à Prefeitura antes da execução.",
    ...(form?.complementaryConditions?.trim()
      ? [`Condição complementar: ${form.complementaryConditions.trim()}`]
      : []),
  ];
  const conditionLines = pdf.splitTextToSize(
    conditions.map((item, index) => `${index + 1}. ${item}`).join("\n"),
    contentWidth - 10,
  ) as string[];
  pdf.text(conditionLines, margin + 5, y + 7, { lineHeightFactor: 1.35 });
  y += 51;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  textColor(pdf, color.blue);
  pdf.text("4. ASSINATURAS MUNICIPAIS", margin, y);
  y += 4;

  drawSignature(pdf, margin, y, half, "Análise técnica", permit.analystSignature);
  drawSignature(
    pdf,
    margin + half + colGap,
    y,
    half,
    "Diretoria responsável",
    permit.directorSignature,
  );
  y += 38;

  fill(pdf, permit.status === "emitido" ? ([236, 253, 245] as const) : ([255, 247, 237] as const));
  draw(pdf, permit.status === "emitido" ? ([167, 243, 208] as const) : ([253, 186, 116] as const));
  pdf.roundedRect(margin, y, contentWidth, 21, 4, 4, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  textColor(pdf, permit.status === "emitido" ? color.green : color.amber);
  pdf.text(
    permit.status === "emitido"
      ? "DOCUMENTO MUNICIPAL EMITIDO"
      : "RASCUNHO INTERNO — NÃO LIBERADO AO INTERESSADO",
    margin + 5,
    y + 6,
  );
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.3);
  textColor(pdf, color.muted);
  pdf.text(
    `Emissão: ${formatDate(permit.issuedAt || permit.updatedAt)} • Processo: ${process.protocol}`,
    margin + 5,
    y + 12,
  );
  pdf.text(
    `Código de validação: ${permit.processId.slice(0, 8).toUpperCase()}-${permit.permitNumber.replace(/[^A-Z0-9]/g, "").slice(-10)}`,
    margin + 5,
    y + 17,
  );

  pdf.setFontSize(6.5);
  textColor(pdf, color.muted);
  pdf.text(
    "Documento eletrônico gerado pelo SIGAPRO Municipal. A validade final depende das assinaturas municipais e do registro oficial no processo.",
    pageWidth / 2,
    289,
    { align: "center", maxWidth: contentWidth },
  );

  return pdf.output("blob");
}

export function openConstructionPermitPdf(input: ConstructionPermitPdfInput) {
  const blob = buildConstructionPermitPdfBlob(input);
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (opened) opened.opener = null;
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
