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
  manualSignature?: boolean;
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

function buildPermitDocumentTitle(workType?: string | null) {
  const raw = String(workType || "").trim();

  if (/demoli/i.test(raw)) return "ALVARÁ DE DEMOLIÇÃO";
  if (/reforma/i.test(raw)) return "ALVARÁ DE REFORMA";
  if (/amplia/i.test(raw)) return "ALVARÁ DE AMPLIAÇÃO";
  if (/regulariza/i.test(raw)) return "ALVARÁ DE REGULARIZAÇÃO";
  if (/terraplen|movimenta.*terra/i.test(raw)) return "ALVARÁ DE TERRAPLENAGEM";
  if (/constru/i.test(raw)) return "ALVARÁ DE CONSTRUÇÃO";

  return "ALVARÁ DE CONSTRUÇÃO";
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizePermitFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildPermitTabTitle(
  permitDocumentTitle: string,
  permitNumber: string,
  processProtocol: string,
) {
  const title = permitDocumentTitle
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());

  return `${title} • ${permitNumber} • ${processProtocol} • SIGAPRO`;
}

function buildPermitFileName(
  permitDocumentTitle: string,
  permitNumber: string,
  processProtocol: string,
) {
  const base = normalizePermitFileName(
    `${permitDocumentTitle}-${permitNumber}-${processProtocol}`,
  );
  return `${base || "alvara-municipal"}.pdf`;
}

function writePdfShell(opened: Window, title: string, message: string) {
  opened.document.open();
  opened.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    html,body{margin:0;width:100%;height:100%;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a}
    #sigapro-pdf-shell{width:100%;height:100%;display:flex;flex-direction:column}
    #sigapro-pdf-status{padding:14px 18px;background:#fff;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700}
    #sigapro-pdf-frame{flex:1;width:100%;border:0;background:#f8fafc}
  </style>
</head>
<body>
  <div id="sigapro-pdf-shell">
    <div id="sigapro-pdf-status">${escapeHtml(message)}</div>
    <iframe id="sigapro-pdf-frame" title="${escapeHtml(title)}"></iframe>
  </div>
</body>
</html>`);
  opened.document.close();
  opened.document.title = title;
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
  height = 13,
) {
  fill(pdf, color.soft);
  draw(pdf, color.line);
  pdf.setLineWidth(0.18);
  pdf.roundedRect(x, y, width, height, 2.2, 2.2, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.2);
  textColor(pdf, color.muted);
  pdf.text(label.toUpperCase(), x + 3.2, y + 3.8);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.1);
  textColor(pdf, color.ink);
  const lines = pdf.splitTextToSize(value || "—", width - 6.4) as string[];
  pdf.text(lines.slice(0, 2), x + 3.2, y + 8.4);
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
  manual = false,
) {
  const official = Boolean(signature?.official || signature?.verificationCode);
  fill(pdf, official ? ([240, 253, 250] as const) : ([250, 252, 254] as const));
  draw(pdf, official ? ([167, 243, 208] as const) : color.line);
  pdf.roundedRect(x, y, width, 26, 2.5, 2.5, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.1);
  textColor(pdf, official ? color.green : color.muted);
  pdf.text(
    official ? "VALIDAÇÃO MUNICIPAL" : "AUTORIDADE MUNICIPAL",
    x + 4,
    y + 4.3,
  );

  pdf.setFontSize(6);
  textColor(pdf, color.ink);
  pdf.text(label.toUpperCase(), x + 4, y + 8.2);

  if (signature) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.8);
    pdf.text(
      (pdf.splitTextToSize(signature.name || "Responsável", width - 8) as string[]).slice(0, 1),
      x + 4,
      y + 12.3,
    );

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.25);
    textColor(pdf, color.muted);
    const role = [signature.role, signature.registration ? `Registro ${signature.registration}` : ""]
      .filter(Boolean)
      .join(" • ");
    pdf.text(
      (pdf.splitTextToSize(role || "Autoridade municipal", width - 8) as string[]).slice(0, 1),
      x + 4,
      y + 15.7,
    );
    pdf.text(formatDate(signature.signedAt), x + 4, y + 18.8);

    if (signature.verificationCode) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(4.9);
      textColor(pdf, color.green);
      pdf.text(`Código: ${signature.verificationCode}`, x + 4, y + 21.8);
    }
    if (signature.evidenceHash) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(4.25);
      textColor(pdf, color.muted);
      pdf.text(`SHA-256: ${compactHash(signature.evidenceHash)}`, x + 4, y + 24.5);
    }
  } else if (manual) {
    draw(pdf, [100, 116, 139]);
    pdf.setLineWidth(0.35);
    pdf.line(x + 10, y + 16.2, x + width - 10, y + 16.2);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.35);
    textColor(pdf, color.muted);
    const authorityLabel = /secret/i.test(label)
      ? "Secretário(a) Municipal"
      : "Diretor(a) Responsável";
    pdf.text(authorityLabel, x + width / 2, y + 20.1, {
      align: "center",
    });
    pdf.setFontSize(4.9);
    pdf.text("Data: ____/____/________", x + width / 2, y + 23.6, {
      align: "center",
    });
  } else {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.8);
    textColor(pdf, color.muted);
    pdf.text("Aguardando assinatura eletrônica da autoridade municipal.", x + 4, y + 13.2);
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
  manualSignature = false,
}: ConstructionPermitPdfInput) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const form = permit.formData;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;
  const gap = 3;

  const isCampoLimpo = /campo\s+limpo\s+paulista/i.test(municipalityName);
  const logoUrl =
    municipalityLogoUrl ||
    (isCampoLimpo ? CAMPO_LIMPO_BRASAO_FALLBACK : "");
  const logoDataUrl =
    (await loadImageDataUrl(logoUrl)) ||
    (isCampoLimpo ? await loadImageDataUrl(CAMPO_LIMPO_BRASAO_FALLBACK) : null);

  const officialMunicipalityName =
    /prefeitura/i.test(municipalityName)
      ? municipalityName
      : isCampoLimpo
        ? "Prefeitura Municipal de Campo Limpo Paulista"
        : "Prefeitura Municipal de " + municipalityName;

  const effectiveSecretariat =
    !secretariat ||
    /^secretaria\s+de\s+desenvolvimento\s+urbano$/i.test(secretariat.trim())
      ? isCampoLimpo
        ? "Secretaria de Desenvolvimento Urbano, Habitação e Meio Ambiente"
        : secretariat || "Secretaria responsável"
      : secretariat;
  const effectiveDirectorate =
    directorate ||
    (isCampoLimpo ? "Departamento de Urbanismo" : "Diretoria responsável");
  const effectiveAddress =
    municipalityAddress ||
    (isCampoLimpo
      ? "Avenida Adherbal da Costa Moreira, 255 - Jardim América - Campo Limpo Paulista/SP"
      : "");
  const effectivePhone =
    municipalityPhone ||
    (isCampoLimpo ? "(11) 4038-8300" : "");

  const directorOfficial = Boolean(
    permit.directorSignature?.official &&
    permit.directorSignature?.verificationCode,
  );
  const secretaryOfficial = Boolean(
    permit.secretarySignature?.official &&
    permit.secretarySignature?.verificationCode,
  );
  const permitDocumentTitle = buildPermitDocumentTitle(
    form?.workType || process.property.workType || process.type,
  );
  const isRegularization = /regulariza/i.test(
    form?.workType || process.property.workType || process.type || "",
  );

  const parsePtNumber = (value?: string | number | null) => {
    if (typeof value === "number") return value;
    const raw = String(value ?? "").trim().replace(/\s/g, "");
    if (!raw) return Number.NaN;
    const normalized = raw.includes(",")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw;
    return Number(normalized);
  };

  const formatDecimal = (
    value?: string | number | null,
    suffix = "",
    fallback = "—",
  ) => {
    const parsed = parsePtNumber(value);
    if (!Number.isFinite(parsed)) return fallback;
    return (
      parsed.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + suffix
    );
  };

  const formatLongDate = (value?: string | null) => {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return valueOrFallback(value, "—");
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  };

  const municipalityCity = isCampoLimpo
    ? "Campo Limpo Paulista"
    : officialMunicipalityName
        .replace(/^Prefeitura\s+Municipal\s+de\s+/i, "")
        .replace(/^Prefeitura\s+de\s+/i, "")
        .trim();

  const propertyAddress = [
    valueOrFallback(form?.propertyAddress || process.address, ""),
    form?.lot ? "Lote: " + form.lot : "",
    form?.block ? "Quadra: " + form.block : "",
    form?.neighborhood ? "Bairro: " + form.neighborhood : "",
    form?.city ? "Cidade: " + form.city : "",
    form?.postalCode ? "CEP: " + form.postalCode : "",
  ]
    .filter(Boolean)
    .join(" - ");

  const registryValue = [
    form?.propertyRegistryNumber
      ? "Matrícula nº " + form.propertyRegistryNumber
      : "",
    form?.propertyRegistryOffice || "",
  ]
    .filter(Boolean)
    .join(" - ");

  const rawAreaRows = (form?.regularizationAreas ?? [])
    .map((item) => ({
      description: String(item.description || "").trim(),
      area: parsePtNumber(item.areaM2),
    }))
    .filter(
      (item) =>
        item.description &&
        Number.isFinite(item.area) &&
        item.area > 0,
    );

  const fallbackLicensedArea = Number.isFinite(parsePtNumber(form?.areaM2))
    ? parsePtNumber(form?.areaM2)
    : process.property.area > 0
      ? process.property.area
      : Number.NaN;

  const allAreaRows =
    rawAreaRows.length > 0
      ? rawAreaRows
      : Number.isFinite(fallbackLicensedArea)
        ? [
            {
              description: isRegularization
                ? "Área a regularizar"
                : "Área licenciada",
              area: fallbackLicensedArea,
            },
          ]
        : [];

  const displayedAreaRows =
    allAreaRows.length <= 8
      ? allAreaRows
      : [
          ...allAreaRows.slice(0, 7),
          {
            description:
              "Outras áreas (" + String(allAreaRows.length - 7) + " itens)",
            area: allAreaRows
              .slice(7)
              .reduce((sum, item) => sum + item.area, 0),
          },
        ];

  const totalRegularizedArea = allAreaRows.reduce(
    (sum, item) => sum + item.area,
    0,
  );

  const compactField = (
    x: number,
    y: number,
    width: number,
    label: string,
    value: string,
    height = 9.2,
  ) => {
    fill(pdf, color.soft);
    draw(pdf, color.line);
    pdf.setLineWidth(0.16);
    pdf.roundedRect(x, y, width, height, 1.4, 1.4, "FD");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(4.45);
    textColor(pdf, color.muted);
    pdf.text(label.toUpperCase(), x + 2.5, y + 3.15);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.15);
    textColor(pdf, color.ink);
    const lines = pdf.splitTextToSize(value || "—", width - 5) as string[];
    pdf.text(lines.slice(0, 2), x + 2.5, y + 6.75, {
      lineHeightFactor: 1.05,
    });
  };

  pdf.setProperties({
    title:
      permitDocumentTitle +
      " - " +
      permit.permitNumber +
      " - " +
      process.protocol,
    subject:
      permitDocumentTitle + " do processo " + process.protocol,
    author: municipalityName || "Prefeitura Municipal",
    creator: "SIGAPRO Municipal",
    keywords:
      "SIGAPRO, alvará, regularização, prefeitura, processo municipal",
  });

  // Cabeçalho institucional premium e compacto.
  fill(pdf, color.white);
  draw(pdf, [211, 220, 230]);
  pdf.roundedRect(margin, 8, contentWidth, 27, 2.4, 2.4, "FD");
  fill(pdf, color.blue);
  pdf.roundedRect(margin, 8, 3, 27, 1.4, 1.4, "F");

  if (logoDataUrl) {
    try {
      pdf.addImage(
        logoDataUrl,
        imageFormat(logoDataUrl),
        margin + 6,
        10.1,
        17,
        17,
        undefined,
        "FAST",
      );
    } catch {
      // O cabeçalho textual continua íntegro se a imagem não puder ser decodificada.
    }
  }

  const copyX = logoDataUrl ? margin + 27 : margin + 7;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9.1);
  textColor(pdf, color.ink);
  pdf.text(
    valueOrFallback(officialMunicipalityName, "Prefeitura Municipal").toUpperCase(),
    copyX,
    13.9,
  );

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.35);
  textColor(pdf, color.navy);
  pdf.text(
    (pdf.splitTextToSize(effectiveSecretariat.toUpperCase(), 112) as string[]).slice(0, 1),
    copyX,
    18.1,
  );

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(5.15);
  textColor(pdf, color.muted);
  pdf.text(effectiveDirectorate.toUpperCase(), copyX, 21.8);

  const contact = [effectiveAddress, effectivePhone, municipalityEmail]
    .filter(Boolean)
    .join(" • ");
  if (contact) {
    pdf.setFontSize(4.35);
    pdf.text(
      (pdf.splitTextToSize(contact, 125) as string[]).slice(0, 1),
      copyX,
      25.8,
    );
  }

  fill(pdf, [241, 245, 249]);
  draw(pdf, [218, 226, 234]);
  pdf.roundedRect(pageWidth - margin - 44, 11, 38, 8.5, 4.2, 4.2, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.8);
  textColor(pdf, color.navy);
  pdf.text(
    permit.permitNumber,
    pageWidth - margin - 25,
    16.3,
    { align: "center" },
  );

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(4.4);
  textColor(pdf, directorOfficial ? color.green : color.muted);
  pdf.text(
    directorOfficial ? "EMITIDO" : "EM EMISSÃO",
    pageWidth - margin - 25,
    22.4,
    { align: "center" },
  );

  // Título principal em faixa institucional.
  fill(pdf, color.navy);
  draw(pdf, color.navy);
  pdf.roundedRect(margin, 39, contentWidth, 13, 2.2, 2.2, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11.2);
  textColor(pdf, color.white);
  pdf.text(permitDocumentTitle, pageWidth / 2, 47.2, { align: "center" });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(5.65);
  textColor(pdf, color.ink);
  const intro = isRegularization
    ? effectiveSecretariat +
      " expede o presente Alvará para a regularização da obra abaixo caracterizada, conforme o processo administrativo indicado."
    : effectiveSecretariat +
      " expede o presente Alvará para a obra abaixo caracterizada, conforme o processo administrativo indicado.";
  const introLines = pdf.splitTextToSize(intro, contentWidth - 4) as string[];
  pdf.text(introLines.slice(0, 2), margin + 2, 57, {
    lineHeightFactor: 1.18,
  });

  let y = 63;

  drawSectionTitle(
    pdf,
    margin,
    y,
    "Identificação do processo, titular e imóvel",
    contentWidth,
  );
  y += 8;

  const processW = 55;
  compactField(
    margin,
    y,
    processW,
    "Processo administrativo",
    process.protocol,
  );
  compactField(
    margin + processW + gap,
    y,
    contentWidth - processW - gap,
    "Identificação do imóvel / inscrição / IPTU",
    valueOrFallback(
      form?.propertyRegistration ||
        process.property.iptu ||
        process.property.registration,
    ),
  );
  y += 10.2;

  const ownerDocW = 48;
  compactField(
    margin,
    y,
    contentWidth - ownerDocW - gap,
    "Proprietário(s) / titular",
    valueOrFallback(form?.ownerName || process.ownerName),
  );
  compactField(
    pageWidth - margin - ownerDocW,
    y,
    ownerDocW,
    "CPF / CNPJ",
    valueOrFallback(form?.ownerDocument || process.ownerDocument),
  );
  y += 10.2;

  if (String(form?.ownerAddress || "").trim()) {
    compactField(
      margin,
      y,
      contentWidth,
      "Endereço do proprietário / titular",
      String(form?.ownerAddress || "").trim(),
    );
    y += 10.2;
  }

  compactField(
    margin,
    y,
    contentWidth,
    "Endereço da obra",
    propertyAddress || valueOrFallback(process.address),
  );
  y += 10.2;

  const regW = 49;
  const smallW = 23;
  compactField(
    margin,
    y,
    regW,
    "Inscrição imobiliária",
    valueOrFallback(
      form?.propertyRegistration ||
        process.property.iptu ||
        process.property.registration,
    ),
  );
  compactField(
    margin + regW + gap,
    y,
    smallW,
    "Lote",
    valueOrFallback(form?.lot || process.property.lot),
  );
  compactField(
    margin + regW + gap + smallW + gap,
    y,
    smallW,
    "Quadra",
    valueOrFallback(form?.block || process.property.block),
  );
  compactField(
    margin + regW + gap + smallW + gap + smallW + gap,
    y,
    contentWidth - regW - smallW * 2 - gap * 3,
    "Matrícula do imóvel / C.R.I.",
    registryValue || "Não informado",
  );
  y += 11.2;

  drawSectionTitle(pdf, margin, y, "Natureza da obra", contentWidth);
  y += 8;

  const natureW = (contentWidth - gap * 3) / 4;
  compactField(
    margin,
    y,
    natureW,
    "Área do terreno",
    formatDecimal(form?.landAreaM2, " m²"),
  );
  compactField(
    margin + (natureW + gap),
    y,
    natureW,
    "Testada",
    formatDecimal(form?.frontageM, " m"),
  );
  compactField(
    margin + (natureW + gap) * 2,
    y,
    natureW,
    "Uso",
    valueOrFallback(form?.usage || process.property.usage),
  );
  compactField(
    margin + (natureW + gap) * 3,
    y,
    natureW,
    isRegularization ? "Área a regularizar" : "Área licenciada",
    Number.isFinite(totalRegularizedArea) && totalRegularizedArea > 0
      ? totalRegularizedArea.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }) + " m²"
      : formatDecimal(
          form?.areaM2 || process.property.area,
          " m²",
          "Não informada",
        ),
  );
  y += 10.2;

  compactField(
    margin,
    y,
    natureW,
    "Nº de habitações",
    valueOrFallback(form?.housingUnits, "—"),
  );
  compactField(
    margin + (natureW + gap),
    y,
    natureW,
    "Nº de pavimentos",
    valueOrFallback(form?.floors, "—"),
  );
  compactField(
    margin + (natureW + gap) * 2,
    y,
    natureW,
    "Nº de banheiros",
    valueOrFallback(form?.bathrooms, "—"),
  );
  compactField(
    margin + (natureW + gap) * 3,
    y,
    natureW,
    "Padrão construtivo",
    valueOrFallback(
      form?.constructionStandard || process.property.constructionStandard,
      "—",
    ),
  );
  y += 11.2;

  drawSectionTitle(
    pdf,
    margin,
    y,
    isRegularization
      ? "Edificação - regularização"
      : "Edificação - área licenciada",
    contentWidth,
  );
  y += 8;

  const areaColWidth = 38;
  const descColWidth = contentWidth - areaColWidth;
  const tableHeaderH = 5.5;
  const tableRowH = 4.7;
  const tableTotalH = 5.6;

  fill(pdf, color.navy);
  draw(pdf, color.navy);
  pdf.rect(margin, y, descColWidth, tableHeaderH, "FD");
  pdf.rect(margin + descColWidth, y, areaColWidth, tableHeaderH, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.3);
  textColor(pdf, color.white);
  pdf.text(
    isRegularization ? "EDIFICAÇÃO / REGULARIZAÇÃO" : "EDIFICAÇÃO / LICENCIAMENTO",
    margin + 2.5,
    y + 3.7,
  );
  pdf.text("ÁREA (m²)", pageWidth - margin - 2.5, y + 3.7, {
    align: "right",
  });
  y += tableHeaderH;

  const rowsToRender =
    displayedAreaRows.length > 0
      ? displayedAreaRows
      : [{ description: "Área não informada", area: Number.NaN }];

  rowsToRender.forEach((item, index) => {
    fill(pdf, index % 2 === 0 ? color.white : color.soft);
    draw(pdf, color.line);
    pdf.rect(margin, y, descColWidth, tableRowH, "FD");
    pdf.rect(margin + descColWidth, y, areaColWidth, tableRowH, "FD");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(5.45);
    textColor(pdf, color.ink);
    pdf.text(
      (pdf.splitTextToSize(item.description, descColWidth - 5) as string[]).slice(0, 1),
      margin + 2.5,
      y + 3.2,
    );
    pdf.setFont("helvetica", "bold");
    pdf.text(
      Number.isFinite(item.area)
        ? item.area.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })
        : "—",
      pageWidth - margin - 2.5,
      y + 3.2,
      { align: "right" },
    );
    y += tableRowH;
  });

  fill(pdf, [241, 245, 249]);
  draw(pdf, color.line);
  pdf.rect(margin, y, descColWidth, tableTotalH, "FD");
  pdf.rect(margin + descColWidth, y, areaColWidth, tableTotalH, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.8);
  textColor(pdf, color.navy);
  pdf.text("TOTAL GERAL", margin + 2.5, y + 3.8);
  pdf.text(
    totalRegularizedArea > 0
      ? totalRegularizedArea.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : formatDecimal(form?.areaM2 || process.property.area, "", "—"),
    pageWidth - margin - 2.5,
    y + 3.8,
    { align: "right" },
  );
  y += tableTotalH + 2.5;

  drawSectionTitle(
    pdf,
    margin,
    y,
    isRegularization
      ? "Responsável técnico pelo projeto de regularização"
      : "Responsável técnico",
    contentWidth,
  );
  y += 8;

  const technicalNameW = 78;
  const technicalRegW = 38;
  const technicalTypeW = 27;
  compactField(
    margin,
    y,
    technicalNameW,
    "Responsável técnico",
    valueOrFallback(form?.technicalLead || process.technicalLead),
  );
  compactField(
    margin + technicalNameW + gap,
    y,
    technicalRegW,
    "CREA / CAU / CFT",
    valueOrFallback(
      form?.technicalRegistration || technicalProfile?.registrationNumber,
    ),
  );
  compactField(
    margin + technicalNameW + gap + technicalRegW + gap,
    y,
    technicalTypeW,
    "ART / RRT / TRT",
    valueOrFallback(form?.technicalResponsibilityType, "Documento"),
  );
  compactField(
    margin + technicalNameW + gap + technicalRegW + gap + technicalTypeW + gap,
    y,
    contentWidth -
      technicalNameW -
      technicalRegW -
      technicalTypeW -
      gap * 3,
    "Número",
    valueOrFallback(form?.technicalResponsibilityNumber),
  );
  y += 11.5;

  fill(pdf, color.soft);
  draw(pdf, color.line);
  pdf.roundedRect(margin, y, contentWidth, 12.5, 1.6, 1.6, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(4.6);
  textColor(pdf, color.muted);
  pdf.text("OBSERVAÇÕES E CONDIÇÕES", margin + 2.8, y + 3.4);
  const conditions = [
    "O Alvará vincula-se ao processo e ao projeto aprovados, sem dispensar exigências de outros órgãos competentes.",
    "O responsável técnico permanece responsável pelos dados, projeto e atribuições profissionais declaradas.",
    String(form?.complementaryConditions || "").trim(),
  ].filter(Boolean);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(5.05);
  textColor(pdf, color.ink);
  const conditionLines = pdf.splitTextToSize(
    conditions.join(" "),
    contentWidth - 6,
  ) as string[];
  pdf.text(conditionLines.slice(0, 4), margin + 2.8, y + 6.9, {
    lineHeightFactor: 1.12,
  });
  y += 15;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.1);
  textColor(pdf, color.ink);
  pdf.text(
    municipalityCity +
      ", " +
      formatLongDate(permit.issuedAt || permit.updatedAt) +
      ".",
    pageWidth / 2,
    y + 2.8,
    { align: "center" },
  );
  y += 6;

  const showManualDirectorLine = manualSignature && !directorOfficial;
  const hasSecretary = secretaryOfficial;
  if (hasSecretary) {
    const half = (contentWidth - gap) / 2;
    drawSignature(
      pdf,
      margin,
      y,
      half,
      "Diretoria responsável",
      permit.directorSignature,
      showManualDirectorLine,
    );
    drawSignature(
      pdf,
      margin + half + gap,
      y,
      half,
      "Secretaria municipal",
      permit.secretarySignature,
      false,
    );
  } else {
    drawSignature(
      pdf,
      margin,
      y,
      contentWidth,
      "Diretoria responsável",
      permit.directorSignature,
      showManualDirectorLine,
    );
  }
  y += 28;

  fill(
    pdf,
    directorOfficial
      ? ([240, 253, 250] as const)
      : ([248, 250, 252] as const),
  );
  draw(
    pdf,
    directorOfficial
      ? ([167, 243, 208] as const)
      : color.line,
  );
  pdf.roundedRect(margin, y, contentWidth, 8.7, 1.7, 1.7, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.5);
  textColor(pdf, directorOfficial ? color.green : color.navy);
  pdf.text(
    directorOfficial ? "ALVARÁ MUNICIPAL EMITIDO" : permitDocumentTitle,
    margin + 3,
    y + 3.6,
  );
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(4.65);
  textColor(pdf, color.muted);
  pdf.text(
    "Processo: " +
      process.protocol +
      " • Alvará: " +
      permit.permitNumber +
      " • Emissão: " +
      formatDate(permit.issuedAt || permit.updatedAt),
    margin + 3,
    y + 6.6,
  );

  draw(pdf, color.line);
  pdf.line(margin, pageHeight - 6.8, pageWidth - margin, pageHeight - 6.8);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(4.45);
  textColor(pdf, color.muted);
  pdf.text(
    (municipalityName || "Prefeitura Municipal") +
      " • Documento oficial gerado pelo SIGAPRO Municipal",
    pageWidth / 2,
    pageHeight - 3.4,
    { align: "center", maxWidth: contentWidth },
  );

  return pdf.output("blob");
}

export async function openConstructionPermitPdf(input: ConstructionPermitPdfInput) {
  const permitDocumentTitle = buildPermitDocumentTitle(
    input.permit.formData?.workType ||
      input.process.property.workType ||
      input.process.type,
  );
  const tabTitle = buildPermitTabTitle(
    permitDocumentTitle,
    input.permit.permitNumber,
    input.process.protocol,
  );
  const fileName = buildPermitFileName(
    permitDocumentTitle,
    input.permit.permitNumber,
    input.process.protocol,
  );

  const opened = window.open(
    "",
    `sigapro-alvara-${input.process.id}`,
    "noopener,noreferrer",
  );

  if (opened) {
    opened.opener = null;
    writePdfShell(opened, tabTitle, "Gerando PDF oficial do Alvará...");
  }

  try {
    const blob = await buildConstructionPermitPdfBlob(input);
    const namedBlob = new File([blob], fileName, { type: "application/pdf" });
    const url = URL.createObjectURL(namedBlob);

    if (opened) {
      opened.document.title = tabTitle;
      const status = opened.document.getElementById("sigapro-pdf-status");
      const frame = opened.document.getElementById(
        "sigapro-pdf-frame",
      ) as HTMLIFrameElement | null;

      if (status) status.remove();
      if (frame) {
        frame.src = url;
        frame.title = tabTitle;
      } else {
        writePdfShell(opened, tabTitle, "");
        const fallbackFrame = opened.document.getElementById(
          "sigapro-pdf-frame",
        ) as HTMLIFrameElement | null;
        if (fallbackFrame) fallbackFrame.src = url;
      }

      opened.document.title = tabTitle;
      opened.focus();
    } else {
      const fallback = document.createElement("a");
      fallback.href = url;
      fallback.download = fileName;
      fallback.rel = "noopener noreferrer";
      fallback.click();
    }

    window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
  } catch (error) {
    if (opened) {
      opened.document.title = `Erro • ${tabTitle}`;
      opened.document.body.innerHTML =
        '<div style="font-family:Arial,sans-serif;padding:32px;color:#991b1b">Não foi possível gerar o PDF do Alvará.</div>';
    }
    throw error;
  }
}
