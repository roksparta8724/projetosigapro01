import {createHash} from "node:crypto";
import {GetObjectCommand,type S3Client} from "@aws-sdk/client-s3";

/** Verify the actual stored byte stream, not the caller's metadata or an ETag.
 * Bounds are checked before GET and while reading. No document bytes are logged.
 * Works with the platform R2 and a server-resolved municipal S3 object. */
export async function assertStoredDocumentBytes(client:S3Client,input:{
 bucket:string;objectKey:string;expectedSha256:string;expectedBytes:number;contentType:string;maxBytes:number;requirePdf?:boolean;
}){
 if(!input.bucket||!input.objectKey||!/^[a-f0-9]{64}$/.test(input.expectedSha256)||
    !Number.isSafeInteger(input.expectedBytes)||input.expectedBytes<1||
    !Number.isSafeInteger(input.maxBytes)||input.maxBytes>100*1024*1024||input.expectedBytes>input.maxBytes)
   throw Error("DOCUMENT_STORAGE_INVALID_CONTRACT");
 const response=await client.send(new GetObjectCommand({Bucket:input.bucket,Key:input.objectKey}));
 const body=response.Body;
 if(!body||!(Symbol.asyncIterator in body))throw Error("DOCUMENT_STORAGE_STREAM_UNAVAILABLE");
 const hash=createHash("sha256");
 let total=0,first=Buffer.alloc(0);
 try{
  if(response.ContentLength!==input.expectedBytes||
     String(response.ContentType||"").toLowerCase()!==input.contentType.toLowerCase())
   throw Error("DOCUMENT_STORAGE_METADATA_MISMATCH");
  for await(const chunk of body){
   const bytes=Buffer.from(chunk);
   total+=bytes.length;
   if(total>input.expectedBytes||total>input.maxBytes)throw Error("DOCUMENT_STORAGE_SIZE_MISMATCH");
   if(input.requirePdf&&first.length<5)first=Buffer.concat([first,bytes.subarray(0,5-first.length)]);
   hash.update(bytes);
  }
  const sha256=hash.digest("hex");
  if(total!==input.expectedBytes||sha256!==input.expectedSha256||
     (input.requirePdf&&first.toString("ascii")!=="%PDF-"))throw Error("DOCUMENT_STORAGE_HASH_MISMATCH");
  return {sha256,fileSizeBytes:total};
 } finally {
  if("destroy" in body&&typeof body.destroy==="function")body.destroy();
 }
}
