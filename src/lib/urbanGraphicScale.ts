/**
 * SIGAPRO IA — optional, manually calibrated 2-point PDF ruler.
 * Coordinates are fractions of the SAME rendered PDF page. The ruler never
 * infers actual scale from a drawing title, DPI, on-screen zoom, or A4 size.
 */
export type UrbanGraphicPoint = { x: number; y: number };
export type UrbanGraphicSegment = { a: UrbanGraphicPoint; b: UrbanGraphicPoint };
export type UrbanGraphicCalibration = {
  page: number;
  segment: UrbanGraphicSegment;
  referenceMeters: number;
};

function validPoint(point: UrbanGraphicPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) &&
    point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

export function urbanPageDistance(
  segment: UrbanGraphicSegment, width: number, height: number,
): number | null {
  if (!(width > 0 && height > 0) || !Number.isFinite(width) ||
      !Number.isFinite(height) || !validPoint(segment.a) || !validPoint(segment.b)) return null;
  return Math.hypot(
    (segment.b.x - segment.a.x) * width,
    (segment.b.y - segment.a.y) * height,
  );
}

export function measureUrbanGraphicDistance(input: {
  calibration: UrbanGraphicCalibration;
  measuredSegment: UrbanGraphicSegment;
  measuredPage: number;
  pageWidth: number;
  pageHeight: number;
}): number | null {
  const { calibration, measuredSegment, measuredPage, pageWidth, pageHeight } = input;
  if (!Number.isInteger(calibration.page) || calibration.page < 1 ||
      calibration.page !== measuredPage || !Number.isFinite(calibration.referenceMeters) ||
      calibration.referenceMeters <= 0 || calibration.referenceMeters > 1000) return null;
  const base = urbanPageDistance(calibration.segment, pageWidth, pageHeight);
  const measured = urbanPageDistance(measuredSegment, pageWidth, pageHeight);
  // Reject tiny selection pairs; clicking near-identical pixels magnifies error.
  if (base === null || measured === null || base < 12 || measured < 5) return null;
  const meters = measured * calibration.referenceMeters / base;
  return Number.isFinite(meters) && meters > 0 && meters <= 1000 ? meters : null;
}

export function parseUrbanKnownMeters(text: string): number | null {
  const normalized = String(text).trim();
  if (!/^\d{1,4}(?:[.,]\d{1,3})?$/.test(normalized)) return null;
  const meters = Number(normalized.replace(",", "."));
  return Number.isFinite(meters) && meters > 0 && meters <= 1000 ? meters : null;
}

export function buildUrbanGraphicEvidence(input: {
  documentId: string;
  fileName: string;
  version: number;
  fileHash?: string;
  page: number;
  calibration: UrbanGraphicCalibration;
  measuredSegment: UrbanGraphicSegment;
  measuredMeters: number;
}): string {
  if (!/^[a-z0-9_-]{2,128}$/i.test(input.documentId) ||
      !Number.isSafeInteger(input.version) || input.version < 1 ||
      !Number.isSafeInteger(input.page) || input.page < 1 ||
      input.page !== input.calibration.page) throw new Error("Origem da prancha inválida.");
  const title = input.fileName.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 85);
  if (!title || !Number.isFinite(input.measuredMeters) || input.measuredMeters <= 0) {
    throw new Error("Medição gráfica sem origem ou valor válido.");
  }
  const hash = input.fileHash && /^[a-f0-9]{64}$/i.test(input.fileHash)
    ? "; SHA-256 " + input.fileHash.toLowerCase() : "";
  const coords = (segment: UrbanGraphicSegment) =>
    [segment.a.x, segment.a.y, segment.b.x, segment.b.y]
      .map(v => Math.round(v * 10000) / 10000).join(",");
  const evidence = "Medição gráfica manual INDICATIVA; arquivo " + title +
    "; documento " + input.documentId + "; v" + input.version +
    "; página " + input.page + hash +
    "; calibração " + input.calibration.referenceMeters.toFixed(3) +
    " m nos pontos " + coords(input.calibration.segment) +
    "; medida " + input.measuredMeters.toFixed(3) +
    " m nos pontos " + coords(input.measuredSegment) +
    ". Analista deve conferir cotas, escala e geometria do PDF original.";
  if (evidence.length > 500) throw new Error("Referência gráfica ultrapassa 500 caracteres.");
  return evidence;
}
