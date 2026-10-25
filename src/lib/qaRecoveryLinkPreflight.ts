import { qaNativeMimeForKey, QA_NATIVE_MAX_PDF_BYTES } from "@/integrations/r2/qaNeonNative";

export type QaRecoveryCandidate = {
  objectKey: string;
  size: number;
  fileName: string;
};

function supportedMagic(type:string,bytes:Uint8Array) {
  if(type==="application/pdf")
    return bytes.length>=5&&new TextDecoder().decode(bytes.slice(0,5))==="%PDF-";
  if(type==="image/jpeg")
    return bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(type==="image/png")
    return bytes.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
  if(type==="image/webp")
    return bytes.length>=12&&new TextDecoder().decode(bytes.slice(0,4))==="RIFF"&&
      new TextDecoder().decode(bytes.slice(8,12))==="WEBP";
  return false;
}

/**
 * An orphaned S3 listing does not establish that a user can actually open the
 * bytes. Block a new process_documents association until QA Neon authorizes
 * reading the whole blob, and its format and S3 size agree. This verifies
 * readability, NOT its provenance or that it belongs to the selected process.
 */
export async function verifyQaRecoverableDocumentBeforeLink(
  candidate: QaRecoveryCandidate,
  readPrivateUrl: () => Promise<string>,
  dependencies?: {
    fetchUrl?: typeof fetch;
    revokeUrl?: (url:string)=>void;
  },
): Promise<void> {
  const format = qaNativeMimeForKey(candidate.objectKey);
  if(!format || qaNativeMimeForKey(candidate.fileName)!==format)
    throw new Error("O formato do documento recuperado não é compatível.");
  if(!Number.isSafeInteger(candidate.size)||candidate.size<1||
      candidate.size>QA_NATIVE_MAX_PDF_BYTES)
    throw new Error("O tamanho do documento recuperado é inválido.");
  const privateUrl=await readPrivateUrl();
  if(!privateUrl.startsWith("blob:"))
    throw new Error("A recuperação exige uma leitura privada autenticada no QA.");
  try {
    const response=await (dependencies?.fetchUrl ?? fetch)(privateUrl,{cache:"no-store"});
    if(!response.ok)throw new Error("O arquivo recuperado não pôde ser aberto.");
    const blob=await response.blob();
    if(blob.size!==candidate.size||blob.type!==format)
      throw new Error("O conteúdo armazenado não corresponde ao tamanho ou formato informado.");
    const header=new Uint8Array(await blob.slice(0,12).arrayBuffer());
    if(!supportedMagic(format,header))
      throw new Error("O documento recuperado possui assinatura de arquivo inválida.");
  } finally {
    (dependencies?.revokeUrl ?? ((url:string)=>URL.revokeObjectURL(url)))(privateUrl);
  }
}
