import type { UrbanMetric } from "@/lib/urbanPrecheck";

export type UrbanTextSignal = {
  metric: UrbanMetric;
  label: string;
  text: string;
};

const SIGNALS: Array<{ metric: UrbanMetric; label: string; expression: RegExp }> = [
  { metric: "front_setback_m", label: "Recuo frontal", expression: /\b(?:recuo|afastamento)\s+frontal\b/i },
  { metric: "side_setback_m", label: "Recuo lateral", expression: /\b(?:recuo|afastamento)\s+(?:lateral|das?\s+laterais)\b/i },
  { metric: "rear_setback_m", label: "Recuo de fundos", expression: /\b(?:recuo|afastamento)\s+(?:de\s+)?fundos?\b/i },
  { metric: "occupancy_percent", label: "Taxa de ocupação", expression: /\btaxa\s+de\s+ocupa(?:ç|c)[aã]o\b/i },
  { metric: "permeability_percent", label: "Permeabilidade", expression: /\b(?:taxa\s+de\s+)?permeabilidade\b/i },
  { metric: "floor_area_ratio", label: "Coeficiente de aproveitamento", expression: /\bcoeficiente\s+de\s+aproveitamento\b/i },
  { metric: "height_m", label: "Altura máxima", expression: /\b(?:altura\s+(?:m[aá]xima|permitida)|gabarito)\b/i },
  { metric: "floor_count", label: "Pavimentos", expression: /\bpavimentos?\b/i },
];

function clean(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

export function suggestUrbanTextSignals(text: string): UrbanTextSignal[] {
  if (typeof text !== "string" || text.length > 10000) return [];
  const source = clean(text);
  return SIGNALS.filter((signal) => signal.expression.test(source))
    .map(({ metric, label }) => ({ metric, label, text: source.slice(0, 800) }));
}

/** Does not inspect a PDF or certify that its contents support the passage. */
export function buildUrbanTextEvidence(input: {
  documentId: string;
  fileName: string;
  documentVersion: number;
  fileHash?: string;
  page: number;
  excerpt: string;
}): string {
  const { documentId, fileName, documentVersion, page, excerpt, fileHash } = input;
  if (!/^[a-z0-9_-]{2,128}$/i.test(documentId)) {
    throw new Error("Identificador de documento inválido.");
  }
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) {
    throw new Error("Página do documento inválida.");
  }
  const name = clean(fileName);
  const passage = clean(excerpt);
  if (!name || name.length > 200 || passage.length < 10 || passage.length > 280) {
    throw new Error("Informe o documento e um trecho verificável de 10 a 280 caracteres.");
  }
  if (!Number.isSafeInteger(documentVersion) || documentVersion < 1) {
    throw new Error("Versão do documento inválida.");
  }
  const hash = typeof fileHash === "string" && /^[a-f0-9]{64}$/i.test(fileHash.trim())
    ? "; SHA-256 " + fileHash.trim().toLowerCase()
    : "";
  const reference = "Arquivo: " + name + "; versão " + documentVersion +
    "; página " + page + "; documento " + documentId + hash + "; trecho: " + passage;
  if (reference.length > 500) throw new Error("Referência longa demais para o registro.");
  return reference;
}

export function isUploadedPdfDocument(doc: {
  uploaded: boolean; fileName?: string; mimeType?: string; filePath?: string; previewUrl?: string;
}): boolean {
  if (!doc.uploaded || (!doc.filePath && !doc.previewUrl)) return false;
  return doc.mimeType === "application/pdf" ||
    (typeof doc.fileName === "string" && /\.pdf$/i.test(doc.fileName.trim()));
}
