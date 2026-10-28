import { buildGuiaRecolhimentoOficialHtml, type GuiaRecolhimentoOficialProps } from "@/components/GuiaRecolhimentoOficial";

// Keep the bank's document snapshot and payment data unchanged. Only its
// visual A4 capture is reflowed; PDF originals already stored stay immutable.
export async function renderGuideOriginalPdf(props: GuiaRecolhimentoOficialProps): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:820px;height:1600px;border:0";
  frame.setAttribute("aria-hidden", "true");
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument!;
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

    // Fixed-height receipt/header boxes caused the original A4 overlap.
    // Let the sections grow to their actual contents BEFORE rendering.
    // A4 sizing is applied proportionally to the complete capture below.
    const reflow = doc.createElement("style");
    reflow.textContent = `
      .dam-sheet {
        height: auto !important;
        min-height: 286.5mm !important;
        max-height: none !important;
        overflow: visible !important;
      }
      .dam-stack { height: auto !important; }
      .dam-header-center, .dam-logo-box {
        height: auto !important;
        min-height: 64px !important;
      }
      .dam-receipt-header {
        height: auto !important;
        min-height: 24mm !important;
        max-height: none !important;
      }
      .dam-receipt-right .dam-receipt-row {
        height: auto !important;
        min-height: 12mm !important;
      }
      .dam-receipt-center,
      .dam-receipt-right .dam-receipt-row-label,
      .dam-receipt-right .dam-receipt-row-value {
        overflow: visible !important;
      }
      .dam-mini-value, .dam-receipt-title, .dam-receipt-subline,
      .dam-receipt-row-label, .dam-receipt-row-value, .dam-final-box,
      .dam-bank-auth-line, .dam-summary-value, .dam-pix-copy {
        white-space: normal !important;
        overflow-wrap: anywhere !important;
        word-break: break-word !important;
      }
      .dam-sheet, .dam-sheet * { box-sizing: border-box !important; }
    `;
    doc.head.appendChild(reflow);

    // Do not silently clip data, QR values, municipality names or tax rows.
    // Keep the real overflow check; the previous fixed A4 height was causing
    // a false failure even though a proportional full-page render was possible.
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
          : "cartão";
        throw new Error(
          "O PDF da guia excede os limites de " + section +
          ". Nenhum original foi arquivado. Revise os dados desta guia.",
        );
      }
    }

    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    pdf.setProperties({ title: `DAM ${props.guia.numeroGuia}`, subject: "Original da guia municipal" });
    const issuedAt = new Date(props.guia.dataDocumento || "2000-01-01T00:00:00.000Z");
    pdf.setCreationDate(Number.isNaN(issuedAt.getTime()) ? new Date("2000-01-01T00:00:00.000Z") : issuedAt);

    const pageWidth = 200;
    const availableHeight = 286.5;
    const capture = (element: HTMLElement) =>
      html2canvas(element, { scale: 3, backgroundColor: "#ffffff", logging: false });
    const addCanvas = (canvas: HTMLCanvasElement) => {
      // Same scale for X and Y: preserve the institutional cards and QR
      // aspect ratio, never squeeze the rendered document vertically.
      const naturalHeight = canvas.height / canvas.width * pageWidth;
      const fit = Math.min(1, availableHeight / naturalHeight);
      if (fit < 0.90) {
        throw new Error("O documento excede a capacidade legível da página A4. Nenhum original foi arquivado.");
      }
      const width = pageWidth * fit;
      pdf.addImage(
        canvas.toDataURL("image/png"), "PNG",
        5 + (pageWidth - width) / 2, 5,
        width, naturalHeight * fit,
      );
    };

    const sheetHeightMm = sheet.getBoundingClientRect().height /
      sheet.getBoundingClientRect().width * pageWidth;
    if (sheetHeightMm <= availableHeight / 0.90) {
      addCanvas(await capture(sheet));
    } else {
      // Rare long guides have a separate complete tax-page and payment-page.
      // A full block is never cut in the middle, and all charged rows survive.
      const top = sheet.querySelector<HTMLElement>(".dam-block-top");
      const bottom = sheet.querySelector<HTMLElement>(".dam-block-bottom");
      if (!top || !bottom) {
        throw new Error("A estrutura da guia A4 está incompleta. Nenhum original foi arquivado.");
      }
      addCanvas(await capture(top));
      pdf.addPage("a4", "portrait");
      addCanvas(await capture(bottom));
    }
    return pdf.output("blob");
  } finally {
    frame.remove();
  }
}
