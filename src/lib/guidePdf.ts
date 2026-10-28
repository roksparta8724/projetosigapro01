import { buildGuiaRecolhimentoOficialHtml, type GuiaRecolhimentoOficialProps } from "@/components/GuiaRecolhimentoOficial";

/**
 * Captura SOMENTE uma folha A4. Dados bancários, valores, QR PIX e o snapshot
 * jurídico não são modificados. Nunca gerar uma segunda folha ou cortar campos.
 */
export async function renderGuideOriginalPdf(props: GuiaRecolhimentoOficialProps): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:820px;height:1700px;border:0";
  frame.setAttribute("aria-hidden", "true");
  document.body.appendChild(frame);

  try {
    const doc = frame.contentDocument;
    if (!doc) throw new Error("Não foi possível iniciar a folha A4 da guia.");
    doc.open();
    doc.write(buildGuiaRecolhimentoOficialHtml(props, { autoPrint: false }));
    doc.close();
    await doc.fonts.ready;
    await Promise.all(Array.from(doc.images).map(async (img) => {
      await img.decode();
      if (!img.naturalWidth) throw new Error("Brasão não carregado; PDF não arquivado.");
    }));

    const sheet = doc.querySelector<HTMLElement>(".dam-sheet");
    if (!sheet) throw new Error("Documento DAM sem página.");

    // A versão anterior aumentava cada célula e dividia o PDF em duas folhas.
    // Esta versão reduz apenas os excessos de padding e altura mínima na
    // captura, sem esmagar as fontes, distorcer brasão ou QR, ou omitir taxas.
    const compact = doc.createElement("style");
    compact.textContent = `
      .dam-sheet {
        height:auto !important; min-height:286.5mm !important;
        max-height:none !important; overflow:visible !important;
        padding:2.4mm !important;
      }
      .dam-sheet, .dam-sheet * { box-sizing:border-box !important; }
      .dam-stack { height:auto !important; gap:0.65mm !important; }
      .dam-header-center, .dam-logo-box { height:auto !important; min-height:59px !important; }
      .dam-subtitle-main, .dam-subtitle-side { padding:4px 6px !important; }
      .dam-subtitle-value { margin-top:2px !important; line-height:1.28 !important; }
      .dam-guide-tag { margin-top:2px !important; padding:2px 4px !important; }
      .dam-fields-grid { gap:1px !important; padding:1px !important; }
      .dam-field-label { padding:2px 4px !important; }
      .dam-field-value { min-height:20px !important; padding:3px 5px !important; }
      .dam-responsibility-cell { min-height:33px !important; padding:4px 6px !important; }
      .dam-responsibility-value { margin-top:2px !important; line-height:1.25 !important; }
      .dam-work-meta { padding:3px 6px !important; }
      .dam-reference { padding:3px 6px !important; }
      .dam-table-wrap { padding:2px 4px !important; }
      .dam-table th, .dam-table td { padding:3px !important; line-height:1.25 !important; }
      .dam-total-label, .dam-total-value { padding:3px 5px !important; }
      .dam-responsible-label, .dam-responsible-value { padding:3px 5px !important; }
      .dam-warning-row { padding:3px 6px !important; line-height:1.25 !important; }
      .dam-observation-row { min-height:24px !important; }
      .dam-observation-label, .dam-observation-value { padding:3px 6px !important; }
      .dam-summary-row { min-height:35px !important; }
      .dam-summary-cell { padding:5px 6px !important; }
      .dam-summary-value { margin-top:3px !important; }
      .dam-tear-line { margin:0.6mm 0 !important; }
      .dam-receipt-header {
        height:auto !important; min-height:21mm !important; max-height:none !important;
        grid-template-columns:28mm minmax(0,1fr) 58mm !important;
      }
      .dam-receipt-logo img { max-height:19.5mm !important; }
      .dam-receipt-center { padding:1.6mm 2.5mm !important; overflow:visible !important; }
      .dam-receipt-right .dam-receipt-row { height:auto !important; min-height:10.5mm !important; }
      .dam-receipt-right .dam-receipt-row-label,
      .dam-receipt-right .dam-receipt-row-value { padding:1.4mm !important; overflow:visible !important; }
      .dam-receipt-left > .dam-receipt-row,
      .dam-receipt-amounts > .dam-receipt-row { min-height:7mm !important; }
      .dam-receipt-left .dam-receipt-row-label,
      .dam-receipt-left .dam-receipt-row-value,
      .dam-receipt-amounts > .dam-receipt-row > .dam-receipt-row-label,
      .dam-receipt-amounts > .dam-receipt-row > .dam-receipt-row-value {
        padding:3px 5px !important; line-height:1.3 !important;
      }
      .dam-note, .dam-auth { padding:4px 6px !important; }
      .dam-qr-wrap { padding:4px !important; }
      .dam-qr-sandbox .dam-qrcode-box { min-height:29mm !important; }
      .dam-qr-sandbox .dam-qrcode-box svg { width:112px !important; height:112px !important; }
      .dam-bottom-section { min-height:8mm !important; padding:3px 6px !important; }
      .dam-barcode-box.dam-barcode-unavailable { height:8mm !important; }
      .dam-final-left, .dam-final-right, .dam-footer-left, .dam-footer-right {
        padding:4px 6px !important;
      }
      .dam-final-area { min-height:16mm !important; }
      .dam-final-box { min-height:9mm !important; padding:4px 5px !important; }
      .dam-final-right-box { min-height:9mm !important; }
      .dam-auth-box { min-height:11mm !important; }
      .dam-mini-value, .dam-receipt-title, .dam-receipt-subline,
      .dam-receipt-row-label, .dam-receipt-row-value, .dam-final-box,
      .dam-bank-auth-line, .dam-summary-value, .dam-pix-copy {
        white-space:normal !important; overflow-wrap:anywhere !important;
        word-break:break-word !important;
      }
    `;
    doc.head.appendChild(compact);

    // Rejeitar apenas cortes reais dentro dos cartões. O PDF nunca deve
    // arquivar textos extravasando limites; a folha é ajustada proporcionalmente.
    const elements = [
      sheet,
      ...Array.from(sheet.querySelectorAll<HTMLElement>(
        ".dam-block, .dam-header-right, .dam-mini-cell, .dam-field, " +
        ".dam-responsibility-cell, .dam-summary-cell, .dam-receipt-center, " +
        ".dam-receipt-row, .dam-receipt-row-value, .dam-pix-copy, .dam-final-box",
      )),
    ];
    for (const element of elements) {
      const tolerance = 2;
      if (
        element.scrollWidth > element.clientWidth + tolerance ||
        element.scrollHeight > element.clientHeight + tolerance
      ) {
        const section = typeof element.className === "string"
          ? element.className.trim().split(/\\s+/).slice(0, 2).join(".")
          : "card";
        throw new Error("Conteúdo excede o " + section + " da guia A4; nenhum original foi arquivado.");
      }
    }

    const canvas = await html2canvas(sheet, {
      scale:3, backgroundColor:"#ffffff", logging:false,
    });
    const pdf = new jsPDF({ unit:"mm", format:"a4", compress:true });
    pdf.setProperties({ title:`DAM ${props.guia.numeroGuia}`, subject:"Guia municipal A4 — via única" });
    const issuedAt = new Date(props.guia.dataDocumento || "2000-01-01T00:00:00.000Z");
    pdf.setCreationDate(Number.isNaN(issuedAt.getTime())
      ? new Date("2000-01-01T00:00:00.000Z") : issuedAt);

    // Ajuste uniforme na folha, sem dupla página e sem deformação.
    const pageWidthMm = 200;
    const pageHeightMm = 286.5;
    const naturalHeightMm = canvas.height / canvas.width * pageWidthMm;
    const fit = Math.min(1, pageHeightMm / naturalHeightMm);
    if (fit < 0.72) {
      throw new Error(
        "Há conteúdo demais para uma guia A4 legível em uma única página. " +
        "Nenhum original foi arquivado: reduza o texto administrativo.",
      );
    }
    const widthMm = pageWidthMm * fit;
    const heightMm = naturalHeightMm * fit;
    pdf.addImage(
      canvas.toDataURL("image/png"), "PNG",
      5 + (pageWidthMm - widthMm) / 2, 5,
      widthMm, heightMm,
    );
    if (pdf.getNumberOfPages() !== 1) {
      throw new Error("Falha ao montar a via única A4; nenhum original foi arquivado.");
    }
    return pdf.output("blob");
  } finally {
    frame.remove();
  }
}
