import {createHash} from "node:crypto";
import {inspectPreparedPdfSignature,assertEmbeddedCmsBytes,type PreparedSignatureRange} from "./certified-pdf-byte-range.js";
const sha=(b:Uint8Array)=>createHash("sha256").update(b).digest("hex");
const limit=32*1024*1024;
const hash=/^[a-f0-9]{64}$/;
type Xref={offset:number;size:number;root:number;info:number|null;id:string;entries:Map<number,number>};
function fail():never{throw Error("PDF_UNSUPPORTED_INCREMENTAL_SOURCE");}
/** Deliberately restricted to a trusted, unsigned, server-rendered PDF using
 * classic xref tables, generation zero and a flat page tree. Not a parser for
 * external PDFs. A persisted expected hash is mandatory. */
function readOriginal(source:Buffer):Xref{
 const raw=source.toString("latin1");
 const end=/startxref\s+(\d+)\s+%%EOF\s*$/.exec(raw);
 if(!end||!/^%PDF-1\.[3-7][\r\n]/.test(raw))return fail();
 const offset=Number(end[1]);
 if(!Number.isSafeInteger(offset)||offset<8||offset>=source.length)return fail();
 const section=raw.slice(offset,end.index);
 const x=/^xref\r?\n0 (\d+)\r?\n/.exec(section);
 if(!x)return fail();
 const size=Number(x[1]);
 if(!Number.isSafeInteger(size)||size<4||size>20000)return fail();
 const entries=new Map<number,number>();
 let cursor=x[0].length;
 for(let n=0;n<size;n++){
  const line=/^(\d{10}) (\d{5}) ([nf]) ?\r?\n/.exec(section.slice(cursor,cursor+24));
  if(!line)return fail();cursor+=line[0].length;
  const at=Number(line[1]);
  if(n===0){if(line[2]!=="65535"||line[3]!=="f")return fail();continue;}
  if(line[2]!=="00000"||line[3]!=="n"||at<8||at>=offset||!raw.startsWith(n+" 0 obj",at))return fail();
  entries.set(n,at);
 }
 const trailer=/^trailer\s*<<([\s\S]*?)>>\s*$/.exec(section.slice(cursor));
 if(!trailer||/\/(?:Encrypt|Prev|XRefStm)\b/.test(trailer[1]))return fail();
 const body=trailer[1],root=/\/Root\s+(\d+)\s+0\s+R\b/.exec(body),info=/\/Info\s+(\d+)\s+0\s+R\b/.exec(body),declared=/\/Size\s+(\d+)\b/.exec(body);
 const id=/\/ID\s*(\[\s*<[a-f0-9]+>\s*<[a-f0-9]+>\s*\])/i.exec(body)?.[1]||"";
 if(!root||!declared||Number(declared[1])!==size||!entries.has(Number(root[1]))||(info&&!entries.has(Number(info[1]))))return fail();
 return {offset,size,root:Number(root[1]),info:info?Number(info[1]):null,id,entries};
}
function dictionary(source:string,x:Xref,n:number){
 const offset=x.entries.get(n);if(offset===undefined)return fail();
 const body=new RegExp("^"+n+" 0 obj\\s*(<<[\\s\\S]*?>>)\\s*endobj\\b").exec(source.slice(offset,Math.min(offset+65536,x.offset)))?.[1];
 if(!body||/\bstream\b/.test(body)||/\/(?:Encrypt|JavaScript|JS|OpenAction|AA|Launch|RichMedia|XFA|Perms)\b/.test(body))return fail();
 return body;
}
function appendDict(body:string,extra:string){return body.slice(0,-2)+" "+extra+" >>";}
function xrefLine(offset:number){return String(offset).padStart(10,"0")+" 00000 n \n";}
/** Append a single invisible signature field without rewriting even one byte
 * of the trusted original. The CAdES subfilter describes the intended CMS
 * encoding; it is NOT evidence of a valid PAdES signature or official permit.
 * Existing forms/signatures, incremental sources and encrypted PDFs are
 * intentionally refused, not flattened. */
export function prepareFirstPermitCertificateRevision(input:{originalBytes:Uint8Array;expectedOriginalSha256:string;slot:"diretoria"|"secretaria";capacityBytes?:number}){
 const original=Buffer.from(input.originalBytes),capacity=input.capacityBytes??131072;
 if(original.length<64||original.length>limit-1024*1024||!hash.test(input.expectedOriginalSha256)||sha(original)!==input.expectedOriginalSha256)throw Error("PDF_ORIGINAL_HASH_MISMATCH");
 if(!["diretoria","secretaria"].includes(input.slot)||!Number.isSafeInteger(capacity)||capacity<1024||capacity>262144)throw Error("PDF_SIGNATURE_RESERVATION_INVALID");
 const x=readOriginal(original),raw=original.toString("latin1"),catalog=dictionary(raw,x,x.root);
 if(!/\/Type\s*\/Catalog\b/.test(catalog)||/\/AcroForm\b/.test(catalog))return fail();
 const pagesRef=/\/Pages\s+(\d+)\s+0\s+R\b/.exec(catalog);
 if(!pagesRef)return fail();
 const pages=dictionary(raw,x,Number(pagesRef[1])),kids=/\/Kids\s*\[((?:\s*\d+\s+0\s+R\s*)+)\]/.exec(pages),count=/\/Count\s+(\d+)\b/.exec(pages);
 if(!kids||!count||!/\/Type\s*\/Pages\b/.test(pages))return fail();
 const pageIds=Array.from(kids[1].matchAll(/(\d+)\s+0\s+R/g),m=>Number(m[1]));
 if(!pageIds.length||pageIds.length!==Number(count[1])||new Set(pageIds).size!==pageIds.length)return fail();
 const pageId=pageIds[0],page=dictionary(raw,x,pageId);
 if(!/\/Type\s*\/Page\b/.test(page)||!new RegExp("/Parent\\s+"+pagesRef[1]+"\\s+0\\s+R\\b").test(page)||/\/Annots\b/.test(page))return fail();
 // Refuse suspicious or already-signed original, even if a form is hidden.
 if(/\/(?:ByteRange|SubFilter|AcroForm|DocMDP|FieldMDP)\b/.test(raw))return fail();
 const widget=x.size,signature=x.size+1,form=x.size+2;
 const reserved="0000000000 0000000000 0000000000 0000000000";
 const objects=new Map<number,string>([
  [x.root,appendDict(catalog,"/AcroForm "+form+" 0 R")],
  [pageId,appendDict(page,"/Annots ["+widget+" 0 R]")],
  [widget,"<< /Type /Annot /Subtype /Widget /FT /Sig /T (SIGAPRO_"+input.slot+") /F 4 /Rect [0 0 0 0] /P "+pageId+" 0 R /V "+signature+" 0 R >>"],
  [signature,"<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /ETSI.CAdES.detached /ByteRange ["+reserved+"] /Contents <"+"0".repeat(capacity*2)+"> >>"],
  [form,"<< /Fields ["+widget+" 0 R] /SigFlags 3 >>"],
 ]);
 let appended="\n";const positions=new Map<number,number>();
 for(const [n,body] of [...objects].sort((a,b)=>a[0]-b[0])){
  positions.set(n,original.length+Buffer.byteLength(appended,"latin1"));appended+=n+" 0 obj\n"+body+"\nendobj\n";
 }
 const xrefOffset=original.length+Buffer.byteLength(appended,"latin1");
 appended+="xref\n";
 for(const [n,at] of positions)appended+=n+" 1\n"+xrefLine(at);
 appended+="trailer\n<< /Size "+(x.size+3)+" /Root "+x.root+" 0 R /Prev "+x.offset+(x.info!==null?" /Info "+x.info+" 0 R":"")+(x.id?" /ID "+x.id:"")+" >>\nstartxref\n"+xrefOffset+"\n%%EOF\n";
 const marker=appended.indexOf("/Contents <"+"0".repeat(32));
 if(marker<0||appended.indexOf(reserved)<0)return fail();
 const start=original.length+marker+"/Contents ".length,end=start+capacity*2+2;
 const range:PreparedSignatureRange=[0,start,end,original.length+appended.length-end];
 appended=appended.replace(reserved,range.map(n=>String(n).padStart(10,"0")).join(" "));
 const bytes=Buffer.concat([original,Buffer.from(appended,"latin1")]);
 const inspected=inspectPreparedPdfSignature(bytes,range,sha(bytes));
 if(!bytes.subarray(0,original.length).equals(original))throw Error("PDF_ORIGINAL_BYTES_CHANGED");
 return {bytes,range,originalSha256:input.expectedOriginalSha256,preparedPdfSha256:inspected.preparedPdfSha256,byteRangeSha256:inspected.byteRangeSha256,originalBytesPreserved:true as const,pdfPolicyVerified:false as const,issuanceAuthorized:false as const};
}

/** Prepare an additional secretary signature ONLY from our exact prior
 * director revision. The caller must supply archived bytes and persisted
 * manifest hashes from a trusted, independently verified prior signature.
 * This method checks serialization and preservation, not CMS trust/policy. */
export function prepareSecondPermitCertificateRevision(input:{
 originalBytes:Uint8Array;expectedOriginalSha256:string;directorSignedBytes:Uint8Array;
 expectedDirectorSignedSha256:string;directorCmsDer:Uint8Array;directorCapacityBytes?:number;capacityBytes?:number;
}){
 const previous=Buffer.from(input.directorSignedBytes),capacity=input.capacityBytes??131072;
 if(previous.length>limit-1024*1024||!hash.test(input.expectedDirectorSignedSha256)||sha(previous)!==input.expectedDirectorSignedSha256)throw Error("PDF_PREVIOUS_REVISION_HASH_MISMATCH");
 if(!Number.isSafeInteger(capacity)||capacity<1024||capacity>262144)throw Error("PDF_SIGNATURE_RESERVATION_INVALID");
 const first=prepareFirstPermitCertificateRevision({originalBytes:input.originalBytes,expectedOriginalSha256:input.expectedOriginalSha256,slot:"diretoria",capacityBytes:input.directorCapacityBytes});
 assertEmbeddedCmsBytes({preparedBytes:first.bytes,signedBytes:previous,range:first.range,preparedSha256:first.preparedPdfSha256,byteRangeSha256:first.byteRangeSha256,cmsDer:input.directorCmsDer});
 const original=Buffer.from(input.originalBytes),x=readOriginal(original),raw=original.toString("latin1"),catalog=dictionary(raw,x,x.root);
 const pagesId=Number(/\/Pages\s+(\d+)\s+0\s+R\b/.exec(catalog)?.[1]),pages=dictionary(raw,x,pagesId);
 const pageId=Number(/\/Kids\s*\[\s*(\d+)\s+0\s+R/.exec(pages)?.[1]),page=dictionary(raw,x,pageId);
 const priorXref=Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(previous.toString("latin1"))?.[1]);
 if(!Number.isSafeInteger(priorXref)||priorXref<=original.length||previous.subarray(priorXref,priorXref+4).toString()!=="xref")return fail();
 const directorWidget=x.size,form=x.size+2,widget=x.size+3,signature=x.size+4;
 const reserved="0000000000 0000000000 0000000000 0000000000";
 const objects=new Map<number,string>([
  [pageId,appendDict(page,"/Annots ["+directorWidget+" 0 R "+widget+" 0 R]")],
  [form,"<< /Fields ["+directorWidget+" 0 R "+widget+" 0 R] /SigFlags 3 >>"],
  [widget,"<< /Type /Annot /Subtype /Widget /FT /Sig /T (SIGAPRO_secretaria) /F 4 /Rect [0 0 0 0] /P "+pageId+" 0 R /V "+signature+" 0 R >>"],
  [signature,"<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /ETSI.CAdES.detached /ByteRange ["+reserved+"] /Contents <"+"0".repeat(capacity*2)+"> >>"],
 ]);
 let appended="\n";const positions=new Map<number,number>();
 for(const [n,body] of [...objects].sort((a,b)=>a[0]-b[0])){
  positions.set(n,previous.length+appended.length);appended+=n+" 0 obj\n"+body+"\nendobj\n";
 }
 const xrefOffset=previous.length+appended.length;
 appended+="xref\n";
 for(const [n,at] of positions)appended+=n+" 1\n"+xrefLine(at);
 appended+="trailer\n<< /Size "+(x.size+5)+" /Root "+x.root+" 0 R /Prev "+priorXref+(x.info!==null?" /Info "+x.info+" 0 R":"")+(x.id?" /ID "+x.id:"")+" >>\nstartxref\n"+xrefOffset+"\n%%EOF\n";
 const marker=appended.indexOf("/Contents <"+"0".repeat(32));
 if(marker<0||appended.indexOf(reserved)<0)return fail();
 const start=previous.length+marker+"/Contents ".length,end=start+capacity*2+2;
 const range:PreparedSignatureRange=[0,start,end,previous.length+appended.length-end];
 appended=appended.replace(reserved,range.map(n=>String(n).padStart(10,"0")).join(" "));
 const bytes=Buffer.concat([previous,Buffer.from(appended,"latin1")]);
 const inspected=inspectPreparedPdfSignature(bytes,range,sha(bytes));
 if(!bytes.subarray(0,previous.length).equals(previous))throw Error("PDF_PREVIOUS_REVISION_CHANGED");
 return {bytes,range,previousSha256:input.expectedDirectorSignedSha256,originalSha256:input.expectedOriginalSha256,preparedPdfSha256:inspected.preparedPdfSha256,byteRangeSha256:inspected.byteRangeSha256,previousRevisionBytesPreserved:true as const,pdfPolicyVerified:false as const,issuanceAuthorized:false as const};
}
