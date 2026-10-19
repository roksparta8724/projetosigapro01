import { jsPDF } from "jspdf";
import { createQrCodeDataUrl } from "@/lib/qrCode";
import { buildPublicSignatureVerificationUrl } from "@/lib/signatureVerification";
import type { ProcessRecord } from "@/lib/platform";
import type { HabiteSePermitRecord } from "@/integrations/permits/habiteSePermitClient";

export type HabiteSePermitPdfSignature = {
  name?: string | null;
  role?: string | null;
  title?: string | null;
  registration?: string | null;
  signedAt?: string | null;
};

export type HabiteSePermitPdfInput = {
  permit: HabiteSePermitRecord;
  process: ProcessRecord;
  municipalityName: string;
  municipalityLogoUrl?: string | null;
  municipalityAddress?: string | null;
  municipalityPhone?: string | null;
  municipalityEmail?: string | null;
  secretariat?: string | null;
  directorate?: string | null;
  directorSignature?: HabiteSePermitPdfSignature | null;
  secretarySignature?: HabiteSePermitPdfSignature | null;
  verificationCode?: string | null;
  evidenceHash?: string | null;
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
  violet: [109, 40, 217] as const,
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
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function compactHash(hash?: string | null) {
  const value = String(hash || "").trim();
  if (!value) return "—";
  if (value.length <= 38) return value;
  return `${value.slice(0, 20)}...${value.slice(-12)}`;
}

function normalizeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const imageDataUrlCache = new Map<string, Promise<string | null>>();

async function loadImageDataUrl(url?: string | null) {
  const normalized = String(url || "").trim();
  if (!normalized) return null;
  if (normalized.startsWith("data:image/")) return normalized;

  const cached = imageDataUrlCache.get(normalized);
  if (cached) return cached;

  const request = (async () => {
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
  })();

  imageDataUrlCache.set(normalized, request);
  return request;
}

function imageFormat(dataUrl: string) {
  if (/^data:image\/jpe?g/i.test(dataUrl)) return "JPEG";
  if (/^data:image\/webp/i.test(dataUrl)) return "WEBP";
  return "PNG";
}

function drawSectionTitle(
  pdf: jsPDF,
  x: number,
  y: number,
  width: number,
  title: string,
) {
  fill(pdf, [241, 245, 249]);
  draw(pdf, [218, 226, 234]);
  pdf.setLineWidth(0.16);
  pdf.roundedRect(x, y, width, 7, 1.6, 1.6, "FD");
  fill(pdf, color.blue);
  pdf.roundedRect(x, y, 2.2, 7, 1, 1, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.2);
  textColor(pdf, color.ink);
  pdf.text(title.toUpperCase(), x + 4.6, y + 4.65);
}

function drawField(
  pdf: jsPDF,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  height = 11,
) {
  fill(pdf, color.soft);
  draw(pdf, color.line);
  pdf.setLineWidth(0.16);
  pdf.roundedRect(x, y, width, height, 1.7, 1.7, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(4.55);
  textColor(pdf, color.muted);
  pdf.text(label.toUpperCase(), x + 2.7, y + 3.35);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.25);
  textColor(pdf, color.ink);
  const lines = pdf.splitTextToSize(value || "—", width - 5.4) as string[];
  pdf.text(lines.slice(0, 2), x + 2.7, y + 7.2, {
    lineHeightFactor: 1.08,
  });
}

function drawParagraphBox(
  pdf: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  body: string,
) {
  fill(pdf, color.white);
  draw(pdf, color.line);
  pdf.setLineWidth(0.16);
  pdf.roundedRect(x, y, width, height, 1.8, 1.8, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.35);
  textColor(pdf, color.navy);
  pdf.text(title.toUpperCase(), x + 3, y + 4);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(5.25);
  textColor(pdf, color.ink);
  const lines = pdf.splitTextToSize(body || "—", width - 6) as string[];
  pdf.text(lines.slice(0, Math.max(1, Math.floor((height - 7) / 2.55))), x + 3, y + 7.6, {
    lineHeightFactor: 1.16,
  });
}

function drawSignatureBox(
  pdf: jsPDF,
  x: number,
  y: number,
  width: number,
  label: string,
  signature?: HabiteSePermitPdfSignature | null,
  verificationCode?: string | null,
) {
  const official = Boolean(signature?.signedAt);
  fill(pdf, official ? ([240, 253, 250] as const) : color.soft);
  draw(pdf, official ? ([167, 243, 208] as const) : color.line);
  pdf.setLineWidth(0.17);
  pdf.roundedRect(x, y, width, 24, 2, 2, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(4.7);
  textColor(pdf, official ? color.green : color.muted);
  pdf.text(official ? "ASSINATURA ELETRÔNICA VALIDADA" : "ASSINATURA PENDENTE", x + 3, y + 3.9);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.8);
  textColor(pdf, color.ink);
  pdf.text(label.toUpperCase(), x + 3, y + 7.8);

  pdf.setFontSize(6.35);
  const name = valueOrFallback(signature?.name, "Aguardando assinatura");
  pdf.text(
    (pdf.splitTextToSize(name, width - 6) as string[]).slice(0, 1),
    x + 3,
    y + 12,
  );

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(4.85);
  textColor(pdf, color.muted);
  const role = [signature?.title || signature?.role, signature?.registration]
    .filter(Boolean)
    .join(" • ");
  pdf.text(
    (pdf.splitTextToSize(role || label, width - 6) as string[]).slice(0, 1),
    x + 3,
    y + 15.3,
  );
  pdf.text(formatDate(signature?.signedAt), x + 3, y + 18.4);

  if (official && verificationCode) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(4.45);
    textColor(pdf, color.green);
    pdf.text(`Código: ${verificationCode}`, x + 3, y + 21.4);
  }
}

export async function buildHabiteSePermitPdfBlob({
  permit,
  process,
  municipalityName,
  municipalityLogoUrl,
  municipalityAddress,
  municipalityPhone,
  municipalityEmail,
  secretariat,
  directorate,
  directorSignature,
  secretarySignature,
  verificationCode,
  evidenceHash,
}: HabiteSePermitPdfInput) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
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
        : `Prefeitura Municipal de ${municipalityName}`;

  const effectiveSecretariat =
    secretariat ||
    (isCampoLimpo
      ? "Secretaria de Desenvolvimento Urbano, Habitação e Meio Ambiente"
      : "Secretaria responsável");
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

  const emitted = permit.status === "emitido" && Boolean(directorSignature?.signedAt);
  const waitingDirector = permit.status === "aguardando_diretor";
  const statusLabel = emitted
    ? "EMITIDO"
    : waitingDirector
      ? "AGUARDANDO DIRETORIA"
      : "EM ELABORAÇÃO";

  const fileTitle = `Alvará de Habite-se • ${permit.permitNumber} • ${process.protocol} • SIGAPRO`;

  pdf.setProperties({
    title: `Alvará de Habite-se - ${permit.permitNumber} - ${process.protocol}`,
    subject: `Alvará de Habite-se do processo ${process.protocol}`,
    author: officialMunicipalityName,
    creator: "SIGAPRO Municipal",
    keywords: "SIGAPRO, Habite-se, Alvará, Prefeitura, processo municipal",
  });

  // Cabeçalho institucional — mesmo padrão premium do Alvará de Construção.
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
      // Mantém o cabeçalho textual íntegro caso a imagem não possa ser lida.
    }
  }

  const copyX = logoDataUrl ? margin + 27 : margin + 7;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  textColor(pdf, color.ink);
  pdf.text(officialMunicipalityName.toUpperCase(), copyX, 13.9);

  pdf.setFontSize(5.3);
  textColor(pdf, color.navy);
  pdf.text(
    (pdf.splitTextToSize(effectiveSecretariat.toUpperCase(), 112) as string[]).slice(0, 1),
    copyX,
    18.1,
  );

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(5.1);
  textColor(pdf, color.muted);
  pdf.text(effectiveDirectorate.toUpperCase(), copyX, 21.8);

  const contact = [effectiveAddress, effectivePhone, municipalityEmail]
    .filter(Boolean)
    .join(" • ");
  if (contact) {
    pdf.setFontSize(4.3);
    pdf.text(
      (pdf.splitTextToSize(contact, 125) as string[]).slice(0, 1),
      copyX,
      25.8,
    );
  }

  fill(pdf, [241, 245, 249]);
  draw(pdf, [218, 226, 234]);
  pdf.roundedRect(pageWidth - margin - 45, 11, 39, 8.7, 4.2, 4.2, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.75);
  textColor(pdf, color.navy);
  pdf.text(permit.permitNumber, pageWidth - margin - 25.5, 16.35, {
    align: "center",
  });

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(4.4);
  textColor(pdf, emitted ? color.green : waitingDirector ? color.violet : color.muted);
  pdf.text(statusLabel, pageWidth - margin - 25.5, 22.5, { align: "center" });

  fill(pdf, color.navy);
  draw(pdf, color.navy);
  pdf.roundedRect(margin, 39, contentWidth, 13, 2.2, 2.2, "FD");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11.2);
  textColor(pdf, color.white);
  pdf.text("ALVARÁ DE HABITE-SE", pageWidth / 2, 47.2, { align: "center" });

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(5.65);
  textColor(pdf, color.ink);
  const intro =
    `${effectiveSecretariat} expede o presente Alvará de Habite-se com base nos registros técnicos, na vistoria/conferência e na situação financeira deste processo administrativo.`;
  const introLines = pdf.splitTextToSize(intro, contentWidth - 4) as string[];
  pdf.text(introLines.slice(0, 2), margin + 2, 57, { lineHeightFactor: 1.18 });

  let y = 63;
  drawSectionTitle(pdf, margin, y, contentWidth, "Identificação do processo e do imóvel");
  y += 8;

  const half = (contentWidth - gap) / 2;
  drawField(pdf, margin, y, half, "Processo administrativo", process.protocol);
  drawField(pdf, margin + half + gap, y, half, "Modalidade", permit.formData.modality || "Habite-se integral");
  y += 12.2;

  drawField(pdf, margin, y, half, "Proprietário / titular", valueOrFallback(process.ownerName));
  drawField(pdf, margin + half + gap, y, half, "CPF / CNPJ", valueOrFallback(process.ownerDocument));
  y += 12.2;

  drawField(pdf, margin, y, contentWidth, "Endereço do imóvel", valueOrFallback(process.address));
  y += 12.2;

  const quarter = (contentWidth - gap * 3) / 4;
  drawField(
    pdf,
    margin,
    y,
    quarter,
    "Área certificada",
    `${Number(process.property.area || 0).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} m²`,
  );
  drawField(pdf, margin + (quarter + gap), y, quarter, "Uso", valueOrFallback(process.property.usage));
  drawField(pdf, margin + (quarter + gap) * 2, y, quarter, "Padrão", valueOrFallback(process.property.constructionStandard, "—"));
  drawField(pdf, margin + (quarter + gap) * 3, y, quarter, "Conclusão informada", valueOrFallback(permit.formData.completionDate, "—"));
  y += 12.2;

  drawField(pdf, margin, y, half, "Processo de origem", valueOrFallback(permit.formData.sourceProcess));
  drawField(pdf, margin + half + gap, y, half, "Alvará de origem", valueOrFallback(permit.formData.sourcePermit));
  y += 12.2;

  drawSectionTitle(pdf, margin, y, contentWidth, "Responsabilidade técnica");
  y += 8;
  drawField(pdf, margin, y, contentWidth, "Responsável técnico", valueOrFallback(process.technicalLead));
  y += 13;

  drawParagraphBox(
    pdf,
    margin,
    y,
    contentWidth,
    22,
    "Certificação municipal",
    "Após análise documental, vistoria/conferência e confirmação do recolhimento da taxa de Habite-se, fica certificado o atendimento das condições registradas neste processo para ocupação do imóvel acima identificado.",
  );
  y += 24;

  drawParagraphBox(
    pdf,
    margin,
    y,
    contentWidth,
    18,
    "Condições, ressalvas e condicionantes",
    permit.formData.conditions || "Sem ressalvas ou condicionantes pendentes registradas no processo para a emissão deste Alvará de Habite-se.",
  );
  y += 20;

  drawParagraphBox(
    pdf,
    margin,
    y,
    contentWidth,
    18,
    "Parecer técnico conclusivo",
    permit.formData.observations || "Com base na documentação técnica, no projeto aprovado e nos registros de vistoria constantes do processo, a edificação encontra-se concluída e apta à ocupação para o uso declarado, observadas as condições do licenciamento e as normas técnicas aplicáveis.",
  );
  y += 21;

  if (secretarySignature?.signedAt) {
    const signatureWidth = (contentWidth - gap) / 2;
    drawSignatureBox(
      pdf,
      margin,
      y,
      signatureWidth,
      "Diretoria responsável",
      directorSignature,
      verificationCode,
    );
    drawSignatureBox(
      pdf,
      margin + signatureWidth + gap,
      y,
      signatureWidth,
      "Secretaria responsável",
      secretarySignature,
      verificationCode,
    );
  } else {
    drawSignatureBox(
      pdf,
      margin,
      y,
      contentWidth,
      "Diretoria responsável",
      directorSignature,
      verificationCode,
    );
  }
  y += 27;

  const verificationUrl =
    verificationCode && emitted
      ? buildPublicSignatureVerificationUrl(verificationCode)
      : "";
  const qrDataUrl = verificationUrl ? createQrCodeDataUrl(verificationUrl) : "";

  fill(pdf, emitted ? ([240, 253, 250] as const) : color.soft);
  draw(pdf, emitted ? ([167, 243, 208] as const) : color.line);
  pdf.roundedRect(margin, y, contentWidth, 18.5, 2, 2, "FD");

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.2);
  textColor(pdf, emitted ? color.green : color.navy);
  pdf.text(emitted ? "VALIDAÇÃO ELETRÔNICA DO DOCUMENTO" : "CONTROLE DE EMISSÃO", margin + 3, y + 4);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(4.75);
  textColor(pdf, color.muted);
  pdf.text(
    `Processo: ${process.protocol} • Alvará: ${permit.permitNumber} • Situação: ${statusLabel}`,
    margin + 3,
    y + 7.7,
  );
  pdf.text(`Código de verificação: ${verificationCode || "Aguardando assinatura final"}`, margin + 3, y + 11);
  pdf.text(`SHA-256: ${compactHash(evidenceHash)}`, margin + 3, y + 14.2);

  if (qrDataUrl) {
    const qrSize = 14;
    const qrX = pageWidth - margin - qrSize - 2.5;
    const qrY = y + 2.2;
    pdf.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
  }

  draw(pdf, color.line);
  pdf.line(margin, pageHeight - 6.8, pageWidth - margin, pageHeight - 6.8);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(4.45);
  textColor(pdf, color.muted);
  pdf.text(
    `${officialMunicipalityName} • Documento oficial gerado pelo SIGAPRO Municipal`,
    pageWidth / 2,
    pageHeight - 3.4,
    { align: "center", maxWidth: contentWidth },
  );

  // A propriedade só é usada para manter o título no Blob/navegador consistente.
  void fileTitle;
  return pdf.output("blob");
}

function prepareReservedWindow(opened: Window, title: string) {
  opened.document.open();
  opened.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#525659}</style>
</head>
<body></body>
</html>`);
  opened.document.close();
  opened.document.title = title;
}

function writePdfError(opened: Window, title: string) {
  opened.document.open();
  opened.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    *{box-sizing:border-box}
    html,body{margin:0;width:100%;height:100%;background:#071b2e;font-family:Arial,sans-serif;color:#fff}
    body{display:grid;place-items:center}
    main{width:min(520px,calc(100vw - 40px));padding:28px;border:1px solid rgba(255,255,255,.14);border-radius:24px;background:linear-gradient(145deg,#0a2d49,#0b567e);box-shadow:0 28px 80px rgba(0,0,0,.28)}
    .brand{font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#bae6fd}
    h1{margin:9px 0 0;font-size:21px;line-height:1.25}
    p{margin:14px 0 0;font-size:13px;line-height:1.6;color:#e2e8f0}
  </style>
</head>
<body>
  <main>
    <div class="brand">SIGAPRO • Documento oficial</div>
    <h1>${escapeHtml(title)}</h1>
    <p>Não foi possível gerar o PDF do Alvará de Habite-se. Feche esta guia e tente novamente.</p>
  </main>
</body>
</html>`);
  opened.document.close();
  opened.document.title = title;
}

export function reserveHabiteSePermitPdfWindow(
  input: Pick<HabiteSePermitPdfInput, "permit" | "process">,
) {
  const title = `Alvará de Habite-se • ${input.permit.permitNumber} • ${input.process.protocol} • SIGAPRO`;
  const opened = window.open("about:blank", `sigapro-habite-se-${input.process.id}`);
  if (!opened) return null;
  opened.opener = null;
  prepareReservedWindow(opened, title);
  opened.focus();
  return opened;
}

export async function openHabiteSePermitPdf(
  input: HabiteSePermitPdfInput,
  reservedWindow?: Window | null,
) {
  const title = `Alvará de Habite-se • ${input.permit.permitNumber} • ${input.process.protocol} • SIGAPRO`;
  const opened =
    reservedWindow && !reservedWindow.closed
      ? reservedWindow
      : reserveHabiteSePermitPdfWindow(input);

  if (!opened) {
    throw new Error(
      "O navegador bloqueou a abertura do PDF. Libere pop-ups para o SIGAPRO e tente novamente.",
    );
  }

  try {
    const blob = await buildHabiteSePermitPdfBlob(input);
    const fileName = `${normalizeFileName(
      `Alvara-Habite-se-${input.permit.permitNumber}-${input.process.protocol}`,
    ) || "Alvara-Habite-se"}.pdf`;
    const namedBlob = new File([blob], fileName, { type: "application/pdf" });
    const url = URL.createObjectURL(namedBlob);
    opened.location.replace(url);
    opened.focus();
    window.setTimeout(() => URL.revokeObjectURL(url), 15 * 60_000);
  } catch (error) {
    if (!opened.closed) writePdfError(opened, `Erro • ${title}`);
    throw error;
  }
}
