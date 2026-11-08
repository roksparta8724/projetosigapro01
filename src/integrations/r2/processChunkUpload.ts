/**
 * File delivery larger than Vercel's request-body limit. A 2-MiB base64
 * chunk stays below 4.5 MiB; no R2 credentials, presigned URLs, or bearer
 * tokens are persisted. The backend verifies every part and entire SHA-256.
 */
export const PROCESS_UPLOAD_CHUNK_BYTES = 2 * 1024 * 1024;
export const PROCESS_UPLOAD_MAX_BYTES = 40 * 1024 * 1024;
export const PROCESS_INLINE_MAX_BYTES = 2_500_000;

const PROCESS_KEY = /^municipalities\/[a-f0-9-]{36}\/(?:protocols|habite-se|attachments|analysis|documents|comunique-se|qa-arquitetura)\/[a-f0-9-]{36}\/[a-f0-9-]{36}-[a-zA-Z0-9._-]{1,180}$/i;
const MIME: Record<string,string> = {
  pdf:"application/pdf", png:"image/png",
  jpg:"image/jpeg", jpeg:"image/jpeg", webp:"image/webp",
};
const ENDPOINT = "/api/r2-process-proxy-upload";

export function largeProcessAttachmentMime(input: {
  bucket:string; objectKey:string; file:Pick<File,"size"|"name"|"type">;
}): string | null {
  if (input.bucket !== "process-documents" ||
      input.file.size <= PROCESS_INLINE_MAX_BYTES) return null;
  if (!PROCESS_KEY.test(input.objectKey)) return null;
  const ext = input.objectKey.split(".").pop()?.toLowerCase() || "";
  const mime = MIME[ext];
  return mime && (!input.file.type || input.file.type === mime) ? mime : null;
}

function bytesToBase64(bytes:Uint8Array):string {
  let encoded = "";
  // String.fromCharCode(...bytes) spreads too many arguments for large PDFs.
  for (let i=0;i<bytes.length;i+=32768) {
    encoded += String.fromCharCode(...bytes.subarray(i,i+32768));
  }
  return btoa(encoded);
}
async function hexSha256(data:ArrayBuffer):Promise<string> {
  if (!crypto?.subtle) throw new Error("Este navegador não oferece verificação segura de arquivos.");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256",data));
  return Array.from(digest,b=>b.toString(16).padStart(2,"0")).join("");
}
async function postPart(body:Record<string,unknown>,token:string,timeoutMs=90000) {
  const controller = new AbortController();
  const timer = window.setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response = await fetch(ENDPOINT,{
      method:"POST",
      headers:{"Content-Type":"application/json",Authorization:"Bearer "+token},
      credentials:"same-origin",cache:"no-store",
      body:JSON.stringify(body),
      signal:controller.signal,
    });
    const data = await response.json().catch(()=>({})) as {
      ok?:boolean;objectKey?:string;publicUrl?:string;error?:string;
    };
    if (!response.ok || !data.ok) throw new Error(
      data.error || (response.status===401||response.status===403
        ? "Sessão sem autorização para enviar este documento."
        : "A etapa de envio do documento não foi confirmada."),
    );
    return data;
  } catch(error) {
    if (error instanceof DOMException && error.name==="AbortError") {
      throw new Error("A conexão expirou durante o envio em partes. Tente novamente.");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function uploadLargeProcessAttachment(
  input:{bucket:string;objectKey:string;file:File},
  authHeaders:()=>Promise<{Authorization?:string}>,
):Promise<{bucket:string;objectKey:string;publicUrl:string}> {
  const mime = largeProcessAttachmentMime(input);
  if (!mime) throw new Error(
    "O arquivo grande não corresponde a um documento PDF ou imagem permitida desta Prefeitura.",
  );
  if (input.file.size > PROCESS_UPLOAD_MAX_BYTES)
    throw new Error("Documento acima de 40 MB. Reduza o tamanho do PDF ou divida os anexos.");
  const headers = await authHeaders();
  const token = headers.Authorization?.replace(/^Bearer\s+/i,"").trim() || "";
  if (!token) throw new Error("Entre novamente no SIGAPRO para enviar arquivos grandes.");
  const uploadId = crypto.randomUUID();
  const base = {
    bucket:"process-documents",objectKey:input.objectKey,
    fileSize:input.file.size,contentType:mime,uploadId,
  };
  const count = Math.ceil(input.file.size/PROCESS_UPLOAD_CHUNK_BYTES);
  // Compute the whole-document digest before any writes. A mismatch at
  // finalize never turns an incomplete file into an official process annex.
  const fileSha256 = await hexSha256(await input.file.arrayBuffer());
  try {
    for (let i=0;i<count;i++) {
      const slice = input.file.slice(i*PROCESS_UPLOAD_CHUNK_BYTES,(i+1)*PROCESS_UPLOAD_CHUNK_BYTES);
      const bytes = await slice.arrayBuffer();
      const digest = await hexSha256(bytes);
      await postPart({...base,action:"chunk",chunkIndex:i,
        chunkSha256:digest,base64:bytesToBase64(new Uint8Array(bytes))},token);
    }
    const stored = await postPart({...base,action:"finalize",fileSha256},token,180000);
    if (stored.objectKey !== input.objectKey)
      throw new Error("O R2 não confirmou o arquivo no local de armazenamento esperado.");
    return {bucket:"process-documents",objectKey:input.objectKey,publicUrl:""};
  } catch(error) {
    // Best effort staging cleanup; the server always rechecks identity.
    await postPart({...base,action:"abort"},token,15000).catch(()=>undefined);
    throw error;
  }
}
