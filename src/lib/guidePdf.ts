import { buildGuiaRecolhimentoOficialHtml, type GuiaRecolhimentoOficialProps } from "@/components/GuiaRecolhimentoOficial";

export async function renderGuideOriginalPdf(props: GuiaRecolhimentoOficialProps): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:820px;height:1200px;border:0";
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
    const canvas = await html2canvas(sheet, { scale: 3, backgroundColor: "#ffffff", logging: false });
    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    pdf.setProperties({ title: `DAM ${props.guia.numeroGuia}`, subject: "Original da guia municipal" });
    const issuedAt = new Date(props.guia.dataDocumento || "2000-01-01T00:00:00.000Z");
    pdf.setCreationDate(Number.isNaN(issuedAt.getTime()) ? new Date("2000-01-01T00:00:00.000Z") : issuedAt);
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 5, 5, 200, 286.5);
    return pdf.output("blob");
  } finally { frame.remove(); }
}
