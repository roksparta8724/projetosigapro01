import {createHash} from "node:crypto";
import {prepareFirstPermitCertificateRevision,prepareSecondPermitCertificateRevision} from "./certified-pdf-incremental-revision.js";
import {assertEmbeddedCmsBytes,type PreparedSignatureRange} from "./certified-pdf-byte-range.js";
import {verifySandboxIcpPersonCms,type CmsTrustBundle} from "./certified-cms-preflight.js";
const sha=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
const digest=/^[a-f0-9]{64}$/;
type ArchivedSigner={expectedProfileCpf:string;expectedProviderCertificatePem:string;expectedCertificateSha256:string;expectedCmsSha256:string;capacityBytes?:number};
function embedded(pdf:Buffer,range:PreparedSignatureRange){
 const hex=pdf.subarray(range[1]+1,range[2]-1).toString("ascii");
 if(!/^[a-f0-9]+$/.test(hex)||hex.length%2)throw Error("PDF_ARCHIVED_CMS_INVALID");
 const bytes=Buffer.from(hex,"hex");
 if(bytes[0]!==0x30||bytes.length<16)throw Error("PDF_ARCHIVED_CMS_INVALID");
 let header=2,length=bytes[1];
 if(length>=128){
  const n=length&127;
  if(n<1||n>4||bytes[2]===0||2+n>bytes.length)throw Error("PDF_ARCHIVED_CMS_INVALID");
  header+=n;length=0;
  for(let i=0;i<n;i++)length=length*256+bytes[2+i];
  if(length<128)throw Error("PDF_ARCHIVED_CMS_INVALID");
 }
 const end=header+length;
 if(end<16||end>bytes.length||bytes.subarray(end).some(v=>v!==0))throw Error("PDF_ARCHIVED_CMS_INVALID");
 return bytes.subarray(0,end);
}
function verifyRevision(prepared:ReturnType<typeof prepareFirstPermitCertificateRevision>|ReturnType<typeof prepareSecondPermitCertificateRevision>,signed:Buffer,signer:ArchivedSigner,trust:CmsTrustBundle){
 if(!digest.test(signer.expectedCmsSha256)||!digest.test(signer.expectedCertificateSha256))throw Error("PDF_ARCHIVED_SIGNER_MANIFEST_INVALID");
 const cms=embedded(signed,prepared.range);
 if(sha(cms)!==signer.expectedCmsSha256)throw Error("PDF_ARCHIVED_CMS_HASH_MISMATCH");
 const proof=assertEmbeddedCmsBytes({preparedBytes:prepared.bytes,signedBytes:signed,range:prepared.range,preparedSha256:prepared.preparedPdfSha256,byteRangeSha256:prepared.byteRangeSha256,cmsDer:cms});
 const covered=Buffer.concat([signed.subarray(0,prepared.range[1]),signed.subarray(prepared.range[2])]);
 const verified=verifySandboxIcpPersonCms({mode:"icp_brasil",coveredBytes:covered,expectedByteRangeSha256:prepared.byteRangeSha256,cmsDer:cms,expectedProviderCertificatePem:signer.expectedProviderCertificatePem,expectedProfileCpf:signer.expectedProfileCpf,trust,requireCades:true});
 if(verified.certificateSha256!==signer.expectedCertificateSha256||verified.cmsSha256!==signer.expectedCmsSha256)throw Error("PDF_ARCHIVED_SIGNER_MANIFEST_MISMATCH");
 return {cms,proof,verified};
}
/** Independent read-only QA preflight for SIGAPRO's exact two-revision format.
 * All expected hashes, signer identities, certificates and trust come from
 * trusted archived manifests, not a browser request. Reconstruct both
 * revisions, verify both CAdES signatures and reject trailing revisions.
 * Current chain/CRL checks are not proof of historical LTV or PAdES policy.
 * Does not authorize official issuance or modify any municipal record. */
export function verifyArchivedTwoSignaturePermit(input:{
 originalBytes:Uint8Array;expectedOriginalSha256:string;finalBytes:Uint8Array;expectedFinalSha256:string;
 expectedDirectorRevisionSha256:string;director:ArchivedSigner;secretary:ArchivedSigner;trust:CmsTrustBundle;
}){
 const final=Buffer.from(input.finalBytes);
 if(final.length>32*1024*1024||!digest.test(input.expectedFinalSha256)||sha(final)!==input.expectedFinalSha256)throw Error("PDF_ARCHIVED_FINAL_HASH_MISMATCH");
 const first=prepareFirstPermitCertificateRevision({originalBytes:input.originalBytes,expectedOriginalSha256:input.expectedOriginalSha256,slot:"diretoria",capacityBytes:input.director.capacityBytes});
 const prior=final.subarray(0,first.bytes.length);
 if(!digest.test(input.expectedDirectorRevisionSha256)||sha(prior)!==input.expectedDirectorRevisionSha256)throw Error("PDF_ARCHIVED_DIRECTOR_HASH_MISMATCH");
 const director=verifyRevision(first,prior,input.director,input.trust);
 const second=prepareSecondPermitCertificateRevision({originalBytes:input.originalBytes,expectedOriginalSha256:input.expectedOriginalSha256,directorSignedBytes:prior,expectedDirectorSignedSha256:input.expectedDirectorRevisionSha256,directorCmsDer:director.cms,directorCapacityBytes:input.director.capacityBytes,capacityBytes:input.secretary.capacityBytes});
 const secretary=verifyRevision(second,final,input.secretary,input.trust);
 return {environment:"sandbox" as const,originalSha256:input.expectedOriginalSha256,finalSha256:secretary.proof.sha256,directorRevisionSha256:director.proof.sha256,directorCertificateSha256:director.verified.certificateSha256,secretaryCertificateSha256:secretary.verified.certificateSha256,bothCadesSignaturesVerified:true as const,originalBytesPreserved:true as const,pdfPolicyVerified:false as const,issuanceAuthorized:false as const};
}
