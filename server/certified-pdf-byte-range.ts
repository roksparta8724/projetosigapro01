import { createHash } from "node:crypto";
const hexHash=/^[0-9a-f]{64}$/;
const maxBytes=32*1024*1024;
export type PreparedSignatureRange = readonly [0, number, number, number];
function sha(bytes:Uint8Array){return createHash("sha256").update(bytes).digest("hex");}
/** Only accepts a server-prepared PDF with one explicitly reserved hexadecimal
 * Contents field in its final revision. This is not a PDF parser or CMS verifier.
 * Offsets must come from a trusted PDF signature-field writer, never the browser. */
export function inspectPreparedPdfSignature(bytes:Uint8Array, range:PreparedSignatureRange, expectedSha:string){
 if(bytes.length<64||bytes.length>maxBytes||!hexHash.test(expectedSha)||sha(bytes)!==expectedSha)throw Error("PDF_PREPARED_HASH_MISMATCH");
 const pdf=Buffer.from(bytes);
 if(!pdf.subarray(0,5).equals(Buffer.from("%PDF-"))||!pdf.subarray(-1024).toString("latin1").trimEnd().endsWith("%%EOF"))throw Error("PDF_STRUCTURE_INVALID");
 const [zero,start,end,tail]=range;
 if(!range.every(Number.isSafeInteger)||zero!==0||start<1||end<=start+2||end>pdf.length||tail!==pdf.length-end||tail<1)throw Error("PDF_BYTE_RANGE_INVALID");
 if(pdf[start]!==60||pdf[end-1]!==62)throw Error("PDF_CONTENTS_INVALID");
 const hole=pdf.subarray(start+1,end-1);
 if(hole.length%2!==0||hole.length<2048||hole.length>2*1024*1024||hole.some(v=>v!==48))throw Error("PDF_CONTENTS_NOT_EMPTY");
 const before=pdf.subarray(Math.max(0,start-128),start).toString("latin1");
 if(!/\/Contents\s*$/.test(before))throw Error("PDF_CONTENTS_INVALID");
 // Exact matching declaration in the bytes actually covered by the signature.
 const literal=pdf.subarray(0,start).toString("latin1");
 const matches=Array.from(literal.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g));
 const last=matches.at(-1);
 if(!last||last.slice(1).some((s,i)=>Number(s)!==range[i]))throw Error("PDF_BYTE_RANGE_DECLARATION_MISMATCH");
 const digest=createHash("sha256").update(pdf.subarray(0,start)).update(pdf.subarray(end)).digest();
 return {preparedPdfSha256:expectedSha,byteRangeSha256:digest.toString("hex"),digest,capacityBytes:hole.length/2};
}
/** Embeds raw CMS bytes without altering any signed bytes. Output is UNVERIFIED:
 * chain, signer identity, signature, revocation, PDF structure and policy must
 * still pass a separate cryptographic validator before official issuance. */
export function embedUnverifiedPkcs7(bytes:Uint8Array,range:PreparedSignatureRange,expectedSha:string,expectedRangeSha:string,cms:Uint8Array){
 const inspected=inspectPreparedPdfSignature(bytes,range,expectedSha);
 if(inspected.byteRangeSha256!==expectedRangeSha)throw Error("PDF_SIGNED_HASH_MISMATCH");
 if(cms.length<16||cms[0]!==0x30||cms.length>inspected.capacityBytes)throw Error("PDF_CMS_INVALID_OR_TOO_LARGE");
 const output=Buffer.from(bytes);
 const encoded=Buffer.from(cms).toString("hex").padEnd(inspected.capacityBytes*2,"0");
 output.write(encoded,range[1]+1,encoded.length,"ascii");
 const actual=createHash("sha256").update(output.subarray(0,range[1])).update(output.subarray(range[2])).digest("hex");
 if(actual!==expectedRangeSha)throw Error("PDF_SIGNED_BYTES_CHANGED");
 return {bytes:output,sha256:sha(output),byteRangeSha256:actual,verified:false as const};
}
