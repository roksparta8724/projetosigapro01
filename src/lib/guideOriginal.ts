import { renderGuideOriginalPdf } from "@/lib/guidePdf";
import { backendClient } from "@/integrations/backend/databaseClient";
import { getSignedUrlForObjectStrict, uploadFile } from "@/integrations/r2/client";
import { type GuiaRecolhimentoOficialProps } from "@/components/GuiaRecolhimentoOficial";
import type { ProcessDocument } from "@/lib/platform";
import { isValidPixPayload } from "@/lib/pix";

export async function openLegacyGuideOriginal(documents: ProcessDocument[], code: string, target: Window) {
  const matches = documents.filter((doc) => doc.uploaded && doc.filePath &&
    (doc.mimeType === "application/pdf" || /\.pdf$/i.test(doc.fileName || "")) &&
    [code, `Guia ${code}`].some((name) =>
      (doc.fileName || "").replace(/\.pdf$/i, "").toUpperCase() === name.toUpperCase() ||
      (doc.label || "").toUpperCase() === name.toUpperCase()));
  if (matches.length !== 1) return false;
  const objectKey = matches[0].filePath!.replace(/^r2:/, "");
  const url = await getSignedUrlForObjectStrict({ bucket: "process-documents", objectKey });
  if (!url) throw new Error("PDF original legado indisponível.");
  target.location.replace(url);
  return true;
}

export type GuideOriginal = {
  id: string;
  municipality_id: string;
  process_id: string;
  guide_number: string;
  status: string;
  collection_mode_snapshot?: "sigapro" | "municipal_system" | null;
  amount: number;
  created_at: string;
  due_date: string;
  barcode?: string;
  digitable_line?: string;
  pix_code?: string;
  provider_environment?: "test" | "production";
  bank_reference?: string;
  bank_payment_id?: string;
  bank_status?: string;
  bank_status_detail?: string;
  bank_authenticated_at?: string;
  document_snapshot?: GuiaRecolhimentoOficialProps;
  original_pdf_key?: string;
  original_pdf_sha256?: string;
};

function originalObjectKey(original: GuideOriginal, sha256: string) {
  if (!original.process_id) throw new Error("Guia original sem vínculo persistente com o processo.");
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error("SHA-256 do PDF original inválido no Neon.");
  return `municipalities/${original.municipality_id}/processes/${original.process_id}/dam-originals/${original.id}/${sha256}.pdf`;
}

async function guideRpc(name: string, municipalityId: string, guideCode: string, extra = {}) {
  if (!backendClient || !municipalityId || !guideCode) throw new Error("Guia sem identificação municipal persistente.");
  const { data, error } = await backendClient.rpc(name, {
    _municipality_id: municipalityId, _guide_code: guideCode, ...extra,
  });
  if (error || !data?.id) throw new Error(error?.message || "Guia original não encontrada no Neon.");
  return data as GuideOriginal;
}

export function readGuideOriginal(municipalityId: string, guideCode: string) {
  return guideRpc("get_payment_guide_original_v1", municipalityId, guideCode);
}

export async function openStoredGuide(original: GuideOriginal, target: Window) {
  if (!original.original_pdf_key) return false;
  if (!original.original_pdf_sha256 || original.original_pdf_key !== originalObjectKey(original, original.original_pdf_sha256)) {
    throw new Error("A referência permanente do PDF original está inconsistente no Neon.");
  }
  const url = await getSignedUrlForObjectStrict({ bucket: "process-documents", objectKey: original.original_pdf_key });
  if (!url) throw new Error("PDF original indisponível no armazenamento. A guia não será regenerada.");
  target.location.replace(url);
  return true;
}

export async function archiveAndOpenGuide(
  municipalityId: string, props: GuiaRecolhimentoOficialProps, target: Window,
) {
  const code = props.guia.numeroGuia;
  let original = await readGuideOriginal(municipalityId, code);
  if (await openStoredGuide(original, target)) return;
  if (original.status === "compensada") throw new Error("Guia compensada sem PDF original arquivado. Não será recriada.");
  if (!isValidPixPayload(props.guia.pixPayload)) throw new Error("PIX Copia e Cola inválido; a DAM não será arquivada sem QR Code oficial verificável.");
  original = await guideRpc("freeze_payment_guide_document_v1", municipalityId, code, { _snapshot: props });
  if (await openStoredGuide(original, target)) return;
  if (!original.document_snapshot) throw new Error("Snapshot original não persistido.");
  if (!isValidPixPayload(original.document_snapshot.guia.pixPayload)) throw new Error("O snapshot persistido não contém PIX oficial válido.");
  const pdf = await renderGuideOriginalPdf(original.document_snapshot);
  const bytes = await pdf.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const objectKey = originalObjectKey(original, sha256);
  const uploaded = await uploadFile({ bucket: "process-documents", objectKey, file: new File([bytes], `${code}.pdf`, { type: "application/pdf" }) });
  if (uploaded.objectKey !== objectKey) throw new Error("O R2 não confirmou a chave permanente do PDF original.");
  // Concurrent opens converge to the first attached original, even if their
  // rendered PDF metadata differs. A failed attach never displays an unsaved PDF.
  original = await guideRpc("attach_payment_guide_original_v1", municipalityId, code, { _object_key: objectKey, _sha256: sha256 });
  if (!original.original_pdf_key || !original.original_pdf_sha256) {
    throw new Error("O Neon não confirmou o PDF original arquivado no R2.");
  }
  if (!await openStoredGuide(original, target)) throw new Error("PDF não vinculado à guia no Neon.");
}
