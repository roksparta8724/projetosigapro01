/**
 * SIGAPRO: a database key is not proof that the immutable DAM PDF exists.
 * Validate the actual private object bytes BEFORE confirming an upload.
 *
 * Never log, return, or persist the document body. Never silently replace a
 * paid guide's original. Both the platform R2 and a municipality BYOS S3 must
 * use this same proof.
 */
import {createHash} from "node:crypto";
import {GetObjectCommand,HeadObjectCommand,type S3Client} from "@aws-sdk/client-s3";

export const DAM_ORIGINAL_MAX_BYTES=25*1024*1024;
export const DAM_ORIGINAL_KEY=/^municipalities\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/processes\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/dam-originals\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([0-9a-f]{64})\.pdf$/i;
const HASH=/^[a-f0-9]{64}$/;

export type StoredDamIntegrityInput={
  bucket:string;
  objectKey:string;
  /** Municipal BYOS may prepend a server-resolved, private base path. */
  logicalObjectKey?:string;
  expectedSha256:string;
  expectedBytes:number;
};

/** Throws a fixed diagnostic; the caller must not expose provider errors. */
export async function assertStoredDamOriginal(
  client:S3Client,input:StoredDamIntegrityInput,
):Promise<void>{
  const logical=input.logicalObjectKey||input.objectKey;
  const match=DAM_ORIGINAL_KEY.exec(logical);
  const sha=String(input.expectedSha256||"").toLowerCase();
  if(!match ||
     !(input.objectKey===logical || input.objectKey.endsWith('/'+logical)) ||
     !HASH.test(sha) || match[4].toLowerCase()!==sha ||
     !Number.isSafeInteger(input.expectedBytes) ||
     input.expectedBytes<=5 || input.expectedBytes>DAM_ORIGINAL_MAX_BYTES ||
     !input.bucket)throw new Error("DAM_ORIGINAL_INVALID_CONTRACT");

  const head=await client.send(new HeadObjectCommand({
    Bucket:input.bucket,Key:input.objectKey,
  }));
  if(head.ContentLength!==input.expectedBytes ||
     String(head.ContentType||"").toLowerCase()!=="application/pdf" ||
     String(head.Metadata?.sha256||"").toLowerCase()!==sha)
    throw new Error("DAM_ORIGINAL_STORAGE_METADATA_MISMATCH");

  const response=await client.send(new GetObjectCommand({
    Bucket:input.bucket,Key:input.objectKey,
  }));
  if(!response.Body || !(Symbol.asyncIterator in response.Body))
    throw new Error("DAM_ORIGINAL_STORAGE_BODY_UNAVAILABLE");
  const hash=createHash("sha256");
  let total=0,first=Buffer.alloc(0);
  for await (const chunk of response.Body){
    const bytes=Buffer.from(chunk);
    total+=bytes.length;
    if(total>DAM_ORIGINAL_MAX_BYTES || total>input.expectedBytes)
      throw new Error("DAM_ORIGINAL_STORAGE_SIZE_MISMATCH");
    if(first.length<5)
      first=Buffer.concat([first,bytes.subarray(0,5-first.length)]);
    hash.update(bytes);
  }
  if(first.toString("ascii")!=="%PDF-" || total!==input.expectedBytes ||
     hash.digest("hex")!==sha)
    throw new Error("DAM_ORIGINAL_STORAGE_HASH_MISMATCH");
}
