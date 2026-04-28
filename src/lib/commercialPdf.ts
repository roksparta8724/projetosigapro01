import { jsPDF } from "jspdf";
import { getPublicAssetUrl } from "@/lib/assetUrl";
import { formatCurrency, type PlanItem } from "@/lib/platform";

type CommercialMaterialType = "banner" | "folder" | "proposta";

type BuildCommercialPdfOptions = {
  plans: PlanItem[];
  materialType: CommercialMaterialType;
  templateTitle: string;
  title: string;
  subtitle: string;
  customerName: string;
  customerContact: string;
  responsibleName: string;
  responsibleRole: string;
  responsibleEmail: string;
  customMessage: string;
  validityDate: string;
  observations: string;
  hidePrices: boolean;
  municipalityProfile?: {
    name: string;
    cnpj: string;
    address: string;
    city: string;
    state: string;
    phone: string;
    email: string;
    secretariat: string;
    directorate: string;
    primaryResponsibleName: string;
    primaryResponsibleRole: string;
    administratorName: string;
    administratorEmail: string;
    status: string;
    subdomain: string;
    plan: string;
    activeModules: string[];
    users: number;
    processes: number;
  } | null;
};

type PdfColor = readonly [number, number, number];
type ThemeTone = "light" | "dark";
type ImageAsset = { dataUrl: string; width: number; height: number };
type TextStyle = "normal" | "bold";
type CardTone = "light" | "dark" | "soft" | "accent";

type GridCard = {
  eyebrow?: string;
  title: string;
  body: string;
  accent?: PdfColor;
  tone?: CardTone;
};

type MetricCard = {
  label: string;
  value: string;
  helper: string;
};

const palette = {
  page: [244, 247, 251] as const,
  white: [255, 255, 255] as const,
  ink: [15, 23, 42] as const,
  text: [30, 41, 59] as const,
  muted: [71, 85, 105] as const,
  soft: [100, 116, 139] as const,
  line: [209, 219, 231] as const,
  lineDark: [71, 85, 105] as const,
  navy: [10, 22, 41] as const,
  navySoft: [28, 52, 84] as const,
  navyCard: [16, 30, 53] as const,
  blue: [37, 99, 235] as const,
  blueSoft: [219, 234, 254] as const,
  teal: [13, 148, 136] as const,
  tealSoft: [204, 251, 241] as const,
  amber: [217, 119, 6] as const,
  amberSoft: [254, 243, 199] as const,
  rose: [225, 29, 72] as const,
  roseSoft: [255, 228, 230] as const,
} satisfies Record<string, PdfColor>;

const billingLabels: Record<string, string> = {
  mensal: "mensal",
  anual: "anual",
  personalizado: "modelo personalizado",
};

function toDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Nao foi possivel converter o logotipo oficial."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler o logotipo oficial."));
    reader.readAsDataURL(blob);
  });
}

function readImageMetrics(dataUrl: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || 1, height: image.naturalHeight || 1 });
    image.onerror = () => reject(new Error("Falha ao identificar a proporcao do logotipo."));
    image.src = dataUrl;
  });
}

async function loadLogoAsset(fileName: string): Promise<ImageAsset | null> {
  try {
    const response = await fetch(getPublicAssetUrl(fileName), { cache: "force-cache" });
    if (!response.ok) return null;
    const blob = await response.blob();
    const dataUrl = await toDataUrl(blob);
    const metrics = await readImageMetrics(dataUrl);
    return { dataUrl, ...metrics };
  } catch {
    return null;
  }
}

function setTextColor(pdf: jsPDF, color: PdfColor) {
  pdf.setTextColor(color[0], color[1], color[2]);
}

function setFillColor(pdf: jsPDF, color: PdfColor) {
  pdf.setFillColor(color[0], color[1], color[2]);
}

function setDrawColor(pdf: jsPDF, color: PdfColor) {
  pdf.setDrawColor(color[0], color[1], color[2]);
}

function splitText(pdf: jsPDF, text: string, width: number) {
  return pdf.splitTextToSize(text || "", Math.max(width, 1)) as string[];
}

function measureText(
  pdf: jsPDF,
  text: string,
  width: number,
  fontSize: number,
  lineHeight: number,
  fontStyle: TextStyle = "normal",
) {
  pdf.setFont("helvetica", fontStyle);
  pdf.setFontSize(fontSize);
  const lines = splitText(pdf, text, width);
  return {
    lines,
    height: Math.max(lines.length, 1) * lineHeight,
  };
}

function drawTextLines(
  pdf: jsPDF,
  lines: string[],
  x: number,
  y: number,
  fontSize: number,
  lineHeight: number,
  color: PdfColor,
  fontStyle: TextStyle = "normal",
  align: "left" | "right" | "center" = "left",
) {
  if (lines.length === 0) return y;
  pdf.setFont("helvetica", fontStyle);
  pdf.setFontSize(fontSize);
  setTextColor(pdf, color);
  pdf.text(lines, x, y, { align });
  return y + lines.length * lineHeight;
}

function drawRoundedCard(
  pdf: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  tone: CardTone = "light",
) {
  if (tone === "dark") {
    setFillColor(pdf, palette.navyCard);
    setDrawColor(pdf, palette.navySoft);
    pdf.roundedRect(x, y, width, height, 7, 7, "FD");
    return;
  }

  if (tone === "soft") {
    setFillColor(pdf, palette.page);
    setDrawColor(pdf, palette.line);
    pdf.roundedRect(x, y, width, height, 6, 6, "FD");
    return;
  }

  if (tone === "accent") {
    setFillColor(pdf, palette.blueSoft);
    setDrawColor(pdf, [191, 219, 254]);
    pdf.roundedRect(x, y, width, height, 6, 6, "FD");
    return;
  }

  setFillColor(pdf, palette.white);
  setDrawColor(pdf, palette.line);
  pdf.roundedRect(x, y, width, height, 7, 7, "FD");
}

function getAccentBadgeFill(accent: PdfColor) {
  if (accent === palette.blueSoft) return [147, 197, 253] as const;
  if (accent === palette.tealSoft) return [153, 246, 228] as const;
  if (accent === palette.amberSoft) return [253, 230, 138] as const;
  if (accent === palette.roseSoft) return [254, 205, 211] as const;
  return accent;
}

function drawLogoContain(
  pdf: jsPDF,
  asset: ImageAsset | null,
  x: number,
  y: number,
  width: number,
  height: number,
  tone: ThemeTone,
) {
  setFillColor(pdf, tone === "dark" ? palette.white : palette.navy);
  setDrawColor(pdf, tone === "dark" ? [203, 213, 225] : [51, 65, 85]);
  pdf.roundedRect(x, y, width, height, 8, 8, "FD");

  if (!asset) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    setTextColor(pdf, tone === "dark" ? palette.navy : palette.white);
    pdf.text("SIG", x + width / 2, y + height / 2 + 1.5, { align: "center" });
    return;
  }

  const padding = Math.max(1.5, Math.min(width, height) * 0.09);
  const maxWidth = width - padding * 2;
  const maxHeight = height - padding * 2;
  const imageRatio = asset.width / asset.height;
  const boxRatio = maxWidth / maxHeight;
  const renderWidth = boxRatio > imageRatio ? maxHeight * imageRatio : maxWidth;
  const renderHeight = boxRatio > imageRatio ? maxHeight : maxWidth / imageRatio;
  const offsetX = x + (width - renderWidth) / 2;
  const offsetY = y + (height - renderHeight) / 2;

  pdf.addImage(asset.dataUrl, "PNG", offsetX, offsetY, renderWidth, renderHeight, undefined, "FAST");
}

function drawCheckIcon(
  pdf: jsPDF,
  x: number,
  y: number,
  tone: ThemeTone,
  variant: "outline" | "inverse" = "outline",
) {
  const ring =
    variant === "inverse"
      ? palette.white
      : tone === "dark"
        ? ([191, 219, 254] as const)
        : palette.blue;
  const check = variant === "inverse" ? palette.white : tone === "dark" ? palette.white : palette.blue;
  pdf.setLineWidth(0.65);
  setDrawColor(pdf, ring);
  pdf.circle(x, y, 2.7);
  setDrawColor(pdf, check);
  pdf.line(x - 0.8, y + 0.1, x - 0.15, y + 0.9);
  pdf.line(x - 0.15, y + 0.9, x + 1.1, y - 0.75);
}

function drawNumberBadge(pdf: jsPDF, x: number, y: number, label: string) {
  setFillColor(pdf, palette.navy);
  pdf.circle(x, y, 3.5, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  setTextColor(pdf, palette.white);
  pdf.text(label, x, y + 0.7, { align: "center" });
}

function normalizeFeatureList(values: string[], fallback: string[]) {
  const cleaned = values.map((item) => item.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : fallback;
}

function getPlanBadge(plan?: PlanItem) {
  if (plan?.badge?.trim()) return plan.badge.trim();
  if (plan?.isFeatured) return "Plano recomendado";
  if (plan?.isCustom) return "Plano customizado";
  return "Solucao institucional";
}

function getPlanPrice(plan: PlanItem | undefined, hidePrices: boolean) {
  if (!plan || hidePrices) return "Sob consulta";
  return formatCurrency(plan.price);
}

function getHighlights(plans: PlanItem[]) {
  const values = plans.flatMap((plan) => normalizeFeatureList(plan.featuresIncluded, []));
  return Array.from(new Set(values.filter(Boolean))).slice(0, 8);
}

function computeCardHeight(pdf: jsPDF, card: GridCard, width: number, tone: CardTone = "light") {
  const eyebrowHeight = card.eyebrow ? 5.6 : 0;
  const titleWidth = width - (tone === "dark" ? 12 : 20);
  const bodyWidth = width - (tone === "dark" ? 12 : 12);
  const titleBox = measureText(pdf, card.title, titleWidth, 10.8, 4.9, "bold");
  const bodyBox = measureText(pdf, card.body, bodyWidth, 8.5, 4.2);
  const topPadding = tone === "dark" ? 8 : 10;
  const bottomPadding = tone === "dark" ? 8 : 9;
  const accentHeight = tone === "dark" ? 0 : 10;
  const titleGap = 2.8;
  return {
    titleBox,
    bodyBox,
    height: topPadding + eyebrowHeight + titleBox.height + titleGap + bodyBox.height + accentHeight + bottomPadding + 4,
  };
}

function drawGridCard(pdf: jsPDF, x: number, y: number, width: number, card: GridCard, forcedHeight?: number) {
  const tone = card.tone ?? "light";
  const metrics = computeCardHeight(pdf, card, width, tone);
  const height = forcedHeight ?? metrics.height;
  drawRoundedCard(pdf, x, y, width, height, tone);

  if (tone !== "dark") {
    const accent = getAccentBadgeFill(card.accent ?? palette.blueSoft);
    setFillColor(pdf, accent);
    pdf.roundedRect(x + 4, y + 4, 9.5, 9.5, 4, 4, "F");
    drawCheckIcon(pdf, x + 8.8, y + 8.8, "light", "inverse");
  }

  let cursorY = y + 8.2;
  const textX = tone === "dark" ? x + 6 : x + 16;
  if (card.eyebrow) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.4);
    setTextColor(pdf, tone === "dark" ? [147, 197, 253] : palette.soft);
    pdf.text(card.eyebrow.toUpperCase(), textX, cursorY);
    cursorY += 5.8;
  }

  cursorY = drawTextLines(
    pdf,
    metrics.titleBox.lines,
    textX,
    cursorY,
    10.8,
    4.9,
    tone === "dark" ? palette.white : palette.ink,
    "bold",
  );
  cursorY += 2.8;
  drawTextLines(
    pdf,
    metrics.bodyBox.lines,
    tone === "dark" ? x + 6 : x + 6,
    cursorY,
    8.5,
    4.2,
    tone === "dark" ? [226, 232, 240] : palette.text,
  );
}

export async function buildCommercialPdfBlob({
  plans,
  materialType,
  templateTitle,
  title,
  subtitle,
  customerName,
  customerContact,
  responsibleName,
  responsibleRole,
  responsibleEmail,
  customMessage,
  validityDate,
  observations,
  hidePrices,
  municipalityProfile,
}: BuildCommercialPdfOptions) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const topbarLogoAsset = await loadLogoAsset("sigapro-topbar-logo.png");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginX = 16;
  const contentWidth = pageWidth - marginX * 2;
  const topLimit = 20;
  const bottomLimit = pageHeight - 21;
  const generatedAt = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

  const safePlans = plans.length > 0 ? plans : [];
  const leadPlan = safePlans.find((plan) => plan.isFeatured) ?? safePlans[0];
  const comparisonPlans = safePlans.filter((plan) => plan.id !== leadPlan?.id).slice(0, 4);
  const highlights = getHighlights(safePlans);

  const customerLabel = customerName.trim() || "Prefeitura em apresentacao";
  const contactLabel = customerContact.trim() || "Contato institucional a definir";
  const signatureName = responsibleName.trim() || "Direcao SIGAPRO";
  const signatureRole = responsibleRole.trim() || "Diretor responsavel SIGAPRO";
  const signatureEmail = responsibleEmail.trim() || "contato@sigapro.govtech";
  const proposalValidity = validityDate.trim() || "Validade sob alinhamento comercial";
  const proposalTitle = title.trim() || "Proposta institucional SIGAPRO";
  const proposalSubtitle =
    subtitle.trim() ||
    "Sistema Integrado de Gestao e Aprovacao de Projetos com governanca operacional, analise tecnica e leitura executiva para a Prefeitura.";
  const commercialMessage =
    customMessage.trim() ||
    "O SIGAPRO unifica protocolo, analise tecnica, documentos, financeiro e governanca em uma unica operacao digital, reduzindo retrabalho e ampliando previsibilidade para a gestao urbana.";

  const benefitItems = normalizeFeatureList(leadPlan?.featuresIncluded ?? [], [
    "Usuarios com governanca por perfil e trilha auditavel.",
    "Processos digitais com leitura por etapa e historico institucional.",
    "Analise tecnica estruturada com exigencias e retornos controlados.",
    "Painel executivo com fila, prazo, indicadores e conformidade.",
    "Implantacao assistida com ativacao orientada a operacao municipal.",
    "Suporte institucional para consolidacao da rotina e do controle interno.",
  ]);

  const excludedItems = normalizeFeatureList(leadPlan?.featuresExcluded ?? [], [
    "Itens fora do escopo base podem ser configurados como expansao comercial.",
  ]);

  const implementationSteps = [
    "Alinhamento tecnico com definicao do escopo institucional prioritario.",
    "Parametrizacao do municipio, perfis, departamentos e regras de operacao.",
    "Ativacao guiada com acompanhamento da primeira rotina operacional.",
    "Consolidacao da governanca com suporte consultivo e leitura executiva.",
  ];

  const notInformed = "Nao informado";
  const municipalityName = municipalityProfile?.name?.trim() || customerLabel;
  const municipalityLocation = [municipalityProfile?.city?.trim(), municipalityProfile?.state?.trim()].filter(Boolean).join(" / ") || "Municipio em alinhamento institucional";
  const municipalityCnpj = municipalityProfile?.cnpj?.trim() || notInformed;
  const municipalityAddress = municipalityProfile?.address?.trim() || notInformed;
  const municipalityPhone = municipalityProfile?.phone?.trim() || notInformed;
  const municipalityEmail = municipalityProfile?.email?.trim() || notInformed;
  const municipalitySecretariat = municipalityProfile?.secretariat?.trim() || notInformed;
  const municipalityDirectorate = municipalityProfile?.directorate?.trim() || notInformed;
  const municipalityPrimaryResponsibleName = municipalityProfile?.primaryResponsibleName?.trim() || notInformed;
  const municipalityPrimaryResponsibleRole = municipalityProfile?.primaryResponsibleRole?.trim() || notInformed;
  const municipalityAdministratorName = municipalityProfile?.administratorName?.trim() || notInformed;
  const municipalityAdministratorEmail = municipalityProfile?.administratorEmail?.trim() || notInformed;
  const municipalityStatus = municipalityProfile?.status?.trim() || "prospeccao";
  const municipalitySubdomain = municipalityProfile?.subdomain?.trim() || "sob definicao";
  const municipalityPlan = municipalityProfile?.plan?.trim() || "plano em definicao";
  const municipalityModules =
    municipalityProfile?.activeModules?.filter(Boolean).slice(0, 6) ??
    [];
  const municipalityUsers = municipalityProfile?.users ?? 0;
  const municipalityProcesses = municipalityProfile?.processes ?? 0;
  const municipalityNarrative =
    municipalityStatus === "ativo"
      ? `${municipalityName} ja opera com base institucional ativa, o que favorece uma proposta orientada a consolidacao, ampliacao de modulos e ganho de governanca executiva.`
      : municipalityStatus === "implantacao"
        ? `${municipalityName} esta em fase de implantacao, o que pede uma proposta com foco em ativacao guiada, parametrizacao segura e ritmo controlado de entrada em operacao.`
        : `${municipalityName} aparece como oportunidade institucional em estruturacao, com proposta direcionada para organizar protocolo, analise tecnica e leitura executiva desde a origem.`;
  const municipalityOperationFocus =
    municipalityModules.length > 0
      ? `A configuracao atual contempla ${municipalityModules.length} frente(s) funcional(is), permitindo direcionar a proposta ao contexto real da prefeitura e ao seu desenho operacional.`
      : "A proposta comercial considera um desenho institucional flexivel, pronto para ser adaptado a secretaria responsavel, perfil de operacao e prioridades da prefeitura.";
  const municipalityCoverTitle = `Proposta institucional para ${municipalityName}`;

  let currentTone: ThemeTone = "dark";
  let y = topLimit;

  const setPageTheme = (tone: ThemeTone) => {
    currentTone = tone;
    if (tone === "dark") {
      setFillColor(pdf, palette.navy);
      pdf.rect(0, 0, pageWidth, pageHeight, "F");
      setFillColor(pdf, palette.navySoft);
      pdf.circle(pageWidth - 20, 28, 34, "F");
      pdf.circle(18, pageHeight - 16, 24, "F");
      return;
    }

    setFillColor(pdf, palette.page);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");
    setFillColor(pdf, palette.white);
    pdf.roundedRect(8, 8, pageWidth - 16, pageHeight - 16, 10, 10, "F");
  };

  const drawFooter = (pageNumber: number, totalPages: number) => {
    const footerTone = pageNumber === 1 ? "dark" : "light";
    setDrawColor(pdf, footerTone === "dark" ? ([84, 117, 167] as const) : palette.line);
    pdf.setLineWidth(0.3);
    pdf.line(marginX, pageHeight - 12, pageWidth - marginX, pageHeight - 12);
    drawLogoContain(pdf, topbarLogoAsset, marginX, pageHeight - 10.6, 9.2, 9.2, footerTone);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.7);
    setTextColor(pdf, footerTone === "dark" ? palette.white : palette.ink);
    pdf.text("SIGAPRO", marginX + 12.2, pageHeight - 7.4);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    setTextColor(pdf, footerTone === "dark" ? ([203, 213, 225] as const) : palette.soft);
    pdf.text("Sistema Integrado de Gestao e Aprovacao de Projetos", marginX + 12.2, pageHeight - 4.2);
    pdf.text(`${pageNumber}/${totalPages}`, pageWidth - marginX, pageHeight - 6, { align: "right" });
  };

  const startBodyPage = (eyebrow: string, heading: string, description: string, continuationLabel?: string) => {
    pdf.addPage();
    setPageTheme("light");
    y = topLimit;

    if (continuationLabel) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.2);
      setTextColor(pdf, palette.soft);
      pdf.text(continuationLabel.toUpperCase(), marginX, y);
      y += 7;
    }

    const eyebrowWidth = Math.max(34, pdf.getTextWidth(eyebrow.toUpperCase()) + 12);
    setFillColor(pdf, palette.blueSoft);
    pdf.roundedRect(marginX, y - 1.6, eyebrowWidth, 9.2, 4.6, 4.6, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.2);
    setTextColor(pdf, palette.blue);
    pdf.text(eyebrow.toUpperCase(), marginX + eyebrowWidth / 2, y + 3.35, { align: "center" });
    y += 14.5;

    const headingBox = measureText(pdf, heading, contentWidth, 19.2, 7.6, "bold");
    y = drawTextLines(pdf, headingBox.lines, marginX, y, 19.2, 7.6, palette.ink, "bold");
    y += 1.8;
    const descriptionBox = measureText(pdf, description, contentWidth, 9.8, 4.8);
    y = drawTextLines(pdf, descriptionBox.lines, marginX, y, 9.8, 4.8, palette.muted);
    y += 7;
  };

  const ensurePageSpace = (requiredHeight: number, sectionLabel: string) => {
    if (y + requiredHeight <= bottomLimit) return;
    startBodyPage(
      "continuidade",
      sectionLabel,
      "Continuidade da proposta comercial com o mesmo padrao institucional e diagramação segura.",
      sectionLabel,
    );
  };

  const drawSectionHeading = (eyebrow: string, heading: string, description?: string) => {
    const headingBox = measureText(pdf, heading, contentWidth, 16.2, 6.6, "bold");
    const descriptionBox = description ? measureText(pdf, description, contentWidth, 9.2, 4.5) : { height: 0 };
    ensurePageSpace(headingBox.height + descriptionBox.height + 12, heading);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.2);
    setTextColor(pdf, palette.blue);
    pdf.text(eyebrow.toUpperCase(), marginX, y);
    y += 6.5;
    y = drawTextLines(pdf, headingBox.lines, marginX, y, 16.2, 6.6, palette.ink, "bold");
    if (description) {
      y += 1.5;
      y = drawTextLines(pdf, descriptionBox.lines, marginX, y, 9.2, 4.5, palette.muted);
    }
    y += 6;
  };

  const drawNarrativeCard = (eyebrow: string, titleText: string, body: string, accent: PdfColor) => {
    const card: GridCard = {
      eyebrow,
      title: titleText,
      body,
      accent,
      tone: "light",
    };
    const metrics = computeCardHeight(pdf, card, contentWidth, "light");
    ensurePageSpace(metrics.height + 4, titleText);
    drawGridCard(pdf, marginX, y, contentWidth, card, metrics.height);
    y += metrics.height + 5;
  };

  const drawCardGrid = (
    items: GridCard[],
    sectionLabel: string,
    columns = 2,
    gap = 8,
  ) => {
    const safeColumns = Math.max(1, columns);
    const columnWidth = (contentWidth - gap * (safeColumns - 1)) / safeColumns;
    for (let rowStart = 0; rowStart < items.length; rowStart += safeColumns) {
      const rowItems = items.slice(rowStart, rowStart + safeColumns);
      const metrics = rowItems.map((item) => computeCardHeight(pdf, item, columnWidth, item.tone ?? "light"));
      const rowHeight = Math.max(...metrics.map((item) => item.height));
      ensurePageSpace(rowHeight + 4, sectionLabel);
      rowItems.forEach((item, index) => {
        const x = marginX + index * (columnWidth + gap);
        drawGridCard(pdf, x, y, columnWidth, item, rowHeight);
      });
      y += rowHeight + 5;
    }
  };

  const drawMetricsGrid = (items: MetricCard[], sectionLabel: string) => {
    const columns = 2;
    const gap = 5;
    const columnWidth = (contentWidth - 16 - gap) / columns;
    const rows = [];
    for (let index = 0; index < items.length; index += columns) {
      rows.push(items.slice(index, index + columns));
    }

    const rowHeights = rows.map((row) =>
      Math.max(
        ...row.map((item) => {
          const valueBox = measureText(pdf, item.value, columnWidth - 8, 9, 4.4, "bold");
          const helperBox = measureText(pdf, item.helper, columnWidth - 8, 7.8, 3.9);
          return 18 + valueBox.height + helperBox.height;
        }),
      ),
    );

    const totalHeight = rowHeights.reduce((sum, current) => sum + current, 0) + gap * Math.max(rows.length - 1, 0);
    ensurePageSpace(totalHeight + 4, sectionLabel);

    let rowY = y;
    rows.forEach((row, rowIndex) => {
      const rowHeight = rowHeights[rowIndex];
      row.forEach((item, columnIndex) => {
        const x = marginX + 8 + columnIndex * (columnWidth + gap);
        drawRoundedCard(pdf, x, rowY, columnWidth, rowHeight, "light");
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(6.3);
        setTextColor(pdf, palette.soft);
        pdf.text(item.label, x + 4, rowY + 6.2);
        const valueBox = measureText(pdf, item.value, columnWidth - 8, 9, 4.4, "bold");
        let contentY = rowY + 12.2;
        contentY = drawTextLines(pdf, valueBox.lines, x + 4, contentY, 9, 4.4, palette.ink, "bold");
        contentY += 1.4;
        const helperBox = measureText(pdf, item.helper, columnWidth - 8, 7.8, 3.9);
        drawTextLines(pdf, helperBox.lines, x + 4, contentY, 7.8, 3.9, palette.muted);
      });
      rowY += rowHeight + gap;
    });

    y = rowY - gap;
  };

  const drawPlanHighlight = () => {
    if (!leadPlan) return;

    const leftWidth = 94;
    const rightWidth = contentWidth - leftWidth - 16;
    const titleBox = measureText(pdf, leadPlan.name, leftWidth, 18.5, 7.1, "bold");
    const subtitleSource = leadPlan.subtitle || leadPlan.description || "Plano institucional com leitura premium para operacao municipal.";
    const subtitleBox = measureText(pdf, subtitleSource, leftWidth, 9.2, 4.5);
    const priceBox = measureText(pdf, getPlanPrice(leadPlan, hidePrices), rightWidth, 19.2, 7, "bold");
    const metaText = `${billingLabels[leadPlan.billingCycle] || "modelo personalizado"} | ${customerLabel}`;
    const metaBox = measureText(pdf, metaText, rightWidth, 8.4, 4.2);

    const metricItems: MetricCard[] = [
      {
        label: "USUARIOS",
        value: leadPlan.maxUsers == null ? "Ilimitados" : String(leadPlan.maxUsers),
        helper: "Capacidade de acesso por perfil institucional.",
      },
      {
        label: "PROCESSOS",
        value: leadPlan.maxProcesses == null ? "Ilimitados" : String(leadPlan.maxProcesses),
        helper: "Volume operacional previsto para o plano.",
      },
      {
        label: "ORGAOS",
        value: leadPlan.maxDepartments == null ? "Sob configuracao" : String(leadPlan.maxDepartments),
        helper: "Estrutura setorial contemplada no pacote.",
      },
      {
        label: "MODULOS",
        value: leadPlan.modulesIncluded.length > 0 ? String(leadPlan.modulesIncluded.length) : "Completo",
        helper: "Abrangencia funcional habilitada.",
      },
      {
        label: "ARQUIVOS",
        value: leadPlan.maxStorageGb == null ? "Sob alinhamento" : `${leadPlan.maxStorageGb} GB`,
        helper: "Capacidade documental e repositorio previsto.",
      },
      {
        label: "OPERACAO",
        value: getPlanBadge(leadPlan),
        helper: "Leitura comercial e posicionamento do plano.",
      },
    ];

    const columns = 2;
    const metricGap = 5;
    const metricWidth = (contentWidth - 16 - metricGap) / columns;
    const metricRows = [];
    for (let index = 0; index < metricItems.length; index += columns) {
      metricRows.push(metricItems.slice(index, index + columns));
    }

    const metricRowHeights = metricRows.map((row) =>
      Math.max(
        ...row.map((item) => {
          const valueBox = measureText(pdf, item.value, metricWidth - 8, 9, 4.4, "bold");
          const helperBox = measureText(pdf, item.helper, metricWidth - 8, 7.8, 3.9);
          return 18 + valueBox.height + helperBox.height;
        }),
      ),
    );

    const metricsHeight =
      metricRowHeights.reduce((sum, current) => sum + current, 0) + metricGap * Math.max(metricRowHeights.length - 1, 0);
    const noteText = observations.trim() || leadPlan.notes.trim();
    const noteBox = noteText ? measureText(pdf, noteText, contentWidth - 24, 8.4, 4.1) : null;
    const headerHeight = Math.max(titleBox.height + subtitleBox.height + 12, priceBox.height + metaBox.height + 9);
    const totalHeight = 18 + headerHeight + metricsHeight + (noteBox ? noteBox.height + 16 : 0) + 16;

    ensurePageSpace(totalHeight + 5, leadPlan.name);
    drawRoundedCard(pdf, marginX, y, contentWidth, totalHeight, "dark");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.2);
    setTextColor(pdf, [147, 197, 253]);
    pdf.text("PLANO SELECIONADO", marginX + 8, y + 10);

    setFillColor(pdf, palette.white);
    pdf.roundedRect(pageWidth - marginX - 50, y + 6, 44, 10, 5, 5, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.9);
    setTextColor(pdf, palette.navy);
    pdf.text(getPlanBadge(leadPlan).toUpperCase(), pageWidth - marginX - 28, y + 12.4, { align: "center" });

    let leftY = y + 22;
    leftY = drawTextLines(pdf, titleBox.lines, marginX + 8, leftY, 18.5, 7.1, palette.white, "bold");
    leftY += 1.4;
    drawTextLines(pdf, subtitleBox.lines, marginX + 8, leftY, 9.2, 4.5, [226, 232, 240]);

    let rightY = y + 22;
    rightY = drawTextLines(
      pdf,
      priceBox.lines,
      pageWidth - marginX - 8,
      rightY,
      19.2,
      7,
      palette.white,
      "bold",
      "right",
    );
    rightY += 1.1;
    drawTextLines(pdf, metaBox.lines, pageWidth - marginX - 8, rightY, 8.4, 4.2, [191, 219, 254], "normal", "right");

    const savedY = y;
    y = y + 16 + headerHeight;
    drawMetricsGrid(metricItems, "Plano selecionado");
    y += 6;

    if (noteBox) {
      const noteHeight = noteBox.height + 10;
      drawRoundedCard(pdf, marginX + 8, y, contentWidth - 16, noteHeight, "soft");
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(6.4);
      setTextColor(pdf, palette.soft);
      pdf.text("OBSERVACOES COMERCIAIS", marginX + 12, y + 6.2);
      drawTextLines(pdf, noteBox.lines, marginX + 12, y + 12, 8.4, 4.1, palette.text);
      y += noteHeight + 4;
    }

    y = Math.max(y, savedY + totalHeight + 5);
  };

  const drawComparisonCards = (items: PlanItem[]) => {
    const cards: GridCard[] = items.map((item) => {
      const featureSummary = normalizeFeatureList(item.featuresIncluded, [
        "Beneficios configuraveis no ambiente master.",
      ])
        .slice(0, 3)
        .join(" | ");
      return {
        eyebrow: item.accountLevel,
        title: `${item.name} - ${getPlanPrice(item, hidePrices)}`,
        body: `${item.description || item.subtitle}\n${featureSummary}`,
        accent: palette.blueSoft,
      };
    });
    drawCardGrid(cards, "Planos complementares", 2, 8);
  };

  const drawHighlightsList = () => {
    for (const item of highlights) {
      const textBox = measureText(pdf, item, contentWidth - 16, 9, 4.3);
      ensurePageSpace(textBox.height + 4, "Sintese de valor");
      drawCheckIcon(pdf, marginX + 3.4, y + 0.7, "light");
      drawTextLines(pdf, textBox.lines, marginX + 10, y + 1.1, 9, 4.3, palette.text);
      y += textBox.height + 3.6;
    }
  };

  const drawNextSteps = () => {
    for (let index = 0; index < implementationSteps.length; index += 1) {
      const textBox = measureText(pdf, implementationSteps[index], contentWidth - 18, 9.1, 4.4);
      ensurePageSpace(textBox.height + 6, "Proximos passos");
      drawNumberBadge(pdf, marginX + 4, y + 1.5, String(index + 1));
      drawTextLines(pdf, textBox.lines, marginX + 12, y + 2, 9.1, 4.4, palette.text);
      y += textBox.height + 4.6;
    }
  };

  const drawSignatureBlock = () => {
    const closingNote =
      "SIGAPRO | Proposta emitida com foco em governanca institucional, seguranca operacional e implantacao assistida.";
    const noteBox = measureText(pdf, closingNote, contentWidth - 12, 8.3, 4);
    const nameBox = measureText(pdf, signatureName, contentWidth - 12, 12, 5.1, "bold");
    const roleBox = measureText(pdf, signatureRole, contentWidth - 12, 9, 4.2);
    const emailBox = measureText(pdf, `E-mail: ${signatureEmail}`, contentWidth - 12, 8.8, 4.2);
    const dateBox = measureText(pdf, `Data: ${generatedAt}`, contentWidth - 12, 8.8, 4.2);
    const clientBox = measureText(
      pdf,
      `Cliente / Prefeitura: ${municipalityName}\nResponsavel local: ${municipalityPrimaryResponsibleName}\nCargo local: ${municipalityPrimaryResponsibleRole}`,
      contentWidth - 12,
      8.8,
      4.1,
    );
    const blockHeight = 32 + nameBox.height + roleBox.height + emailBox.height + dateBox.height + clientBox.height + noteBox.height;
    ensurePageSpace(blockHeight + 4, "Assinatura institucional");

    drawRoundedCard(pdf, marginX, y, contentWidth, blockHeight, "light");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7);
    setTextColor(pdf, palette.blue);
    pdf.text("ASSINATURA INSTITUCIONAL", marginX + 6, y + 8);
    setDrawColor(pdf, palette.ink);
    pdf.setLineWidth(0.3);
    pdf.line(marginX + 6, y + 19, marginX + 86, y + 19);

    let cursorY = y + 26;
    cursorY = drawTextLines(pdf, nameBox.lines, marginX + 6, cursorY, 12, 5.1, palette.ink, "bold");
    cursorY += 0.7;
    cursorY = drawTextLines(pdf, roleBox.lines, marginX + 6, cursorY, 9, 4.2, palette.text);
    cursorY += 0.4;
    cursorY = drawTextLines(pdf, emailBox.lines, marginX + 6, cursorY, 8.8, 4.2, palette.text);
    cursorY += 0.4;
    cursorY = drawTextLines(pdf, dateBox.lines, marginX + 6, cursorY, 8.8, 4.2, palette.text);
    cursorY += 1.2;
    cursorY = drawTextLines(pdf, clientBox.lines, marginX + 6, cursorY, 8.8, 4.1, palette.text);
    cursorY += 1.4;
    drawTextLines(pdf, noteBox.lines, marginX + 6, cursorY, 8.3, 4, palette.muted);
    y += blockHeight + 5;
  };

  setPageTheme("dark");
  drawLogoContain(pdf, topbarLogoAsset, marginX, 18, 28, 28, "dark");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.8);
  setTextColor(pdf, [191, 219, 254]);
  pdf.text(`SIGAPRO | ${templateTitle.toUpperCase()} | ${materialType.toUpperCase()}`, marginX + 32, 24.5);

  let coverY = 58;
  const coverTitleBox = measureText(pdf, "PROPOSTA INSTITUCIONAL", contentWidth, 28, 10.8, "bold");
  coverY = drawTextLines(pdf, coverTitleBox.lines, marginX, coverY, 28, 10.8, palette.white, "bold");
  coverY += 2;
  const coverSubtitleBox = measureText(
    pdf,
    "Sistema Integrado de Gestao e Aprovacao de Projetos",
    contentWidth,
    13.4,
    5.6,
  );
  coverY = drawTextLines(pdf, coverSubtitleBox.lines, marginX, coverY, 13.4, 5.6, [219, 234, 254]);
  coverY += 10;
  const proposalTitleBox = measureText(pdf, municipalityCoverTitle, contentWidth, 21, 8, "bold");
  coverY = drawTextLines(pdf, proposalTitleBox.lines, marginX, coverY, 21, 8, palette.white, "bold");
  coverY += 2;
  const proposalSubtitleBox = measureText(pdf, `${municipalityLocation} | Emissao ${generatedAt}`, 160, 10.6, 4.9);
  coverY = drawTextLines(pdf, proposalSubtitleBox.lines, marginX, coverY, 10.6, 4.9, [226, 232, 240]);
  coverY += 8;
  const coverMessageBox = measureText(
    pdf,
    "Material institucional para demonstracao comercial, alinhamento de escopo e fechamento consultivo junto ao municipio.",
    160,
    9.4,
    4.6,
  );
  coverY = drawTextLines(pdf, coverMessageBox.lines, marginX, coverY, 9.4, 4.6, [191, 219, 254]);

  const coverCardWidth = (contentWidth - 8) / 2;
  const coverCards: GridCard[] = [
    {
      eyebrow: "CLIENTE",
      title: customerLabel,
      body: "Prefeitura ou orgao em alinhamento comercial.",
      tone: "light",
    },
    {
      eyebrow: "CONTATO",
      title: contactLabel,
      body: "Interlocucao institucional da proposta.",
      tone: "light",
    },
    {
      eyebrow: "VALIDADE",
      title: proposalValidity,
      body: "Condicao sujeita ao fechamento do escopo.",
      tone: "light",
    },
    {
      eyebrow: "ASSINATURA",
      title: signatureName,
      body: `${signatureRole} | ${generatedAt}`,
      tone: "light",
    },
  ];

  let coverCardsY = Math.max(162, coverY + 18);
  for (let index = 0; index < coverCards.length; index += 2) {
    const rowCards = coverCards.slice(index, index + 2);
    const leftMetrics = computeCardHeight(pdf, rowCards[0], coverCardWidth, "light");
    const rightMetrics = rowCards[1]
      ? computeCardHeight(pdf, rowCards[1], coverCardWidth, "light")
      : leftMetrics;
    const rowHeight = Math.max(leftMetrics.height, rightMetrics.height);
    rowCards.forEach((card, cardIndex) => {
      const x = marginX + cardIndex * (coverCardWidth + 8);
      drawGridCard(pdf, x, coverCardsY, coverCardWidth, card, rowHeight);
    });
    coverCardsY += rowHeight + 7;
  }

  startBodyPage(
    "abertura e contexto",
    "Transformando a gestao urbana do seu municipio",
    "O SIGAPRO estrutura protocolo, analise, decisao tecnica e governanca em uma jornada institucional mais clara, segura e auditavel.",
  );
  drawNarrativeCard(
    "DESAFIO INSTITUCIONAL",
    "Processos urbanos exigem coordenacao, rastreabilidade e previsibilidade.",
    "Em muitos municipios, a rotina ainda convive com documentos descentralizados, filas pouco visiveis, trocas informais entre setores e baixa previsibilidade de prazo. Esse cenario amplia retrabalho, reduz capacidade de resposta e enfraquece a leitura executiva da operacao.",
    palette.ink,
  );
  drawNarrativeCard(
    "RESPOSTA SIGAPRO",
    "A plataforma converte complexidade em governanca operacional.",
    commercialMessage,
    palette.blue,
  );
  startBodyPage(
    "prefeitura em foco",
    `Contexto institucional de ${municipalityName}`,
    "Leitura executiva da prefeitura de referencia para apresentar a proposta com direcionamento comercial mais preciso, institucional e aderente ao cenario municipal.",
  );
  drawNarrativeCard(
    "LEITURA DO MUNICIPIO",
    municipalityNarrative,
    municipalityOperationFocus,
    palette.blue,
  );
  drawCardGrid(
    [
      {
        eyebrow: "PREFEITURA",
        title: municipalityName,
        body: `Base institucional da proposta. Contato comercial: ${contactLabel}.`,
        accent: palette.blueSoft,
      },
      {
        eyebrow: "LOCALIZACAO",
        title: municipalityLocation,
        body: `Ambiente digital: ${municipalitySubdomain}.sigapro.govtech`,
        accent: palette.tealSoft,
      },
      {
        eyebrow: "STATUS",
        title: municipalityStatus.toUpperCase(),
        body: `Plano de referencia: ${municipalityPlan}.`,
        accent: palette.amberSoft,
      },
      {
        eyebrow: "OPERACAO",
        title: municipalityModules.length > 0 ? municipalityModules.join(", ") : "Modulos em definicao",
        body: "Frentes institucionais consideradas para direcionar a proposta comercial.",
        accent: palette.roseSoft,
      },
    ],
    "Prefeitura em foco",
    2,
    8,
  );
  drawSectionHeading(
    "DADOS INSTITUCIONAIS",
    "Dados institucionais da Prefeitura",
    "Identificacao completa do cliente para reforcar a personalizacao da proposta comercial com base no cadastro real da prefeitura selecionada.",
  );
  drawCardGrid(
    [
      {
        eyebrow: "CADASTRO",
        title: municipalityName,
        body: `CNPJ: ${municipalityCnpj}\nEndereco: ${municipalityAddress}`,
        accent: palette.blueSoft,
      },
      {
        eyebrow: "LOCALIDADE",
        title: municipalityLocation,
        body: `Telefone: ${municipalityPhone}\nE-mail institucional: ${municipalityEmail}`,
        accent: palette.tealSoft,
      },
      {
        eyebrow: "SECRETARIA",
        title: municipalitySecretariat,
        body: `Diretoria responsavel: ${municipalityDirectorate}`,
        accent: palette.amberSoft,
      },
      {
        eyebrow: "RESPONSAVEL",
        title: municipalityPrimaryResponsibleName,
        body: `Cargo: ${municipalityPrimaryResponsibleRole}`,
        accent: palette.roseSoft,
      },
      {
        eyebrow: "ADMINISTRADOR",
        title: municipalityAdministratorName,
        body: `Contato: ${municipalityAdministratorEmail}`,
        accent: palette.blueSoft,
      },
      {
        eyebrow: "PLANO VINCULADO",
        title: leadPlan?.name || municipalityPlan,
        body: `Validade: ${proposalValidity}\nObservacoes: ${observations.trim() || notInformed}`,
        accent: palette.tealSoft,
      },
    ],
    "Dados institucionais da Prefeitura",
    2,
    8,
  );
  drawCardGrid(
    [
      {
        eyebrow: "USUARIOS",
        title: municipalityUsers > 0 ? String(municipalityUsers) : "Base inicial",
        body: "Quantidade de acessos considerados na leitura comercial institucional.",
        accent: palette.blueSoft,
      },
      {
        eyebrow: "PROCESSOS",
        title: municipalityProcesses > 0 ? String(municipalityProcesses) : "Fluxo em estruturacao",
        body: "Volume operacional estimado ou ja observado no ambiente institucional.",
        accent: palette.tealSoft,
      },
    ],
    "Prefeitura em foco",
    2,
    8,
  );
  drawSectionHeading(
    "SOBRE O SIGAPRO",
    "Uma plataforma institucional para protocolo, analise e gestao integrada",
    "O SIGAPRO foi desenhado para consolidar governanca, padronizar ritos tecnicos e fortalecer o controle operacional da Prefeitura.",
  );
  drawCardGrid(
    [
      {
        eyebrow: "PROTOCOLO DIGITAL",
        title: "Entrada institucional organizada",
        body: "Solicitacoes, anexos, historico e comunicacoes no mesmo ambiente, com visao por etapa.",
        accent: palette.blueSoft,
      },
      {
        eyebrow: "ANALISE TECNICA",
        title: "Decisao com fluxo padronizado",
        body: "Exigencias, pareceres, correcoes e validacoes com rastreabilidade integral e leitura segura.",
        accent: palette.tealSoft,
      },
      {
        eyebrow: "GESTAO FINANCEIRA",
        title: "Cobranca vinculada ao processo",
        body: "Taxas, guias e historico financeiro conectados a operacao e a conformidade institucional.",
        accent: palette.amberSoft,
      },
      {
        eyebrow: "GOVERNANCA",
        title: "Painel executivo e visibilidade",
        body: "Indicadores, prioridades, fila, prazo e produtividade com leitura forte para decisores.",
        accent: palette.roseSoft,
      },
    ],
    "Sobre o SIGAPRO",
    2,
    8,
  );

  startBodyPage(
    "diferenciais e plano",
    "Valor institucional para uma operacao mais previsivel",
    "Leitura comercial dos diferenciais do SIGAPRO e do plano selecionado para a Prefeitura.",
  );
  drawCardGrid(
    [
      {
        eyebrow: "DIFERENCIAL",
        title: "Protocolo digital institucional",
        body: "Entrada padronizada, documentacao organizada e leitura operacional por etapa.",
        accent: palette.blueSoft,
      },
      {
        eyebrow: "DIFERENCIAL",
        title: "Analise tecnica estruturada",
        body: "Fluxo com exigencias, retornos, pareceres e decisoes em trilha unica e auditavel.",
        accent: palette.tealSoft,
      },
      {
        eyebrow: "DIFERENCIAL",
        title: "Paineis executivos por perfil",
        body: "Leitura de fila, SLA, pendencias e produtividade para operacao e gestao.",
        accent: palette.amberSoft,
      },
      {
        eyebrow: "DIFERENCIAL",
        title: "Integracao com a rotina municipal",
        body: "Arquitetura pronta para Prefeitura, analistas, financeiro e responsaveis tecnicos.",
        accent: palette.roseSoft,
      },
    ],
    "Diferenciais",
    2,
    8,
  );
  drawSectionHeading(
    "PLANO SELECIONADO",
    leadPlan?.name || "Plano institucional em destaque",
    leadPlan?.description || "Leitura comercial do plano selecionado para a operacao da Prefeitura.",
  );
  drawPlanHighlight();

  startBodyPage(
    "beneficios e entrega",
    "Beneficios percebidos, implantacao guiada e proximos passos",
    "As secoes abaixo usam medicao real de altura, card flexivel e quebra de pagina preventiva para manter o PDF seguro.",
  );
  drawSectionHeading(
    "BENEFICIOS",
    "O que a Prefeitura passa a ganhar com a implantacao",
    "Cada beneficio cresce conforme o conteudo e continua em nova pagina quando necessario.",
  );
  drawCardGrid(
    benefitItems.map((item, index) => ({
      eyebrow: "BENEFICIO",
      title: item,
      body: "Entrega institucional orientada a governanca, previsibilidade operacional e melhoria da experiencia para equipes e responsaveis tecnicos.",
      accent: index % 2 === 0 ? palette.tealSoft : palette.blueSoft,
    })),
    "Beneficios",
    2,
    8,
  );
  drawSectionHeading(
    "ITENS FORA DO ESCOPO",
    "Tratativas comerciais adicionais",
    "Itens nao incluidos no pacote base permanecem visiveis de forma clara para evitar ruido comercial.",
  );
  excludedItems.forEach((item) => {
    drawNarrativeCard(
      "FORA DO ESCOPO",
      item,
      "Item passivel de expansao comercial, parametrizacao adicional ou escopo complementar conforme a necessidade institucional.",
      palette.amber,
    );
  });
  drawSectionHeading(
    "CONTEXTO DE IMPLANTACAO",
    "Ativacao guiada com seguranca para a operacao municipal",
    "A implantacao e conduzida em etapas orientadas para reduzir risco de adocao e consolidar a rotina institucional com mais previsibilidade.",
  );
  drawNarrativeCard(
    "IMPLANTACAO GUIADA",
    "Parametrizacao, ativacao e acompanhamento consultivo",
    "O processo contempla alinhamento tecnico, configuracao de perfis, estrutura de departamentos, ativacao assistida e leitura executiva da primeira rotina operacional.",
    palette.teal,
  );
  drawSectionHeading(
    "PROXIMOS PASSOS",
    "Fluxo proposto para fechamento e ativacao",
    "Sequencia sugerida para decisao comercial, implantacao e entrada em operacao.",
  );
  drawNextSteps();

  if (observations.trim()) {
    drawSectionHeading(
      "OBSERVACOES COMERCIAIS",
      "Condicoes adicionais da proposta",
      "Notas complementares para fechamento de escopo, suporte ou operacao.",
    );
    drawNarrativeCard("OBSERVACOES", "Condicoes complementares", observations.trim(), palette.blue);
  }

  startBodyPage(
    "comparativo e fechamento",
    "Leitura complementar dos planos e assinatura institucional",
    "Pagina final com comparativo opcional, sintese de valor e assinatura do responsavel master.",
  );
  if (comparisonPlans.length > 0) {
    drawSectionHeading(
      "PLANOS COMPLEMENTARES",
      "Comparativo para tomada de decisao",
      "Os planos complementares usam altura dinamica, logo proporcional e continuidade segura em cada pagina.",
    );
    drawComparisonCards(comparisonPlans);
  }
  if (highlights.length > 0) {
    drawSectionHeading(
      "SINTESE DE VALOR",
      "Pontos de valor percebido do SIGAPRO",
      "Bullets desenhados com shapes nativos do PDF para garantir compatibilidade em qualquer visualizador.",
    );
    drawHighlightsList();
  }
  drawSectionHeading(
    "ASSINATURA INSTITUCIONAL",
    "Fechamento profissional da proposta",
    "Bloco final com identificacao do responsavel master, data de emissao e assinatura institucional do SIGAPRO.",
  );
  drawSignatureBlock();

  const totalPages = pdf.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    drawFooter(page, totalPages);
  }

  return pdf.output("blob");
}
