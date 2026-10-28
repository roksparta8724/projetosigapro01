import { renderGuideOriginalPdf } from "@/lib/guidePdf";
import { backendClient } from "@/integrations/backend/databaseClient";
import { getSignedUrlForObjectStrict, uploadFile } from "@/integrations/r2/client";
import { type GuiaRecolhimentoOficialProps } from "@/components/GuiaRecolhimentoOficial";
import type { ProcessDocument } from "@/lib/platform";
import { isValidPixPayload } from "@/lib/pix";
import { normalizeOfficialBanking } from "@/lib/bankCodes";

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
  paid?: boolean;
  collection_mode_snapshot?: "sigapro" | "municipal_system" | null;
  amount: number;
  created_at: string;
  due_date: string;
  barcode?: string;
  digitable_line?: string;
  pix_code?: string;
  provider_environment?: "test" | "production";
  payment_provider?: string | null;
  bank_reference?: string;
  bank_payment_id?: string;
  bank_status?: string;
  bank_status_detail?: string;
  bank_authenticated_at?: string;
  document_snapshot?: GuiaRecolhimentoOficialProps;
  original_pdf_key?: string;
  original_pdf_sha256?: string;
};

/** A compensated guide may only reopen its already archived original PDF. */
export function isGuideSettled(guide: Pick<GuideOriginal, "status" | "paid">): boolean {
  return guide.paid === true ||
    ["compensada", "paid", "pago", "confirmed", "confirmado"].includes(
      String(guide.status || "").trim().toLowerCase(),
    );
}

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

/**
 * A frozen QA guide may resume an interrupted PDF upload without contacting the
 * provider or re-binding its PIX. Require the exact original payment evidence;
 * never treat an administrative preview or a settled guide as a payable PDF.
 * Municipality/process access is separately checked by the authorized read RPC.
 */
export function canResumeQaFrozenGuide(original: GuideOriginal): boolean {
  const snapshot = original.document_snapshot;
  if (!snapshot?.guia || isGuideSettled(original) ||
      !original.bank_reference || original.provider_environment !== "test" ||
      original.payment_provider !== "mercado_pago" ||
      snapshot.guia.nonPayablePreview === true ||
      snapshot.guia.numeroGuia !== original.guide_number ||
      Number(snapshot.guia.valorDocumento) !== Number(original.amount) ||
      Number(snapshot.guia.valorCobrado) !== Number(original.amount)) {
    return false;
  }
  const bank = normalizeOfficialBanking(original.barcode, original.digitable_line);
  const paperBank = normalizeOfficialBanking(snapshot.guia.codigoBarras, snapshot.guia.linhaDigitavel);
  const matchingBoleto = Boolean(
    bank.barcode && bank.digitableLine &&
    bank.barcode === paperBank.barcode && bank.digitableLine === paperBank.digitableLine
  );
  const matchingPix = Boolean(
    isValidPixPayload(original.pix_code) && snapshot.guia.pixPayload === original.pix_code
  );
  return matchingBoleto || matchingPix;
}

export function hasVerifiableGuidePaymentData(props: GuiaRecolhimentoOficialProps): boolean {
  if (props.guia.nonPayablePreview) return false;
  if (isValidPixPayload(props.guia.pixPayload)) return true;
  const banking = normalizeOfficialBanking(props.guia.codigoBarras, props.guia.linhaDigitavel);
  return Boolean(banking.barcode && banking.digitableLine);
}

async function recheckSignedOrderAfterPdf(original: GuideOriginal): Promise<void> {
  if (original.provider_environment !== "production" ||
      original.payment_provider !== "mercado_pago" ||
      !original.bank_reference || !original.original_pdf_key) return;
  try {
    const auth = await backendClient.auth.getSession();
    const session = auth?.data?.session;
    const token = session?.access_token || session?.accessToken || session?.token || "";
    if (!token) return;
    await fetch("/api/mercadopago-webhook?mode=post-archive-reconcile", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",Accept: "application/json" },
      body: JSON.stringify({municipalityId:original.municipality_id,
        guideCode:original.guide_number}),cache: "no-store",
    });
  } catch {
    // Original remains readable; provider may resend the signed event.
  }
}

export async function archiveAndOpenGuide(
  municipalityId: string, props: GuiaRecolhimentoOficialProps, target: Window,
) {
  const code = props.guia.numeroGuia;
  let original = await readGuideOriginal(municipalityId, code);
  if (await openStoredGuide(original, target)) { await recheckSignedOrderAfterPdf(original); return; }
  if (isGuideSettled(original)) throw new Error("Guia compensada sem PDF original arquivado. Não será recriada.");
  // Boleto bancário e PIX são meios independentes. Um boleto confirmado pelo
  // provedor não precisa conter QR PIX para que seu PDF original seja aberto.
  // Documento não pagável de QA jamais pode ser arquivado como cobrança.
  // A Prefeitura's PIX configured in a browser is NOT proof of the payee.
  // Only a valid PIX already persisted for this exact Neon guide may appear
  // on an immutable original. A confirmed boleto remains valid without PIX.
  const persistedPix = String(original.pix_code || "").trim();
  const canonicalProps: GuiaRecolhimentoOficialProps = {
    ...props,
    guia: {
      ...props.guia,
      pixPayload: isValidPixPayload(persistedPix) ? persistedPix : "",
    },
  };
  if (!hasVerifiableGuidePaymentData(canonicalProps)) {
    throw new Error("Guia sem boleto bancário válido ou PIX oficial verificável; o PDF não será arquivado.");
  }
  original = await guideRpc("freeze_payment_guide_document_v1", municipalityId, code, { _snapshot: canonicalProps });
  if (await openStoredGuide(original, target)) { await recheckSignedOrderAfterPdf(original); return; }
  if (!original.document_snapshot) throw new Error("Snapshot original não persistido.");
  if (!hasVerifiableGuidePaymentData(original.document_snapshot)) {
    throw new Error("Snapshot sem boleto bancário consistente ou PIX oficial válido.");
  }
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
  await recheckSignedOrderAfterPdf(original);
}
