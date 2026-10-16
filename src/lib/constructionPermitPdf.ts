import { jsPDF } from "jspdf";
import type {
  ConstructionPermitRecord,
  PermitSignature,
} from "@/lib/constructionPermit";
import type { ProcessRecord, UserProfile } from "@/lib/platform";

export type ConstructionPermitPdfInput = {
  permit: ConstructionPermitRecord;
  process: ProcessRecord;
  municipalityName: string;
  municipalityLogoUrl?: string;
  municipalityAddress?: string;
  municipalityPhone?: string;
  municipalityEmail?: string;
  secretariat?: string;
  directorate?: string;
  technicalProfile?: UserProfile;
};

type PdfColor = readonly [number, number, number];

const color = {
  navy: [8, 47, 73] as const,
  blue: [7, 105, 161] as const,
  ink: [15, 23, 42] as const,
  muted: [71, 85, 105] as const,
  line: [203, 213, 225] as const,
  soft: [248, 250, 252] as const,
  white: [255, 255, 255] as const,
  green: [5, 150, 105] as const,
  amber: [180, 83, 9] as const,
};

const CAMPO_LIMPO_BRASAO_FALLBACK =
  "https://upload.wikimedia.org/wikipedia/commons/4/4e/Brasao-campo-limpo-paulista2.png";

function fill(pdf: jsPDF, value: PdfColor) {
  pdf.setFillColor(...value);
}

function draw(pdf: jsPDF, value: PdfColor) {
  pdf.setDrawColor(...value);
}

function textColor(pdf: jsPDF, value: PdfColor) {
  pdf.setTextColor(...value);
}

function valueOrFallback(value?: string | null, fallback = "Não informado") {
  const clean = String(value || "").trim();
  return clean || fallback;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("pt-BR");
}

function compactHash(hash?: string | null) {
  const value = String(hash || "").trim();
  if (!value) return "";
  if (value.length <= 38) return value;
  return `${value.slice(0, 20)}...${value.slice(-12)}`;
}

async function loadImageDataUrl(url?: string | null) {
  const normalized = String(url || "").trim();
  if (!normalized) return null;
  if (normalized.startsWith("data:image/")) return normalized;

  try {
    const response = await fetch(normalized, {
      cache: "force-cache",
      credentials: "omit",
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return null;

    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () =>
        resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function imageFormat(dataUrl: string) {
  if (/^data:image\/jpe?g/i.test(dataUrl)) return "JPEG";
  if (/^data:image\/webp/i.test(dataUrl)) return "WEBP";
  return "PNG";
}

function drawField(
  pdf: jsPDF,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  height = 15,
) {
  fill(pdf, color.soft);
  draw(pdf, color.line);
  pdf.setLineWidth(0.18);
  pdf.roundedRect(x, y, width, height, 2.2, 2.2, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.2);
  textColor(pdf, color.muted);
  pdf.text(label.toUpperCase(), x + 3.2, y + 4.2);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.1);
  textColor(pdf, color.ink);
  const lines = pdf.splitTextToSize(value || "—", width - 6.4) as string[];
  pdf.text(lines.slice(0, 2), x + 3.2, y + 9.2);
}

function drawSectionTitle(pdf: jsPDF, x: number, y: number, title: string, width: number) {
  fill(pdf, [241, 245, 249]);
  draw(pdf, [218, 226, 234]);
  pdf.roundedRect(x, y, width, 7, 1.7, 1.7, "FD");
  fill(pdf, color.blue);
  pdf.roundedRect(x, y, 2.2, 7, 1, 1, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.5);
  textColor(pdf, color.ink);
  pdf.text(title.toUpperCase(), x + 4.5, y + 4.7);
}

function drawSignature(
  pdf: jsPDF,
  x: number,
  y: number,
  width: number,
  label: string,
  signature?: PermitSignature,
) {
  const official = Boolean(signature?.official || signature?.verificationCode);
  fill(pdf, official ? ([240, 253, 250] as const) : ([250, 252, 254] as const));
  draw(pdf, official ? ([167, 243, 208] as const) : color.line);
  pdf.roundedRect(x, y, width, 34, 2.5, 2.5, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.4);
  textColor(pdf, official ? color.green : color.muted);
  pdf.text(
    official ? "ASSINATURA ELETRÔNICA VÁLIDA" : "ASSINATURA ELETRÔNICA",
    x + 4,
    y + 5,
  );

  pdf.setFontSize(6.3);
  textColor(pdf, color.ink);
  pdf.text(label.toUpperCase(), x + 4, y + 9.5);

  if (signature) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.2);
    pdf.text(
      (pdf.splitTextToSize(signature.name || "Responsável", width - 8) as string[]).slice(0, 1),
      x + 4,
      y + 15,
    );

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.7);
    textColor(pdf, color.muted);
    const role = [signature.role, signature.registration ? `Registro ${signature.registration}` : ""]
      .filter(Boolean)
      .join(" • ");
    pdf.text(
      (pdf.splitTextToSize(role || "Autoridade municipal", width - 8) as string[]).slice(0, 1),
      x + 4,
      y + 19.3,
    );
    pdf.text(formatDate(signature.signedAt), x + 4, y + 23.5);

    if (signature.verificationCode) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(5.2);
      textColor(pdf, color.green);
      pdf.text(`Código: ${signature.verificationCode}`, x + 4, y + 28);
    }
    if (signature.evidenceHash) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(4.6);
      textColor(pdf, color.muted);
      pdf.text(`SHA-256: ${compactHash(signature.evidenceHash)}`, x + 4, y + 31.8);
    }
  } else {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.2);
    textColor(pdf, color.muted);
    pdf.text("Aguardando assinatura da autoridade municipal.", x + 4, y + 16);
  }
}

export async function buildConstructionPermitPdfBlob({
  permit,
  process,
  municipalityName,
  municipalityLogoUrl,
  municipalityAddress,
  municipalityPhone,
  municipalityEmail,
  secretariat,
  directorate,
  technicalProfile,
}: ConstructionPermitPdfInput) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const form = permit.formData;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 11;
  const contentWidth = pageWidth - margin * 2;
  const gap = 4;
  const half = (contentWidth - gap) / 2;

  const logoUrl =
    municipalityLogoUrl ||
    (/campo\s+limpo\s+paulista/i.test(municipalityName)
      ? CAMPO_LIMPO_BRASAO_FALLBACK
      : "");
  const logoDataUrl =
    (await loadImageDataUrl(logoUrl)) ||
    (/campo\s+limpo\s+paulista/i.test(municipalityName)
      ? await loadImageDataUrl(CAMPO_LIMPO_BRASAO_FALLBACK)
      : null);

  const effectiveSecretariat =
    secretariat ||
    (/campo\s+limpo\s+paulista/i.test(municipalityName)
      ? "Secretaria de Desenvolvimento Urbano, Habitação e Meio Ambiente"
      : "Secretaria responsável");
  const effectiveDirectorate = directorate || "Diretoria responsável";

  // Cabeçalho institucional claro e premium.
  fill(pdf, color.white);
  draw(pdf, [214, 223, 232]);
  pdf.roundedRect(margin, 8, contentWidth, 31, 2.6, 2.6, "FD");
  fill(pdf, color.blue);
  pdf.roundedRect(margin, 8, 3.2, 31, 1.6, 1.6, "F");

  if (logoDataUrl) {
    try {
      pdf.addImage(
        logoDataUrl,
        imageFormat(logoDataUrl),
        margin + 7,
        10.2,
        19,
        19,
        undefined,
        "FAST",
      );
    } catch {
      // Identificação textual permanece válida se a imagem não puder ser decodificada.
    }
  }

  const copyX = logoDataUrl ? margin + 31 : margin + 8;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10.4);
  textColor(pdf, color.ink);
  pdf.text(valueOrFallback(municipalityName, "Prefeitura Municipal").toUpperCase(), copyX, 14.7);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(5.6);
  textColor(pdf, color.muted);
  pdf.text(
    (pdf.splitTextToSize(effectiveSecretariat.toUpperCase(), 105) as string[]).slice(0, 1),
    copyX,
    19.2,
  );
  pdf.text(effectiveDirectorate.toUpperCase(), copyX, 23.3);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.2);
  textColor(pdf, color.blue);
  pdf.text("ALVARÁ DE CONSTRUÇÃO", copyX, 29.2);

  fill(pdf, [241, 245, 249]);
  draw(pdf, [226, 232, 240]);
  pdf.roundedRect(pageWidth - margin - 45, 12, 39, 9, 4.5, 4.5, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.1);
  textColor(pdf, color.navy);
  pdf.text(permit.permitNumber, pageWidth - margin - 25.5, 17.6, { align: "center" });

  const contact = [municipalityAddress, municipalityPhone, municipalityEmail]
    .filter(Boolean)
    .join("  •  ");
  if (contact) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(4.8);
    textColor(pdf, [100, 116, 139]);
    pdf.text(
      (pdf.splitTextToSize(contact, 170) as string[]).slice(0, 1),
      margin + 4,
      42.5,
    );
  }

  let y = 47;
  drawSectionTitle(pdf, margin, y, "Identificação do licenciamento", contentWidth);
  y += 9.5;
  drawField(pdf, margin, y, half, "Processo administrativo", process.protocol);
  drawField(
    pdf,
    margin + half + gap,
    y,
    half,
    "Situação",
    permit.directorSignature
      ? "Alvará emitido"
      : "Aguardando assinatura da Diretoria",
  );
  y += 18.5;

  drawSectionTitle(pdf, margin, y, "Titular e responsável técnico", contentWidth);
  y += 9.5;
  drawField(pdf, margin, y, half, "Proprietário / titular", form?.ownerName || process.ownerName);
  drawField(
    pdf,
    margin + half + gap,
    y,
    half,
    "CPF / CNPJ",
    valueOrFallback(form?.ownerDocument || process.ownerDocument),
  );
  y += 18.5;
  drawField(pdf, margin, y, half, "Responsável técnico", form?.technicalLead || process.technicalLead);
  drawField(
    pdf,
    margin + half + gap,
    y,
    half,
    "CREA / CAU / CFT",
    valueOrFallback(form?.technicalRegistration || technicalProfile?.registrationNumber),
  );
  y += 18.5;

  drawSectionTitle(pdf, margin, y, "Imóvel e obra", contentWidth);
  y += 9.5;
  drawField(pdf, margin, y, contentWidth, "Endereço do imóvel", form?.propertyAddress || process.address);
  y += 18.5;

  const quarter = (contentWidth - gap * 3) / 4;
  drawField(
    pdf,
    margin,
    y,
    quarter,
    "Inscrição / IPTU",
    valueOrFallback(form?.propertyRegistration || process.property.iptu || process.property.registration),
  );
  drawField(pdf, margin + quarter + gap, y, quarter, "Lote", valueOrFallback(form?.lot || process.property.lot));
  drawField(pdf, margin + (quarter + gap) * 2, y, quarter, "Quadra", valueOrFallback(form?.block || process.property.block));
  drawField(
    pdf,
    margin + (quarter + gap) * 3,
    y,
    quarter,
    "Área licenciada",
    form?.areaM2
      ? `${Number(String(form.areaM2).replace(",", ".")).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`
      : process.property.area > 0
        ? `${process.property.area.toFixed(2)} m²`
        : "Não informada",
  );
  y += 18.5;

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
    margin + half + gap,
    y,
    half,
    "Uso / padrão construtivo",
    [
      valueOrFallback(form?.usage || process.property.usage, ""),
      valueOrFallback(form?.constructionStandard || process.property.constructionStandard, ""),
    ]
      .filter(Boolean)
      .join(" • ") || "Não informado",
  );
  y += 18.5;

  drawSectionTitle(pdf, margin, y, "Objeto e condições do Alvará", contentWidth);
  y += 9.5;
  drawField(
    pdf,
    margin,
    y,
    contentWidth,
    "Objeto do licenciamento",
    valueOrFallback(form?.licenseObject || process.type),
    16,
  );
  y += 19.5;

  fill(pdf, color.soft);
  draw(pdf, color.line);
  pdf.roundedRect(margin, y, contentWidth, 39, 2.5, 2.5, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.2);
  textColor(pdf, color.muted);
  pdf.text("CONDIÇÕES E OBSERVAÇÕES", margin + 4, y + 5);

  const conditions = [
    "A obra deverá obedecer ao projeto aprovado e à legislação municipal aplicável.",
    "Este Alvará não substitui autorizações de outros órgãos quando exigíveis.",
    "O responsável técnico responde pela execução conforme ART/RRT/TRT e atribuições profissionais.",
    ...(form?.complementaryConditions?.trim()
      ? [form.complementaryConditions.trim()]
      : []),
  ];
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.15);
  textColor(pdf, color.ink);
  const conditionLines = pdf.splitTextToSize(
    conditions.map((item, index) => `${index + 1}. ${item}`).join("\n"),
    contentWidth - 8,
  ) as string[];
  pdf.text(conditionLines.slice(0, 9), margin + 4, y + 10.5, {
    lineHeightFactor: 1.3,
  });
  y += 43;

  drawSectionTitle(pdf, margin, y, "Assinatura municipal", contentWidth);
  y += 9.5;

  const hasSecretary = Boolean(permit.secretarySignature);
  if (hasSecretary) {
    drawSignature(pdf, margin, y, half, "Diretoria responsável", permit.directorSignature);
    drawSignature(
      pdf,
      margin + half + gap,
      y,
      half,
      "Secretaria municipal",
      permit.secretarySignature,
    );
  } else {
    drawSignature(
      pdf,
      margin,
      y,
      contentWidth,
      "Diretoria responsável",
      permit.directorSignature,
    );
  }
  y += 38;

  fill(pdf, permit.directorSignature ? ([240, 253, 250] as const) : ([255, 247, 237] as const));
  draw(pdf, permit.directorSignature ? ([167, 243, 208] as const) : ([253, 186, 116] as const));
  pdf.roundedRect(margin, y, contentWidth, 16, 2.2, 2.2, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.3);
  textColor(pdf, permit.directorSignature ? color.green : color.amber);
  pdf.text(
    permit.directorSignature
      ? "ALVARÁ MUNICIPAL EMITIDO"
      : "AGUARDANDO ASSINATURA ELETRÔNICA DA DIRETORIA",
    margin + 4,
    y + 5.5,
  );
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(5.4);
  textColor(pdf, color.muted);
  pdf.text(
    `Processo: ${process.protocol}  •  Emissão: ${formatDate(permit.issuedAt || permit.updatedAt)}`,
    margin + 4,
    y + 10.2,
  );
  pdf.text(
    `SIGAPRO Municipal • Alvará ${permit.permitNumber}`,
    margin + 4,
    y + 13.4,
  );

  draw(pdf, color.line);
  pdf.line(margin, pageHeight - 10.5, pageWidth - margin, pageHeight - 10.5);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(4.8);
  textColor(pdf, color.muted);
  pdf.text(
    "Documento eletrônico gerado pelo SIGAPRO Municipal. A assinatura da Diretoria é a assinatura municipal obrigatória; a assinatura da Secretaria é complementar quando registrada.",
    pageWidth / 2,
    pageHeight - 6.5,
    { align: "center", maxWidth: contentWidth },
  );

  return pdf.output("blob");
}

export async function openConstructionPermitPdf(input: ConstructionPermitPdfInput) {
  const blob = await buildConstructionPermitPdfBlob(input);
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (opened) opened.opener = null;
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
