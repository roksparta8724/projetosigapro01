import { renderGuideOriginalPdf } from "@/lib/guidePdf";
import { backendClient } from "@/integrations/backend/databaseClient";
import { getSignedUrlForObjectStrict, uploadFile } from "@/integrations/r2/client";
import { type GuiaRecolhimentoOficialProps } from "@/components/GuiaRecolhimentoOficial";
import type { ProcessDocument } from "@/lib/platform";
import { isValidPixPayload, pixPayloadAmountCents } from "@/lib/pix";
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
  paid?: boolean | null;
  collection_mode_snapshot?: "sigapro" | "municipal_system" | null;
  amount: number;
  created_at: string;
  due_date: string;
  barcode?: string;
  digitable_line?: string;
  pix_code?: string;
  provider_environment?: "test" | "production";
  payment_provider?: "mercado_pago" | "bank_direct" | "manual" | null;
  bank_reference?: string;
  bank_payment_id?: string;
  bank_status?: string;
  bank_status_detail?: string;
  bank_authenticated_at?: string;
  document_snapshot?: GuiaRecolhimentoOficialProps;
  original_pdf_key?: string;
  original_pdf_sha256?: string;
};

/** An already compensated guide may be viewed, never reopened for editing a draft. */
export function isGuideSettled(guide: { status?: string | null; paid?: boolean | null } | null | undefined): boolean {
  if (!guide) return false;
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

function guideCentavos(amount:unknown):number|null{
  // Neon NUMERIC can be deserialized as a decimal string by the Data API.
  // Disallow locale separators, exponent notation and fractional cents.
  if(typeof amount==="string"){
    if(!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(amount))return null;
    const [whole,fraction=""]=amount.split(".");
    const cents=Number(whole)*100+Number(fraction.padEnd(2,"0"));
    return Number.isSafeInteger(cents)&&cents>0?cents:null;
  }
  if(typeof amount!=="number"||!Number.isFinite(amount)||amount<=0)return null;
  const cents=Math.round(amount*100);
  return Number.isSafeInteger(cents)&&Math.abs(amount*100-cents)<0.000001?cents:null;
}

/** Don't trust the caller's PDF props or a misrouted Data API row. */
export function assertOriginalGuideIdentity(original:GuideOriginal,municipalityId:string,guideCode:string):void{
  if(original.municipality_id!==municipalityId||
      original.guide_number!==guideCode||
      !/^[A-Za-z0-9_-]{1,100}$/.test(original.id)||
      !/^[A-Za-z0-9_-]{1,100}$/.test(original.process_id)||
      !/^[A-Za-z0-9_-]{1,100}$/.test(municipalityId)||
      guideCentavos(original.amount)===null){
    throw new Error("Guia inconsistente com a Prefeitura, processo ou valor no Neon.");
  }
}

export function assertOfficialGuideDocument(
  original:GuideOriginal,props:GuiaRecolhimentoOficialProps,municipalityId:string,
):void{
  assertOriginalGuideIdentity(original,municipalityId,props.guia.numeroGuia);
  if(props.guia.nonPayablePreview)
    throw new Error("A prévia não pagável não pode ser arquivada como guia oficial.");
  const payable=props.guia.valorCobrado??props.guia.valorDocumento;
  if(guideCentavos(payable)!==guideCentavos(original.amount))
    throw new Error("O valor do PDF difere do valor persistido da guia no Neon.");
  const pix=String(props.guia.pixPayload||"").trim();
  const storedBank=normalizeOfficialBanking(original.barcode,original.digitable_line);
  const printedBank=normalizeOfficialBanking(props.guia.codigoBarras,props.guia.linhaDigitavel);
  // Boleto-only DAMs are valid: PIX is NOT mandatory if the registered bank
  // charge, barcode, line and order reference exactly match the Neon record.
  // A municipality's static PIX key is never a substitute for bank attestation.
  const bankMatches=Boolean(original.bank_reference &&
    original.payment_provider==="mercado_pago" &&
    original.provider_environment==="production" &&
    props.guia.bankReference===original.bank_reference &&
    storedBank.barcode && storedBank.digitableLine &&
    storedBank.barcode===printedBank.barcode &&
    storedBank.digitableLine===printedBank.digitableLine);
  // An actual Mercado Pago sandbox PIX order can be archived as a visibly
  // watermarked QA original, never as a production receivable. Its QR,
  // order, payment ID and amount must already be bound to the canonical
  // Neon guide by the restricted hosted PIX worker.
  const qaPixMatches=Boolean(
    original.provider_environment==="test" &&
    original.payment_provider==="mercado_pago" &&
    original.bank_reference && original.bank_payment_id &&
    original.pix_code &&
    props.guia.bankEnvironment==="test" &&
    props.guia.paymentProvider==="mercado_pago" &&
    props.guia.bankReference===original.bank_reference &&
    props.guia.bankPaymentId===original.bank_payment_id &&
    props.guia.pixPayload===original.pix_code &&
    props.guia.qaSandboxPixPayload===original.pix_code &&
    isValidPixPayload(original.pix_code)
  );
  if(original.provider_environment==="test" && !qaPixMatches && pix){
    throw new Error("PIX de teste exige order, pagamento e QR reais vinculados à guia no Neon.");
  }
  if(!pix){
    if(!bankMatches)
      throw new Error("DAM sem PIX só pode ser emitida com boleto bancário registrado e conferido no Neon.");
    return;
  }
  if(!isValidPixPayload(pix))
    throw new Error("PIX Copia e Cola inválido; a DAM não será arquivada.");
  const amount=pixPayloadAmountCents(pix);
  if(amount===null){
    // A dynamic PIX without embedded amount requires a bank-registered charge.
    if(!bankMatches && !qaPixMatches)
      throw new Error("PIX sem valor exige cobrança bancária registrada e vinculada à guia.");
  } else if(amount!==guideCentavos(original.amount))
    throw new Error("Valor do PIX divergente da guia original registrada no Neon.");
}

async function guideRpc(name: string, municipalityId: string, guideCode: string, extra = {}) {
  if (!backendClient || !municipalityId || !guideCode) throw new Error("Guia sem identificação municipal persistente.");
  const { data, error } = await backendClient.rpc(name, {
    _municipality_id: municipalityId, _guide_code: guideCode, ...extra,
  });
  if (error || !data?.id) throw new Error(error?.message || "Guia original não encontrada no Neon.");
  assertOriginalGuideIdentity(data as GuideOriginal, municipalityId, guideCode);
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
  if (isGuideSettled(original)) throw new Error("Guia paga sem PDF original arquivado. Não será recriada.");
  assertOfficialGuideDocument(original,props,municipalityId);
  original = await guideRpc("freeze_payment_guide_document_v1", municipalityId, code, { _snapshot: props });
  if (await openStoredGuide(original, target)) return;
  if (isGuideSettled(original))
    throw new Error("Guia paga sem PDF original arquivado. Não será recriada.");
  if (!original.document_snapshot) throw new Error("Snapshot original não persistido.");
  assertOfficialGuideDocument(original,original.document_snapshot,municipalityId);
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
